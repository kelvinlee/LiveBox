use crate::command::model::LiveInfo;
use crate::command::runner::DouYinReq;
use regex::Regex;
use serde::Serialize;
use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Read};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::AppHandle;
use tauri::Manager;

static NPM_PROCESS: OnceLock<Mutex<Option<Child>>> = OnceLock::new();
static EXE_PROCESS: OnceLock<Mutex<Option<Child>>> = OnceLock::new();

fn npm_process() -> &'static Mutex<Option<Child>> {
    NPM_PROCESS.get_or_init(|| Mutex::new(None))
}

fn exe_process() -> &'static Mutex<Option<Child>> {
    EXE_PROCESS.get_or_init(|| Mutex::new(None))
}

/// Windows 下不为子进程创建控制台窗口
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub(crate) fn hide_console(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = command;
    }
}

/// 后台日志：一行输出
#[derive(Clone, Serialize)]
pub struct BackendLog {
    /// 递增序号
    seq: u64,
    /// stdout / stderr / system(本程序产生的提示)
    stream: String,
    line: String,
}

struct BackendLogStore {
    next_seq: u64,
    /// 最近的日志
    logs: VecDeque<BackendLog>,
    /// 还没推送给界面的日志
    pending: Vec<BackendLog>,
    /// 本次推送周期内因为输出过快被省略的行数
    dropped: u64,
}

/// 最多保留的日志行数：新打开的窗口可以拿到最近的日志
const MAX_BACKEND_LOGS: usize = 2000;
/// 日志合并推送的间隔：不逐行推送，避免输出很快时把界面卡死
const LOG_FLUSH_INTERVAL: Duration = Duration::from_millis(250);
/// 每个推送周期最多推送的行数，超出的部分省略并给出提示
const MAX_LINES_PER_FLUSH: usize = 200;
/// 单行最大字节数，超长的行会被切成多行
const MAX_LOG_LINE_BYTES: u64 = 4096;

static LOG_FLUSHER: OnceLock<()> = OnceLock::new();

static BACKEND_LOGS: OnceLock<Mutex<BackendLogStore>> = OnceLock::new();
static ANSI_RE: OnceLock<Regex> = OnceLock::new();

fn backend_logs() -> &'static Mutex<BackendLogStore> {
    BACKEND_LOGS.get_or_init(|| {
        Mutex::new(BackendLogStore {
            next_seq: 1,
            logs: VecDeque::new(),
            pending: Vec::new(),
            dropped: 0,
        })
    })
}

/// 去掉终端颜色等 ANSI 控制字符
fn strip_ansi(line: &str) -> String {
    let re = ANSI_RE.get_or_init(|| Regex::new(r"\x1b\[[0-9;?]*[ -/]*[@-~]").unwrap());
    re.replace_all(line, "").into_owned()
}

impl BackendLogStore {
    fn push(&mut self, stream: &str, line: String, force: bool) {
        let log = BackendLog {
            seq: self.next_seq,
            stream: stream.to_string(),
            line,
        };
        self.next_seq += 1;
        if self.logs.len() >= MAX_BACKEND_LOGS {
            self.logs.pop_front();
        }
        self.logs.push_back(log.clone());
        // 输出过快时不再推送给界面，只计数
        if force || self.pending.len() < MAX_LINES_PER_FLUSH {
            self.pending.push(log);
        } else {
            self.dropped += 1;
        }
    }
}

/// 启动日志推送线程：定时把积累的日志一次性推送给所有窗口
fn ensure_log_flusher(handle: &AppHandle) {
    LOG_FLUSHER.get_or_init(|| {
        let handle = handle.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(LOG_FLUSH_INTERVAL);
            let batch = {
                let Ok(mut store) = backend_logs().lock() else {
                    continue;
                };
                if store.dropped > 0 {
                    let tip = format!("[输出过快，已省略 {} 行]", store.dropped);
                    store.dropped = 0;
                    store.push("system", tip, true);
                }
                std::mem::take(&mut store.pending)
            };
            if !batch.is_empty() {
                let _ = handle.emit_all("backend-log", batch);
            }
        });
    });
}

