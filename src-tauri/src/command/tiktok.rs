//! TikTok 直播采集。
//!
//! 通过 Python 运行 scripts/tiktok_bridge.py（基于 TikTokLive），脚本每行输出一个 JSON 事件，
//! 这里读取后合并成批推送给对应的窗口。每个窗口同时只有一个采集进程。

use crate::command::live::{hide_console, kill_child};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Manager, Window};

/// 采集进程：key 为窗口 label
struct TikTokProcess {
    session: u64,
    child: Child,
}

static PROCESSES: OnceLock<Mutex<HashMap<String, TikTokProcess>>> = OnceLock::new();
static SESSION_COUNTER: AtomicU64 = AtomicU64::new(1);
/// 本程序专用的 Python 独立环境(在应用数据目录下)。TikTokLive 装在这里，
/// 不会装进电脑上已有的 Python，也不受其他程序的 Python 环境影响
const PYTHON_ENV_DIR: &str = "python-env";

/// 事件合并推送的间隔
const FLUSH_INTERVAL: Duration = Duration::from_millis(100);
const BRIDGE_SCRIPT: &str = "scripts/tiktok_bridge.py";

fn processes() -> &'static Mutex<HashMap<String, TikTokProcess>> {
    PROCESSES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn new_command(program: &str) -> Command {
    let mut command = Command::new(program);
    hide_console(&mut command);
    command
}

/// 判断某个 Python 命令是否可用，并且版本不低于 3.10（TikTokLive 的要求）
fn python_works(parts: &[String]) -> bool {
    let Some((program, args)) = parts.split_first() else {
        return false;
    };
    new_command(program)
        .args(args)
        .args(["-c", "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Python 解释器的探测结果
#[derive(Default)]
struct PythonProbe {
    /// 版本不低于 3.10
    ok: bool,
    /// 是否是虚拟环境(其他程序自带的环境，不能往里面装东西)
    is_venv: bool,
    /// 虚拟环境对应的原始 Python
    base: String,
    /// 能否创建虚拟环境
    can_venv: bool,
    /// 是否带 pip
    has_pip: bool,
}

const PROBE_SCRIPT: &str = "import sys, json, importlib.util as u\n\
print(json.dumps({'ok': sys.version_info >= (3, 10), \
'venv': sys.prefix != sys.base_prefix, \
'base': getattr(sys, '_base_executable', '') or '', \
'can_venv': u.find_spec('venv') is not None and u.find_spec('ensurepip') is not None, \
'has_pip': u.find_spec('pip') is not None}))";

fn probe_python(parts: &[String]) -> Option<PythonProbe> {
    let (program, args) = parts.split_first()?;
    let output = new_command(program)
        .args(args)
        .args(["-c", PROBE_SCRIPT])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let value: Value = serde_json::from_str(text.trim().lines().last()?).ok()?;
    let flag = |key: &str| value.get(key).and_then(Value::as_bool).unwrap_or(false);
    Some(PythonProbe {
        ok: flag("ok"),
        is_venv: flag("venv"),
        base: value.get("base").and_then(Value::as_str).unwrap_or("").to_string(),
        can_venv: flag("can_venv"),
        has_pip: flag("has_pip"),
    })
}

/// Python 常见的安装位置：刚安装完时 PATH 还没有刷新到本程序，要直接按路径找
fn known_python_paths() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        roots.push(Path::new(&local).join("Programs").join("Python"));
    }
    for key in ["ProgramFiles", "ProgramW6432"] {
        if let Ok(dir) = std::env::var(key) {
            roots.push(PathBuf::from(dir));
        }
    }
    let mut found: Vec<PathBuf> = Vec::new();
    for root in roots {
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if name.starts_with("python3") {
                let exe = entry.path().join("python.exe");
                if exe.is_file() {
                    found.push(exe);
                }
            }
        }
    }
    // 版本高的优先
    found.sort();
    found.reverse();
    found
}

