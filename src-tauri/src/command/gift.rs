//! 礼物种类的长期存储，抖音和 TikTok 各存一份。
//!
//! 保存在应用数据目录下（抖音 gift_catalog.json，TikTok gift_catalog_tiktok.json），
//! 不依赖 WebView 的 localStorage，清理浏览数据或者打开多个窗口都不会丢。

use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

/// 内存中的礼物列表：key 为平台，第一次使用时从文件加载
static GIFT_CATALOGS: OnceLock<Mutex<HashMap<String, Vec<Value>>>> = OnceLock::new();

fn catalogs() -> &'static Mutex<HashMap<String, Vec<Value>>> {
    GIFT_CATALOGS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// 平台名：只认 tiktok，其他都当作抖音（兼容旧版本没有平台参数的调用）
fn normalize_platform(platform: Option<String>) -> String {
    match platform.as_deref() {
        Some("tiktok") => "tiktok".to_string(),
        _ => "douyin".to_string(),
    }
}

fn catalog_path(handle: &AppHandle, platform: &str) -> Result<PathBuf, String> {
    let dir = handle
        .path_resolver()
        .app_data_dir()
        .ok_or_else(|| "无法获取应用数据目录".to_string())?;
    let file = match platform {
        "tiktok" => "gift_catalog_tiktok.json",
        _ => "gift_catalog.json",
    };
    Ok(dir.join(file))
}

fn gift_id(kind: &Value) -> Option<&str> {
    kind.get("id").and_then(Value::as_str).filter(|id| !id.is_empty())
}

/// 从文件读取。文件不存在时返回空列表；文件损坏时备份后返回空列表，避免之后的写入把它覆盖掉。
fn load_from_file(handle: &AppHandle, platform: &str) -> Result<Vec<Value>, String> {
    let path = catalog_path(handle, platform)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let text = fs::read_to_string(&path).map_err(|e| format!("读取礼物列表失败: {}", e))?;
    match serde_json::from_str::<Vec<Value>>(&text) {
        Ok(list) => Ok(list),
        Err(_) => {
            let _ = fs::rename(&path, path.with_extension("json.bak"));
            Ok(Vec::new())
        }
    }
}

/// 写入文件：先写临时文件再改名，写到一半断电或崩溃也不会损坏原文件
fn save_to_file(handle: &AppHandle, platform: &str, list: &[Value]) -> Result<(), String> {
    let path = catalog_path(handle, platform)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("创建数据目录失败: {}", e))?;
    }
    let text = serde_json::to_string(list).map_err(|e| format!("序列化礼物列表失败: {}", e))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| format!("写入礼物列表失败: {}", e))?;
    fs::rename(&tmp, &path).map_err(|e| format!("保存礼物列表失败: {}", e))?;
    Ok(())
}

/// 获取某个平台记录过的礼物种类
#[tauri::command]
pub async fn get_gift_catalog(
    handle: AppHandle,
    platform: Option<String>,
) -> Result<Vec<Value>, String> {
    let platform = normalize_platform(platform);
    let mut map = catalogs().lock().map_err(|_| "礼物列表锁获取失败".to_string())?;
    if !map.contains_key(&platform) {
        let list = load_from_file(&handle, &platform)?;
        map.insert(platform.clone(), list);
    }
    Ok(map.get(&platform).cloned().unwrap_or_default())
}

/// 记录新的礼物种类：已存在的 id 会被跳过。返回实际新增的数量。
#[tauri::command]
pub async fn add_gift_kinds(
    handle: AppHandle,
    platform: Option<String>,
    kinds: Vec<Value>,
) -> Result<usize, String> {
    let platform = normalize_platform(platform);
    let added: Vec<Value> = {
        let mut map = catalogs().lock().map_err(|_| "礼物列表锁获取失败".to_string())?;
        if !map.contains_key(&platform) {
            let list = load_from_file(&handle, &platform)?;
            map.insert(platform.clone(), list);
        }
        let list = map.get_mut(&platform).expect("礼物列表已加载");
        let mut added = Vec::new();
        for kind in kinds {
            let Some(id) = gift_id(&kind) else {
                continue;
            };
            if list.iter().any(|k| gift_id(k) == Some(id)) {
                continue;
            }
            list.push(kind.clone());
            added.push(kind);
        }
        if !added.is_empty() {
            save_to_file(&handle, &platform, list)?;
        }
        added
    };
    // 通知所有窗口同步
    if !added.is_empty() {
        let _ = handle.emit_all(
            "gift-kinds-added",
            json!({ "platform": platform, "kinds": added }),
        );
    }
    Ok(added.len())
}