/// 记录一行后台日志，由推送线程合并后发给所有窗口
fn push_backend_log(handle: &AppHandle, stream: &str, line: &str) {
    ensure_log_flusher(handle);
    if let Ok(mut store) = backend_logs().lock() {
        // 本程序自己的提示不受限流影响
        store.push(stream, strip_ansi(line), stream == "system");
    }
}

/// 在独立线程里按行读取后台输出
fn spawn_log_reader<R: Read + Send + 'static>(
    handle: AppHandle,
    stream: &'static str,
    reader: R,
    notify_exit: bool,
) {
    std::thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut buf: Vec<u8> = Vec::new();
        loop {
            buf.clear();
            // 限制单次读取长度：没有换行的超长输出不会无限占用内存
            match (&mut reader)
                .take(MAX_LOG_LINE_BYTES)
                .read_until(b'\n', &mut buf)
            {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    // 输出不一定是合法 UTF-8，这里不做严格校验
                    let text = String::from_utf8_lossy(&buf);
                    let line = text.trim_end_matches(['\r', '\n']);
                    push_backend_log(&handle, stream, line);
                }
            }
        }
        if notify_exit {
            push_backend_log(&handle, "system", "[后台进程已退出]");
        }
    });
}

pub(crate) fn kill_child(child: &mut Child) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let pid = child.id().to_string();
        let mut taskkill = Command::new("taskkill");
        hide_console(&mut taskkill);
        let status = taskkill
            .args(["/PID", pid.as_str(), "/T", "/F"])
            .status()
            .map_err(|e| format!("taskkill 执行失败: {}", e))?;
        if !status.success() {
            return Err("taskkill 返回失败状态".to_string());
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        child
            .kill()
            .map_err(|e| format!("结束进程失败: {}", e))?;
    }
    Ok(())
}

fn stop_process_slot(slot: &Mutex<Option<Child>>) -> Result<(), String> {
    let mut guard = slot.lock().map_err(|_| "进程锁获取失败".to_string())?;
    if let Some(mut child) = guard.take() {
        let _ = kill_child(&mut child);
        let _ = child.wait();
    }
    Ok(())
}

// 自定义函数
#[tauri::command]
pub async fn greet_you(name: &str) -> Result<String, String> {
    println!("调用了greet_you");
    Ok(format!("Hello, {}! You've been greeted from Rust!", name))
}

#[tauri::command]
pub async fn get_live_html(url: &str, cookie: Option<String>) -> Result<LiveInfo, String> {
    // let response = reqwest::get(live_url).await.unwrap();
    // println!("调用了get_live_html");
    let mut live_req = DouYinReq::new(url);
    // 获取直播间room_id和主播信息（cookie 为从登录 WebView 同步的整段 Cookie，可选）
    let result = live_req.get_room_info(cookie.as_deref()).await;
    match result {
        Ok(info) => Ok(info),
        Err(_) => Err("This failed!".into()),
    }
}