/// 查找可以用来创建独立环境的 Python。
/// 跳过其他程序的虚拟环境(改用它对应的原始 Python)，每次重新查找，
/// 用户装好 Python 后不需要重启程序
fn find_base_python() -> Option<Vec<String>> {
    let mut candidates: Vec<Vec<String>> = known_python_paths()
        .into_iter()
        .map(|p| vec![p.to_string_lossy().into_owned()])
        .collect();
    candidates.push(vec!["python".to_string()]);
    candidates.push(vec!["py".to_string(), "-3".to_string()]);
    for parts in candidates {
        let Some(probe) = probe_python(&parts) else {
            continue;
        };
        if !probe.ok {
            continue;
        }
        if !probe.is_venv {
            if probe.can_venv {
                return Some(parts);
            }
            continue;
        }
        // 虚拟环境：使用它对应的原始 Python
        if !probe.base.is_empty() && Path::new(&probe.base).is_file() {
            let base = vec![probe.base.clone()];
            if let Some(base_probe) = probe_python(&base) {
                if base_probe.ok && !base_probe.is_venv && base_probe.can_venv {
                    return Some(base);
                }
            }
        }
    }
    None
}

/// 独立环境的目录和其中的 python.exe
fn env_dir(handle: &AppHandle) -> Result<PathBuf, String> {
    let dir = handle
        .path_resolver()
        .app_data_dir()
        .ok_or_else(|| "无法获取应用数据目录".to_string())?;
    Ok(dir.join(PYTHON_ENV_DIR))
}

fn env_python(handle: &AppHandle) -> Result<PathBuf, String> {
    let dir = env_dir(handle)?;
    Ok(if cfg!(target_os = "windows") {
        dir.join("Scripts").join("python.exe")
    } else {
        dir.join("bin").join("python3")
    })
}

/// 运行采集用的 Python：设置里填了路径就用它，否则用独立环境。
/// 返回 Ok(None) 表示独立环境还没有创建
fn runtime_python(handle: &AppHandle, custom: Option<&str>) -> Result<Option<Vec<String>>, String> {
    if let Some(custom) = custom.map(str::trim).filter(|s| !s.is_empty()) {
        let parts = vec![custom.to_string()];
        if python_works(&parts) {
            return Ok(Some(parts));
        }
        return Err(format!(
            "设置里填写的 Python 不可用，或者版本低于 3.10: {}",
            custom
        ));
    }
    let exe = env_python(handle)?;
    let parts = vec![exe.to_string_lossy().into_owned()];
    Ok((exe.is_file() && python_works(&parts)).then_some(parts))
}

fn command_from(parts: &[String]) -> Command {
    let mut command = new_command(&parts[0]);
    command.args(&parts[1..]);
    // 让 Python 输出使用 UTF-8
    command.env("PYTHONIOENCODING", "utf-8").env("PYTHONUTF8", "1");
    command
}

/// 运行命令，失败时返回最后几行错误输出
fn run_checked(mut command: Command, what: &str) -> Result<(), String> {
    let output = command
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("{}失败: {}", what, e))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let text = if stderr.trim().is_empty() { stdout } else { stderr };
    let tail: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).rev().take(6).collect();
    Err(format!(
        "{}失败:\n{}",
        what,
        tail.into_iter().rev().collect::<Vec<_>>().join("\n")
    ))
}

/// 桥接脚本的路径
fn bridge_script(handle: &AppHandle) -> Result<PathBuf, String> {
    let path = handle
        .path_resolver()
        .resolve_resource(BRIDGE_SCRIPT)
        .ok_or_else(|| "找不到 TikTok 采集脚本".to_string())?;
    // 去掉 Windows 的 \\?\ 前缀，部分程序不认识
    let text = path.to_string_lossy();
    Ok(match text.strip_prefix(r"\\?\") {
        Some(stripped) => PathBuf::from(stripped),
        None => path,
    })
}

/// 结束某个窗口的采集进程
pub fn stop_for_window(label: &str) {
    let process = processes().lock().ok().and_then(|mut map| map.remove(label));
    if let Some(mut process) = process {
        let _ = kill_child(&mut process.child);
        let _ = process.child.wait();
    }
}

