use crate::command::model::LiveInfo;
use crate::command::runner::DouYinReq;
use std::path::Path;
use std::process::{Child, Command};
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

static NPM_PROCESS: OnceLock<Mutex<Option<Child>>> = OnceLock::new();
static EXE_PROCESS: OnceLock<Mutex<Option<Child>>> = OnceLock::new();

fn npm_process() -> &'static Mutex<Option<Child>> {
    NPM_PROCESS.get_or_init(|| Mutex::new(None))
}

fn exe_process() -> &'static Mutex<Option<Child>> {
    EXE_PROCESS.get_or_init(|| Mutex::new(None))
}

fn kill_child(child: &mut Child) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let pid = child.id().to_string();
        let status = Command::new("taskkill")
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

#[tauri::command]
pub async fn run_npm_dev(project_path: String) -> Result<String, String> {
    let path = Path::new(&project_path);
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

    stop_process_slot(npm_process())?;
    command.current_dir(path);
    let child = command
        .spawn()
        .map_err(|e| format!("启动 npm run dev 失败: {}", e))?;
    let mut guard = npm_process()
        .lock()
        .map_err(|_| "npm 进程锁获取失败".to_string())?;
    *guard = Some(child);

    Ok("npm run dev 已启动".to_string())
}

#[tauri::command]
pub async fn run_external_exe(exe_path: String, room_id: String) -> Result<String, String> {
    let path = Path::new(&exe_path);
    if !path.exists() || !path.is_file() {
        return Err("exe 文件不存在".to_string());
    }
    if room_id.trim().is_empty() {
        return Err("房间号不能为空".to_string());
    }

    stop_process_slot(exe_process())?;
    let child = Command::new(path)
        .arg("-roomId")
        .arg(room_id)
        .spawn()
        .map_err(|e| format!("启动 exe 失败: {}", e))?;
    let mut guard = exe_process()
        .lock()
        .map_err(|_| "exe 进程锁获取失败".to_string())?;
    *guard = Some(child);

    Ok("exe 已启动".to_string())
}

#[tauri::command]
pub async fn stop_external_processes() -> Result<String, String> {
    stop_process_slot(npm_process())?;
    stop_process_slot(exe_process())?;
    Ok("外部进程已停止".to_string())
}