#[tauri::command]
pub async fn open_window(
    handle: AppHandle,
    app_url: String,
    app_name: String,
    platform: String,
    user_agent: String,
    resize: bool,
    width: f64,
    height: f64,
    _js_content: String,
) {
    let window_label = "previewWeb";
    // if let Some(existing_window) = handle.get_window(window_label) {
    //     if resize {
    //         let new_size = LogicalSize::new(width, height);
    //         match existing_window.set_size(new_size) {
    //             Ok(_) => println!("Window resized to {}x{}", width, height),
    //             Err(e) => eprintln!("Failed to resize window: {}", e),
    //         }
    //     } else {
    //         existing_window.close().unwrap();
    //         println!("Existing window closed.");
    //         let start = Instant::now();
    //         while handle.get_window(window_label).is_some() {
    //             if start.elapsed().as_secs() > 2 {
    //                 println!("Window close took too long. Aborting.");
    //                 return;
    //             }
    //             std::thread::yield_now();
    //         }
    //     }
    // }
    println!("Opening docs in external window: {}, {}", app_url, platform);
    // println!("js_content: {}", js_content);
    // let resource_path = handle
    //     .path_resolver()
    //     .resolve_resource("data/custom.js")
    //     .expect("failed to resolve resource");
    // let mut custom_js = std::fs::File::open(&resource_path).unwrap();
    // let mut contents = String::new();
    // custom_js.read_to_string(&mut contents).unwrap();
    // contents += js_content.as_str();
    // println!("js file contents: {}", contents);
    if !resize {
        let _window = tauri::WindowBuilder::new(
            &handle,
            window_label, /* the unique window label */
            tauri::WindowUrl::External(app_url.parse().unwrap()),
        )
        .title(app_name.clone())
        .inner_size(width, height)
        .user_agent(user_agent.as_str())
        .initialization_script(include_str!("../inject/websocket.js"))
        .center()
        .build()
        .unwrap();
    }
}

static WINDOW_COUNTER: AtomicU32 = AtomicU32::new(1);

#[tauri::command]
pub async fn open_livebox_window(handle: AppHandle) -> Result<String, String> {
    let mut counter = WINDOW_COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut label = format!("livebox_{}", counter);
    while handle.get_window(&label).is_some() {
        counter = WINDOW_COUNTER.fetch_add(1, Ordering::Relaxed);
        label = format!("livebox_{}", counter);
    }

    let _window = tauri::WindowBuilder::new(
        &handle,
        &label,
        tauri::WindowUrl::App("index.html".into()),
    )
    .title("GiccooBox")
    .inner_size(900.0, 600.0)
    .center()
    .build()
    .map_err(|e| format!("打开新窗口失败: {}", e))?;

    Ok(format!("新窗口 {} 已打开", label))
}

/// 通过推送地址判断本机后台是否已经在监听端口。
/// 只检查本机(回环)地址：应用重启后进程句柄会丢失，但后台可能还在运行，此时不能再启动一份。
fn backend_is_listening(push_url: &str) -> bool {
    let Ok(parsed) = url::Url::parse(push_url.trim()) else {
        return false;
    };
    let (Some(host), Some(port)) = (parsed.host_str(), parsed.port_or_known_default()) else {
        return false;
    };
    let Ok(addrs) = (host, port).to_socket_addrs() else {
        return false;
    };
    addrs
        .filter(|addr| addr.ip().is_loopback())
        .any(|addr| TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok())
}