/// 结束所有采集进程（程序退出时调用）
pub fn stop_all() {
    let all: Vec<TikTokProcess> = match processes().lock() {
        Ok(mut map) => map.drain().map(|(_, p)| p).collect(),
        Err(_) => return,
    };
    for mut process in all {
        let _ = kill_child(&mut process.child);
        let _ = process.child.wait();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TikTokEnv {
    /// 是否找到可用的 Python
    python: bool,
    /// 找不到 Python 时的原因
    python_error: Option<String>,
    /// TikTokLive 是否已安装
    installed: bool,
}

/// 检查 TikTok 采集环境
#[tauri::command]
pub async fn check_tiktok_env(handle: AppHandle, python: Option<String>) -> Result<TikTokEnv, String> {
    tauri::async_runtime::spawn_blocking(move || {
        match runtime_python(&handle, python.as_deref()) {
            Err(e) => Ok(TikTokEnv {
                python: false,
                python_error: Some(e),
                installed: false,
            }),
            Ok(Some(parts)) => {
                let installed = command_from(&parts)
                    .args(["-c", "import TikTokLive"])
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status()
                    .map(|s| s.success())
                    .unwrap_or(false);
                Ok(TikTokEnv {
                    python: true,
                    python_error: None,
                    installed,
                })
            }
            // 独立环境还没创建：有可用的 Python 就能创建
            Ok(None) => {
                let found = find_base_python().is_some();
                Ok(TikTokEnv {
                    python: found,
                    python_error: (!found).then(|| "没有找到 Python 3.10 或以上版本".to_string()),
                    installed: false,
                })
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------------------
// 自动安装 Python
// ---------------------------------------------------------------------------

/// 安装的 Python 版本与安装包校验值(和 python.org 官方文件一致)
const PYTHON_VERSION: &str = "3.12.10";
const PYTHON_INSTALLER_SHA256: &str =
    "67b5635e80ea51072b87941312d00ec8927c4db9ba18938f7ad2d27b328b95fb";
/// 下载地址：国内镜像优先，官方地址兜底。文件都会按校验值验证
const PYTHON_INSTALLER_URLS: [&str; 3] = [
    "https://registry.npmmirror.com/-/binary/python/3.12.10/python-3.12.10-amd64.exe",
    "https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe",
    "https://mirrors.huaweicloud.com/python/3.12.10/python-3.12.10-amd64.exe",
];

fn emit_install_progress(window: &Window, stage: &str, percent: Option<u64>, message: &str) {
    let _ = window.emit(
        "python-install-progress",
        json!({ "stage": stage, "percent": percent, "message": message }),
    );
}

/// 下载安装包并校验，成功返回 true
async fn download_installer(
    window: &Window,
    client: &reqwest::Client,
    url: &str,
    target: &Path,
) -> Result<(), String> {
    let mut response = client
        .get(url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("下载失败: {}", e))?;
    let total = response.content_length();
    let mut file = std::fs::File::create(target).map_err(|e| format!("创建文件失败: {}", e))?;
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    let mut last_percent = u64::MAX;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("下载中断: {}", e))?
    {
        hasher.update(&chunk);
        file.write_all(&chunk)
            .map_err(|e| format!("写入文件失败: {}", e))?;
        downloaded += chunk.len() as u64;
        if let Some(total) = total.filter(|t| *t > 0) {
            let percent = downloaded * 100 / total;
            if percent != last_percent {
                last_percent = percent;
                emit_install_progress(window, "download", Some(percent), "正在下载 Python");
            }
        }
    }
    drop(file);
    let digest = hasher
        .finalize()
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<String>();
    if digest != PYTHON_INSTALLER_SHA256 {
        let _ = std::fs::remove_file(target);
        return Err("安装包校验失败，文件可能被篡改或下载不完整".to_string());
    }
    Ok(())
}

/// 下载并安装 Python（仅当前用户，不需要管理员权限，自动加入 PATH）
#[tauri::command]
pub async fn install_python(window: Window, proxy: Option<String>) -> Result<(), String> {
    if !cfg!(target_os = "windows") {
        return Err("当前系统不支持自动安装，请手动安装 Python 3.10 或以上版本".to_string());
    }
    let mut builder = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(600));
    if let Some(proxy) = proxy.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        builder = builder.proxy(reqwest::Proxy::all(proxy).map_err(|e| format!("代理地址无效: {}", e))?);
    }
    let client = builder.build().map_err(|e| e.to_string())?;
    let installer = std::env::temp_dir().join(format!("giccoobox-python-{}-amd64.exe", PYTHON_VERSION));

    // 依次尝试各个下载地址
    let mut errors: Vec<String> = Vec::new();
    let mut downloaded = false;
    for url in PYTHON_INSTALLER_URLS {
        emit_install_progress(&window, "download", Some(0), "正在下载 Python");
        match download_installer(&window, &client, url, &installer).await {
            Ok(()) => {
                downloaded = true;
                break;
            }
            Err(e) => errors.push(e),
        }
    }
    if !downloaded {
        return Err(format!("Python 下载失败:\n{}", errors.join("\n")));
    }

    emit_install_progress(&window, "install", None, "正在安装 Python");
    let installer_path = installer.clone();
    let status = tauri::async_runtime::spawn_blocking(move || {
        new_command(&installer_path.to_string_lossy())
            .args([
                "/quiet",
                "InstallAllUsers=0",
                "PrependPath=1",
                "Include_launcher=0",
                "Include_test=0",
                "Include_doc=0",
                "Shortcuts=0",
            ])
            .stdin(Stdio::null())
            .status()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("运行 Python 安装程序失败: {}", e));
    let _ = std::fs::remove_file(&installer);
    let status = status?;
    // 3010 表示安装成功但建议重启电脑，不影响使用
    if !status.success() && status.code() != Some(3010) {
        return Err(format!("Python 安装失败，安装程序返回 {:?}", status.code()));
    }

    // 刚装好的 Python 不在本程序的 PATH 里，按安装位置重新查找
    if find_base_python().is_none() {
        return Err("Python 已安装，但没有找到 python.exe，请在设置里填写 Python 路径".to_string());
    }
    emit_install_progress(&window, "done", Some(100), "Python 安装完成");
    Ok(())
}

/// pip 安装源：没有设置代理时，官方源连不上就改用清华镜像
const PIP_MIRROR: &str = "https://pypi.tuna.tsinghua.edu.cn/simple";

/// 安装/升级 TikTokLive：默认装进本程序的独立环境，环境不存在时先创建
#[tauri::command]
pub async fn install_tiktok_env(
    handle: AppHandle,
    python: Option<String>,
    proxy: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let custom = python.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let proxy = proxy.as_deref().map(str::trim).filter(|s| !s.is_empty());

        let parts = match runtime_python(&handle, custom)? {
            Some(parts) => parts,
            None => {
                // 创建独立环境
                let base = find_base_python()
                    .ok_or_else(|| "没有找到 Python 3.10 或以上版本".to_string())?;
                let dir = env_dir(&handle)?;
                // 之前创建失败留下的残缺目录先删掉
                if dir.exists() {
                    let _ = std::fs::remove_dir_all(&dir);
                }
                if let Some(parent) = dir.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("创建数据目录失败: {}", e))?;
                }
                let mut command = command_from(&base);
                command.args(["-m", "venv"]).arg(&dir);
                run_checked(command, "创建 Python 独立环境")?;
                runtime_python(&handle, None)?
                    .ok_or_else(|| "Python 独立环境创建后无法使用".to_string())?
            }
        };

        // 没有 pip 时先补上
        if !probe_python(&parts).map(|p| p.has_pip).unwrap_or(false) {
            let mut command = command_from(&parts);
            command.args(["-m", "ensurepip", "--upgrade"]);
            run_checked(command, "安装 pip")?;
        }

        // 安装 TikTokLive
        let pip_install = |index: Option<&str>| {
            let mut command = command_from(&parts);
            command.args([
                "-m",
                "pip",
                "install",
                "-U",
                "TikTokLive",
                "--disable-pip-version-check",
                "--timeout",
                "20",
            ]);
            if let Some(proxy) = proxy {
                command.args(["--proxy", proxy]);
            }
            if let Some(index) = index {
                command.args(["-i", index]);
            }
            run_checked(command, "安装 TikTokLive")
        };
        match pip_install(None) {
            Ok(()) => Ok(()),
            Err(e) if proxy.is_none() => pip_install(Some(PIP_MIRROR)).map_err(|e2| format!("{}\n\n{}", e, e2)),
            Err(e) => Err(e),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 开始采集。返回本次采集的会话号，界面只处理同一会话号的事件
#[tauri::command]
pub async fn start_tiktok(
    window: Window,
    unique_id: String,
    proxy: Option<String>,
    python: Option<String>,
) -> Result<u64, String> {
    let unique_id = unique_id.trim().to_string();
    if unique_id.is_empty() {
        return Err("请输入 TikTok 用户名或直播间地址".to_string());
    }
    let label = window.label().to_string();
    // 同一个窗口只保留一个采集进程
    stop_for_window(&label);

    let handle = window.app_handle();
    let script = bridge_script(&handle)?;
    let parts = runtime_python(&handle, python.as_deref())?
        .ok_or_else(|| "TikTok 运行环境还没有安装".to_string())?;
    let mut command = command_from(&parts);
    command.arg("-u").arg(&script).arg(&unique_id);
    if let Some(proxy) = proxy.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        command.args(["--proxy", proxy]);
    }
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动 TikTok 采集失败: {}", e))?;

    let session = SESSION_COUNTER.fetch_add(1, Ordering::Relaxed);
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    processes()
        .lock()
        .map_err(|_| "进程锁获取失败".to_string())?
        .insert(label.clone(), TikTokProcess { session, child });

    let buffer: Arc<Mutex<Vec<Value>>> = Arc::new(Mutex::new(Vec::new()));
    let finished = Arc::new(AtomicBool::new(false));

    // 读取事件
    if let Some(stdout) = stdout {
        let buffer = buffer.clone();
        let finished = finished.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                // 不是 JSON 的输出当作日志
                let value = serde_json::from_str::<Value>(line)
                    .unwrap_or_else(|_| json!({ "event": "log", "message": line }));
                if let Ok(mut buf) = buffer.lock() {
                    buf.push(value);
                }
            }
            if let Ok(mut buf) = buffer.lock() {
                buf.push(json!({ "event": "exit" }));
            }
            finished.store(true, Ordering::SeqCst);
        });
    } else {
        finished.store(true, Ordering::SeqCst);
    }

    // 脚本的调试输出：保留在程序的控制台里，出错时方便排查
    if let Some(stderr) = stderr {
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                eprintln!("[tiktok] {}", line);
            }
        });
    }

    // 合并推送
    {
        let handle = handle.clone();
        let label = label.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(FLUSH_INTERVAL);
            let done = finished.load(Ordering::SeqCst);
            let events = match buffer.lock() {
                Ok(mut buf) => std::mem::take(&mut *buf),
                Err(_) => break,
            };
            if !events.is_empty() {
                let _ = handle.emit_all(
                    "tiktok-event",
                    json!({ "window": label, "session": session, "events": events }),
                );
            }
            if done {
                // 进程自己退出了，清理记录（如果还是这个会话）
                if let Ok(mut map) = processes().lock() {
                    if map.get(&label).map(|p| p.session) == Some(session) {
                        if let Some(mut process) = map.remove(&label) {
                            let _ = process.child.wait();
                        }
                    }
                }
                break;
            }
        });
    }

    Ok(session)
}

