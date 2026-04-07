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
            command::live::open_window,
            command::live::run_npm_dev,
            command::live::run_external_exe,
            command::live::stop_external_processes,
            command::douyin_login::open_douyin_login_window,
            command::douyin_login::sync_douyin_cookies_from_webview,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