/// 启动后台进程：不弹出单独的控制台窗口，输出通过管道采集后显示在程序内
fn spawn_backend(handle: &AppHandle, project_path: &str) -> Result<Child, String> {
    let path = Path::new(project_path);
    if !path.exists() || !path.is_dir() {
        return Err("项目目录不存在或不是文件夹".to_string());
    }

    let mut command = if cfg!(target_os = "windows") {
        let mut cmd = Command::new("cmd");
        cmd.arg("/C").arg("npm run dev");
        cmd
    } else {
        let mut cmd = Command::new("sh");
        cmd.arg("-c").arg("npm run dev");
        cmd
    };
    command
        .current_dir(path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console(&mut command);
    let mut child = command
        .spawn()
        .map_err(|e| format!("启动 npm run dev 失败: {}", e))?;
    push_backend_log(
        handle,
        "system",
        &format!("[启动后台] npm run dev ({})", project_path),
    );
    if let Some(stdout) = child.stdout.take() {
        spawn_log_reader(handle.clone(), "stdout", stdout, true);
    }
    if let Some(stderr) = child.stderr.take() {
        spawn_log_reader(handle.clone(), "stderr", stderr, false);
    }
    Ok(child)
}

/// 重启后台：先结束由本程序启动的后台(整个进程树)，再重新启动。
/// 用于后台报错或卡死时手动恢复，不做"是否已在运行"的判断。
#[tauri::command]
pub async fn restart_npm_dev(handle: AppHandle, project_path: String) -> Result<(), String> {
    let path = Path::new(&project_path);
    if !path.exists() || !path.is_dir() {
        return Err("项目目录不存在或不是文件夹".to_string());
    }
    let mut guard = npm_process()
        .lock()
        .map_err(|_| "npm 进程锁获取失败".to_string())?;
    push_backend_log(&handle, "system", "[重启后台]");
    if let Some(mut child) = guard.take() {
        let _ = kill_child(&mut child);
        let _ = child.wait();
    }
    *guard = Some(spawn_backend(&handle, &project_path)?);
    Ok(())
}

/// 启动后台。返回 true 表示本次新启动了后台，false 表示后台已在运行、直接复用。
#[tauri::command]
pub async fn run_npm_dev(
    handle: AppHandle,
    project_path: String,
    push_url: Option<String>,
) -> Result<bool, String> {
    let mut guard = npm_process()
        .lock()
        .map_err(|_| "npm 进程锁获取失败".to_string())?;

    // 检查已有进程是否存活，存活则复用
    if let Some(ref mut child) = *guard {
        match child.try_wait() {
            Ok(Some(_status)) => {
                *guard = None;
            }
            Ok(None) => {
                // 已共享运行中，无需重复启动
                return Ok(false);
            }
            Err(_) => {
                *guard = None;
            }
        }
    }

    // 进程句柄不在(例如应用重启过)，但后台端口已经在监听，同样不重复启动
    if let Some(push_url) = push_url.as_deref() {
        if backend_is_listening(push_url) {
            push_backend_log(
                &handle,
                "system",
                "[检测到后台已在运行，但不是本次由程序启动的，无法显示它的日志]",
            );
            return Ok(false);
        }
    }

    *guard = Some(spawn_backend(&handle, &project_path)?);

    Ok(true)
}

/// 本程序启动的 exe 对应的路径和房间号：两者都没变时复用正在运行的 exe
static EXE_ARGS: Mutex<Option<(String, String)>> = Mutex::new(None);

/// 同名的 exe 是否已经在运行（包括不是本程序启动的，例如手动打开的）
fn exe_running_by_name(path: &Path) -> bool {
    #[cfg(target_os = "windows")]
    {
        let Some(name) = path.file_name().map(|n| n.to_string_lossy().into_owned()) else {
            return false;
        };
        let mut command = Command::new("tasklist");
        hide_console(&mut command);
        let Ok(output) = command
            .args(["/FI", &format!("IMAGENAME eq {}", name), "/FO", "CSV", "/NH"])
            .stdin(Stdio::null())
            .output()
        else {
            return false;
        };
        // 找到时每行是 "名称","PID",...；找不到时是一行提示文字
        let text = String::from_utf8_lossy(&output.stdout).to_lowercase();
        text.contains(&format!("\"{}\"", name.to_lowercase()))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        false
    }
}

/// 启动 exe。已经在运行就复用，不会关闭重开；只有 exe 路径或房间号变了才重启。
/// 返回 true 表示本次新启动了 exe
#[tauri::command]
pub async fn run_external_exe(exe_path: String, room_id: String) -> Result<bool, String> {
    let path = Path::new(&exe_path);
    if !path.exists() || !path.is_file() {
        return Err("exe 文件不存在".to_string());
    }
    let room_id = room_id.trim().to_string();
    if room_id.is_empty() {
        return Err("房间号不能为空".to_string());
    }
    let wanted = (exe_path.trim().to_lowercase(), room_id.clone());

    let mut guard = exe_process()
        .lock()
        .map_err(|_| "exe 进程锁获取失败".to_string())?;
    let mut args = EXE_ARGS
        .lock()
        .map_err(|_| "exe 进程锁获取失败".to_string())?;

    let ours_running = match guard.as_mut() {
        Some(child) => matches!(child.try_wait(), Ok(None)),
        None => false,
    };
    if ours_running {
        if args.as_ref() == Some(&wanted) {
            // 本程序启动的 exe 还在运行，参数也没变：直接复用
            return Ok(false);
        }
        // exe 路径或房间号变了：关闭旧的再按新参数启动
        if let Some(mut child) = guard.take() {
            let _ = kill_child(&mut child);
            let _ = child.wait();
        }
    } else {
        // 本程序启动的 exe 已经退出了，清掉记录
        if let Some(mut child) = guard.take() {
            let _ = child.wait();
        }
        // 不是本程序启动的同名 exe 正在运行(例如手动打开的)：不再重复打开
        if exe_running_by_name(path) {
            *args = None;
            return Ok(false);
        }
    }

    let child = Command::new(path)
        .arg("-roomId")
        .arg(&room_id)
        .spawn()
        .map_err(|e| format!("启动 exe 失败: {}", e))?;
    *guard = Some(child);
    *args = Some(wanted);
    Ok(true)
}

/// 停止采集时关闭 exe
#[tauri::command]
pub async fn stop_external_processes() -> Result<String, String> {
    // npm 作为共享后台保留，不在此停止
    stop_process_slot(exe_process())?;
    if let Ok(mut args) = EXE_ARGS.lock() {
        *args = None;
    }
    Ok("外部进程已停止".to_string())
}

/// 获取已缓存的后台日志
#[tauri::command]
pub async fn get_backend_logs() -> Result<Vec<BackendLog>, String> {
    let store = backend_logs()
        .lock()
        .map_err(|_| "日志锁获取失败".to_string())?;
    Ok(store.logs.iter().cloned().collect())
}

/// 手动停止后台。返回 true 表示确实停止了一个由本程序启动的后台
#[tauri::command]
pub async fn stop_npm_dev(handle: AppHandle) -> Result<bool, String> {
    let had_process = npm_process()
        .lock()
        .map_err(|_| "npm 进程锁获取失败".to_string())?
        .is_some();
    stop_process_slot(npm_process())?;
    if had_process {
        push_backend_log(&handle, "system", "[已停止后台]");
    }
    Ok(had_process)
}

/// 程序退出时结束后台：后台没有自己的窗口，不结束的话会变成看不见的残留进程
pub fn stop_backend_on_exit() {
    let _ = stop_process_slot(npm_process());
    let _ = stop_process_slot(exe_process());
}

/// 向抖音确认一次 Cookie 里的登录是否还有效。
/// 返回 "valid" / "invalid" / "unknown"(网络失败或返回了不认识的内容，不能据此判断)。
#[tauri::command]
pub async fn check_douyin_login(cookie: String) -> Result<String, String> {
    let cookie = cookie.trim();
    if cookie.is_empty() {
        return Ok("invalid".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建请求失败: {}", e))?;
    let response = client
        .get("https://live.douyin.com/webcast/user/me/?aid=6383&live_id=1&device_platform=web&language=zh-CN")
        .header("cookie", cookie)
        .header("referer", "https://live.douyin.com/")
        .header(
            "user-agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        )
        .send()
        .await;
    let Ok(response) = response else {
        return Ok("unknown".to_string());
    };
    let Ok(body) = response.json::<serde_json::Value>().await else {
        return Ok("unknown".to_string());
    };
    // status_code: 0 表示已登录并返回了用户信息，20003 表示未登录
    let state = match body.get("status_code").and_then(serde_json::Value::as_i64) {
        Some(0) => "valid",
        Some(20003) => "invalid",
        _ => "unknown",
    };
    Ok(state.to_string())
}
