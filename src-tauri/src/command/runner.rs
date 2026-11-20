use crate::command::model::LiveInfo;
use regex::Regex;
use reqwest::Client;
use std::time::Duration;

// 定义抖音请求结构体
pub struct DouYinReq {
    request: Client,
    room_url: String,
    room_info: String,
}

// 为抖音请求的结构体添加方法
impl DouYinReq {
    pub fn new(url: &str) -> Self {
        let client = Client::builder()
            .cookie_store(true)
            .connect_timeout(Duration::from_secs(10))
            .timeout(PAGE_TIMEOUT)
            .build()
            .unwrap_or_default();
        DouYinReq {
            request: client,
            room_url: String::from(url),
            room_info: String::from(""),
        }
    }

    pub async fn get_room_info(
        &mut self,
        cookie_override: Option<&str>,
    ) -> Result<LiveInfo, Box<dyn std::error::Error>> {
        println!("获取直播间的room_info: {}", self.room_url);
        let base_cookie = match cookie_override {
            Some(c) if !c.trim().is_empty() => c.trim().to_string(),
            // 未登录时只带匿名的设备参数，不再内置任何账号 cookie
            _ => ANON_COOKIE.to_string(),
        };
        let (body, set_cookies) = self.fetch_page(&base_cookie).await?;
        let mut ttwid = find_cookie(&set_cookies, "ttwid");
        let parsed = match parse_room_page(&body) {
            Some(parsed) => parsed,
            None => {
                // 新设备/新网络第一次访问时，抖音可能先返回一个设置 Cookie 的验证页，
                // 没有直播间数据。带上它下发的 Cookie 再请求一次
                if set_cookies.is_empty() {
                    return Err("直播间页面里没有找到直播间信息".into());
                }
                println!("页面里没有直播间信息，带上返回的 Cookie 重试一次");
                let retry_cookie = format!("{}; {}", base_cookie, join_cookies(&set_cookies));
                let (body, more) = self.fetch_page(&retry_cookie).await?;
                if ttwid.is_empty() {
                    ttwid = find_cookie(&more, "ttwid");
                }
                parse_room_page(&body).ok_or("直播间页面里没有找到直播间信息")?
            }
        };
        let (room_info, unique_id) = parsed;
        self.room_info = room_info;
        Ok(LiveInfo {
            room_info: self.room_info.clone(),
            ttwid,
            unique_id,
        })
    }

    /// 请求直播间页面，返回页面内容和服务器下发的 Cookie(name, value)
    async fn fetch_page(
        &self,
        cookie: &str,
    ) -> Result<(String, Vec<(String, String)>), Box<dyn std::error::Error>> {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7".parse()?);
        headers.insert("accept-language", "zh-CN,zh;q=0.9,en;q=0.8".parse()?);
        headers.insert("cache-control", "max-age=0".parse()?);
        headers.insert("cookie", reqwest::header::HeaderValue::from_str(cookie)?);
        headers.insert("priority", "u=0, i".parse()?);
        headers.insert("referer", "https://live.douyin.com/".parse()?);
        headers.insert(
            "sec-ch-ua",
            "\"Chromium\";v=\"124\", \"Google Chrome\";v=\"124\", \"Not-A.Brand\";v=\"99\""
                .parse()?,
        );
        headers.insert("sec-ch-ua-mobile", "?0".parse()?);
        headers.insert("sec-ch-ua-platform", "\"macOS\"".parse()?);
        headers.insert("sec-fetch-dest", "document".parse()?);
        headers.insert("sec-fetch-mode", "navigate".parse()?);
        headers.insert("sec-fetch-site", "same-origin".parse()?);
        headers.insert("sec-fetch-user", "?1".parse()?);
        headers.insert("upgrade-insecure-requests", "1".parse()?);
        headers.insert("user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36".parse()?);
        let response = self
            .request
            .get(self.room_url.clone())
            .headers(headers)
            .send()
            .await?;
        let cookies: Vec<(String, String)> = response
            .cookies()
            .map(|c| (c.name().to_string(), c.value().to_string()))
            .collect();
        let body = response.text().await?;
        Ok((body, cookies))
    }
}

/// 未登录时使用的匿名设备参数
const ANON_COOKIE: &str = "has_avx2=null; device_web_cpu_core=8; device_web_memory_size=8; live_use_vvc=%22false%22; webcast_local_quality=sd";

/// 请求直播间页面的超时：网络卡住时按失败处理，不会一直等下去
const PAGE_TIMEOUT: Duration = Duration::from_secs(15);

fn find_cookie(cookies: &[(String, String)], name: &str) -> String {
    cookies
        .iter()
        .find(|(n, _)| n == name)
        .map(|(_, v)| v.clone())
        .unwrap_or_default()
}

fn join_cookies(cookies: &[(String, String)]) -> String {
    cookies
        .iter()
        .map(|(n, v)| format!("{}={}", n, v))
        .collect::<Vec<_>>()
        .join("; ")
}

/// 从页面里取出直播间信息(JSON 字符串)和 user_unique_id。页面不是预期的内容时返回 None，不会 panic
fn parse_room_page(body: &str) -> Option<(String, String)> {
    let (re, unique_id) = if body.contains(r#"status\":4"#) {
        // 已停播：只有主播信息
        println!("主播已停播了");
        (Regex::new(r#"anchor\\":(.*?),\\"open_id_str"#).ok()?, String::new())
    } else {
        let unique_re = Regex::new(r#"user_unique_id\\":\\"(.*?)\\"}"#).ok()?;
        let unique_id = unique_re
            .captures(body)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();
        (
            Regex::new(r#"roomInfo\\":\{\\"room\\":(.*?),\\"toolbar_data"#).ok()?,
            unique_id,
        )
    };
    let main_info = re.captures(body)?.get(1)?.as_str();
    // 替换里面的双引号,方便json解析
    let room_info = (String::from(main_info) + "}").replace(r#"\""#, r#"""#);
    Some((room_info, unique_id))
}

