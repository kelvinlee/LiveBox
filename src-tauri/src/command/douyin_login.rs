use tauri::{AppHandle, Manager};

#[cfg(windows)]
use webview2_com::{
    GetCookiesCompletedHandler,
    Microsoft::Web::WebView2::Win32::{ICoreWebView2_2, ICoreWebView2CookieList},
};
#[cfg(windows)]
use windows::Win32::System::Com::CoTaskMemFree;
#[cfg(windows)]
use windows::Win32::Globalization::lstrlenW;
#[cfg(windows)]
use windows::core::{Interface, HSTRING, PCWSTR, PWSTR};
#[cfg(windows)]
use std::{mem, ptr, time::Duration};

/// 内嵌 WebView 打开抖音直播页供扫码/账号登录
#[tauri::command]
pub async fn open_douyin_login_window(handle: AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    {
        const LABEL: &str = "douyinLogin";
        if let Some(w) = handle.get_window(LABEL) {
            w.set_focus().map_err(|e| e.to_string())?;
            return Ok(());
        }
        let login_url = url::Url::parse("https://live.douyin.com/").map_err(|e| e.to_string())?;
        let _window = tauri::WindowBuilder::new(
            &handle,
            LABEL,
            tauri::WindowUrl::External(login_url),
        )
        .title("抖音登录 - LiveBox")
        .inner_size(1000.0, 800.0)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = handle;
        Err("内嵌登录目前仅支持 Windows".into())
    }
}

/// 从登录窗口 WebView2 读取 `https://live.douyin.com` 的 Cookie（含 HttpOnly）
///
/// 在 **阻塞线程**（`spawn_blocking`）里执行 `with_webview` + `recv_timeout`，避免占用
/// Tauri 主线程 / 事件循环，否则 WebView2 的异步回调无法被派发，两窗口会一起卡死。
/// 成功后自动关闭登录窗口。
#[tauri::command]
pub async fn sync_douyin_cookies_from_webview(handle: AppHandle) -> Result<String, String> {
    #[cfg(windows)]
    {
        let app = handle.clone();
        tauri::async_runtime::spawn_blocking(move || sync_douyin_cookies_blocking(app))
            .await
            .map_err(|e| format!("同步任务异常: {}", e))?
    }
    #[cfg(not(windows))]
    {
        let _ = handle;
        Err("从 WebView 同步 Cookie 目前仅支持 Windows".into())
    }
}

#[cfg(windows)]
fn sync_douyin_cookies_blocking(handle: AppHandle) -> Result<String, String> {
    let window = handle.get_window("douyinLogin").ok_or_else(|| {
        "请先点击「打开抖音登录页」并在窗口内完成登录".to_string()
    })?;
    let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();
    let tx_err = tx.clone();
    window
        .with_webview(move |webview| {
            let r = (|| -> Result<(), String> {
                unsafe {
                    let controller = webview.controller();
                    let core = controller
                        .CoreWebView2()
                        .map_err(|e| format!("CoreWebView2: {}", e))?;
                    let core2: ICoreWebView2_2 = core
                        .cast()
                        .map_err(|e| format!("cast ICoreWebView2_2: {}", e))?;
                    let cm = core2
                        .CookieManager()
                        .map_err(|e| format!("CookieManager: {}", e))?;
                    let handler = GetCookiesCompletedHandler::create(Box::new(
                        move |hr_result, list| {
                            let out = match hr_result {
                                Ok(()) => cookie_list_to_header(list),
                                Err(e) => Err(format!("GetCookies: {}", e)),
                            };
                            let _ = tx.send(out);
                            Ok(())
                        },
                    ));
                    cm.GetCookies(&HSTRING::from("https://live.douyin.com/"), &handler)
                        .map_err(|e| format!("GetCookies: {}", e))?;
                    Ok(())
                }
            })();
            if let Err(e) = r {
                let _ = tx_err.send(Err(e));
            }
        })
        .map_err(|e| e.to_string())?;

    let result = rx
        .recv_timeout(Duration::from_secs(45))
        .map_err(|_| "同步超时：请确认登录页已加载完成并已登录，然后重试".to_string())?;

    if result.is_ok() {
        if let Some(w) = handle.get_window("douyinLogin") {
            let _ = w.close();
        }
    }

    result
}

#[cfg(windows)]
fn cookie_list_to_header(list: Option<ICoreWebView2CookieList>) -> Result<String, String> {
    let list = list.ok_or_else(|| "未返回 Cookie 列表，请确认已在登录页完成登录".to_string())?;
    unsafe {
        let mut count = 0u32;
        list.Count(&mut count).map_err(|e| e.to_string())?;
        let mut parts = Vec::new();
        for i in 0..count {
            let cookie = list.GetValueAtIndex(i).map_err(|e| e.to_string())?;
            let mut name_pw = PWSTR::null();
            let mut value_pw = PWSTR::null();
            cookie.Name(&mut name_pw).map_err(|e| e.to_string())?;
            cookie.Value(&mut value_pw).map_err(|e| e.to_string())?;
            let name = take_pwstr_string(name_pw);
            let value = take_pwstr_string(value_pw);
            if !name.is_empty() {
                parts.push(format!("{}={}", name, value));
            }
        }
        if parts.is_empty() {
            return Err("未读取到任何 Cookie，请在窗口内完成登录后重试".into());
        }
        Ok(parts.join("; "))
    }
}

/// WebView2 分配的 `PWSTR`，读完需 `CoTaskMemFree`（与 webview2-com 内部逻辑一致）
#[cfg(windows)]
unsafe fn take_pwstr_string(source: PWSTR) -> String {
    if source.is_null() {
        return String::new();
    }
    let pcwstr = PCWSTR::from_raw(source.as_ptr());
    let s = string_from_pcwstr_local(&pcwstr);
    CoTaskMemFree(mem::transmute(source.as_ptr()));
    s
}

#[cfg(windows)]
fn string_from_pcwstr_local(source: &PCWSTR) -> String {
    if source.0.is_null() {
        return String::new();
    }
    let len = unsafe { lstrlenW(*source) };
    if len > 0 {
        unsafe {
            let buffer = ptr::slice_from_raw_parts(source.0, len as usize);
            String::from_utf16_lossy(&*buffer)
        }
    } else {
        String::new()
    }
}