/// 停止当前窗口的采集
#[tauri::command]
pub async fn stop_tiktok(window: Window) -> Result<(), String> {
    stop_for_window(window.label());
    Ok(())
}

/// 查询 TikTok 主播是否在直播。返回 None 表示查询失败，无法判断
#[tauri::command]
pub async fn check_tiktok_live(unique_id: String, proxy: Option<String>) -> Result<Option<bool>, String> {
    let unique_id = parse_unique_id(&unique_id);
    if unique_id.is_empty() {
        return Ok(Some(false));
    }
    let mut builder = reqwest::Client::builder().timeout(Duration::from_secs(10));
    if let Some(proxy) = proxy.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        builder = builder.proxy(reqwest::Proxy::all(proxy).map_err(|e| format!("代理地址无效: {}", e))?);
    }
    let client = builder.build().map_err(|e| e.to_string())?;
    let response = client
        .get("https://www.tiktok.com/api-live/user/room/")
        .query(&[
            ("aid", "1988"),
            ("app_name", "tiktok_web"),
            ("device_platform", "web_pc"),
            ("sourceType", "54"),
            ("uniqueId", unique_id.as_str()),
        ])
        .header(
            "user-agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        )
        .send()
        .await;
    let Ok(response) = response else {
        return Ok(None);
    };
    let Ok(body) = response.json::<Value>().await else {
        return Ok(None);
    };
    if body.get("message").and_then(Value::as_str) == Some("user_not_found") {
        return Ok(Some(false));
    }
    // liveRoom.status: 2 为直播中，4 为未开播
    let status = body
        .pointer("/data/liveRoom/status")
        .and_then(Value::as_i64);
    Ok(status.map(|s| s == 2))
}

/// 从直播间地址或 @用户名 中取出用户名
fn parse_unique_id(input: &str) -> String {
    let input = input.trim();
    let after_at = match input.find('@') {
        Some(index) => &input[index + 1..],
        None => input,
    };
    after_at
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("")
        .trim()
        .to_string()
}
