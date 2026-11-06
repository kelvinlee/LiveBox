use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Write},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct TikTokState(Mutex<Option<Session>>);

struct Session {
    id: String,
    child: Child,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    account: String,
    proxy: Option<String>,
    api_key: Option<String>,
}

fn hidden(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    #[cfg(not(windows))]
    let _ = command;
}

fn stop_session(slot: &mut Option<Session>) -> Result<(), String> {
    if let Some(session) = slot.as_mut() {
        if session.child.try_wait().map_err(|e| e.to_string())?.is_none() {
            if let Some(input) = session.child.stdin.as_mut() {
                let _ = writeln!(input, "{{\"action\":\"stop\"}}");
                let _ = input.flush();
            }
            let deadline = Instant::now() + Duration::from_secs(3);
            while session.child.try_wait().map_err(|e| e.to_string())?.is_none() {
                if Instant::now() >= deadline {
                    #[cfg(windows)]
                    {
                        let mut kill = Command::new("taskkill");
                        hidden(&mut kill);
                        let status = kill.args(["/PID", &session.child.id().to_string(), "/T", "/F"])
                            .stdout(Stdio::null()).stderr(Stdio::null()).status()
                            .map_err(|_| "无法结束 TikTok 采集进程".to_string())?;
                        if !status.success() && session.child.try_wait().map_err(|e| e.to_string())?.is_none() {
                            return Err("TikTok 采集进程仍在运行".into());
                        }
                    }
                    #[cfg(not(windows))]
                    session.child.kill().map_err(|e| e.to_string())?;
                    session.child.wait().map_err(|e| e.to_string())?;
                    break;
                }
                thread::sleep(Duration::from_millis(50));
            }
        }
    }
    *slot = None;
    Ok(())
}

pub fn shutdown(app: &AppHandle) {
    if let Ok(mut slot) = app.state::<TikTokState>().0.lock() {
        let _ = stop_session(&mut slot);
    }
}

#[tauri::command]
pub fn start_tiktok(app: AppHandle, state: State<TikTokState>, session_id: String, config: Config) -> Result<(), String> {
    if !cfg!(windows) {
        return Err("TikTok 采集组件当前仅支持 Windows".into());
    }
    if config.account.trim().is_empty() || session_id.is_empty() || session_id.len() > 100 {
        return Err("请输入 TikTok 主播用户名".into());
    }
    let mut slot = state.0.lock().map_err(|_| "TikTok 进程锁获取失败")?;
    stop_session(&mut slot)?;
    let worker = app.path_resolver().resolve_resource("tiktok-worker/livebox-tiktok.exe")
        .ok_or("未找到 TikTok 采集组件，请先运行 npm run tiktok:build")?;
    if !worker.is_file() {
        return Err("未找到 TikTok 采集组件，请先运行 npm run tiktok:build，并使用 Windows 打包配置".into());
    }
    let mut command = Command::new(worker);
    hidden(&mut command);
    let mut child = command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
        .spawn().map_err(|_| "TikTok 采集组件启动失败")?;
    let payload = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    let written = (|| -> std::io::Result<()> {
        let input = child.stdin.as_mut().unwrap();
        writeln!(input, "{}", payload)?;
        input.flush()
    })();
    if written.is_err() {
        let _ = child.kill();
        let _ = child.wait();
        return Err("无法向 TikTok 组件写入配置".into());
    }
    let output = child.stdout.take().unwrap();
    let event_session = session_id.clone();
    thread::spawn(move || {
        for line in BufReader::new(output).lines() {
            let Ok(line) = line else { break };
            if let Ok(data) = serde_json::from_str::<Value>(&line) {
                let _ = app.emit_all("tiktok-event", json!({"sessionId": event_session, "data": data}));
            }
        }
        let _ = app.emit_all("tiktok-event", json!({"sessionId": event_session, "data": {"type": "exit"}}));
    });
    *slot = Some(Session { id: session_id, child });
    Ok(())
}

#[tauri::command]
pub fn stop_tiktok(state: State<TikTokState>, session_id: String) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|_| "TikTok 进程锁获取失败")?;
    if slot.as_ref().map(|s| s.id.as_str()) == Some(session_id.as_str()) {
        stop_session(&mut slot)?;
    }
    Ok(())
}

#[tauri::command]
pub fn refresh_tiktok_video(state: State<TikTokState>, session_id: String) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|_| "TikTok 进程锁获取失败")?;
    let session = slot.as_mut().filter(|s| s.id == session_id).ok_or("TikTok 采集尚未启动")?;
    let input = session.child.stdin.as_mut().ok_or("TikTok 组件已退出")?;
    writeln!(input, "{{\"action\":\"refresh\"}}").and_then(|_| input.flush())
        .map_err(|_| "TikTok 组件已退出，请重新采集".into())
}
