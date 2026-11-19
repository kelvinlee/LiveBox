// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// 对command单独管理
mod command;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_websocket::init())
        .invoke_handler(tauri::generate_handler![
            command::live::get_live_html,
            command::live::greet_you,
            command::live::open_livebox_window,
            command::live::run_npm_dev,
            command::live::run_external_exe,
            command::live::stop_external_processes,
            command::live::get_backend_logs,
            command::live::stop_npm_dev,
            command::live::backend_running,
            command::live::restart_npm_dev,
            command::live::check_douyin_login,
            command::gift::get_gift_catalog,
            command::gift::add_gift_kinds,
            command::tiktok::check_tiktok_env,
            command::tiktok::install_tiktok_env,
            command::tiktok::install_python,
            command::tiktok::start_tiktok,
            command::tiktok::stop_tiktok,
            command::tiktok::check_tiktok_live,
            command::douyin_login::open_douyin_login_window,
            command::douyin_login::sync_douyin_cookies_from_webview,
        ])
        .on_window_event(|event| {
            // 窗口关闭时结束这个窗口的 TikTok 采集
            if let tauri::WindowEvent::Destroyed = event.event() {
                command::tiktok::stop_for_window(event.window().label());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // 程序退出时结束后台和 exe
            if let tauri::RunEvent::Exit = event {
                command::live::stop_backend_on_exit();
                command::tiktok::stop_all();
            }
        });
}
