use crate::command::model::LiveInfo;
use regex::Regex;
use reqwest::Client;

// 定义抖音请求结构体
pub struct DouYinReq {
    request: Client,
    room_url: String,
    room_info: String,
}

// 为抖音请求的结构体添加方法
impl DouYinReq {
    pub fn new(url: &str) -> Self {
        let client = Client::builder().cookie_store(true).build().unwrap();
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
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7".parse()?);
        headers.insert("accept-language", "zh-CN,zh;q=0.9,en;q=0.8".parse()?);
        headers.insert("cache-control", "max-age=0".parse()?);
        let cookie_header = match cookie_override {
            Some(c) if !c.trim().is_empty() => c.trim().to_string(),
            // 未登录时只带匿名的设备参数，不再内置任何账号 cookie
            _ => "has_avx2=null; device_web_cpu_core=8; device_web_memory_size=8; live_use_vvc=%22false%22; webcast_local_quality=sd".to_string(),
        };
        headers.insert(
            "cookie",
            reqwest::header::HeaderValue::from_str(&cookie_header)?,
        );
        headers.insert("priority", "u=0, i".parse()?);
        headers.insert("referer", "https://live.douyin.com/972176515698?_ct=1714214842847&action_type=click&enter_from_merge=web_search&enter_method=web_video_head&enter_method_temai=web_video_head&group_id=undefined&is_livehead_preview_mini_window_show=&mini_window_show_type=&preview_info_str=eyJ1cmwiOiIiLCJsb3dVcmwiOiIiLCJ1aWQiOiIxMDA3NzQ5MjE4NDUiLCJ1dWlkIjoiNzM0NzE0NTY1MzUwMjAxOTEyNiIsImlzX211bHRpcGxlIjowLCJpc19wYWlkIjowLCJpc19tdWx0aV9jYW1lcmEiOjAsInJlc29sdXRpb25zIjpbXX0%3D&request_id=2024042718421695936492028C53AC640D&room_info=7362491920259713818&search_tab=aweme_general&_ct=1714214842848".parse()?);
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
        let request = self.request.get(self.room_url.clone()).headers(headers);
        let response = request.send().await?;
        // 先使用cookie，再使用text
        let cookies = response.cookies();
        let mut ttwid = String::new();
        for c in cookies {
            println!("cookies: {:?} value:{:?}", c.name(), c.value());
            if c.name() == "ttwid" {
                ttwid = c.value().to_string();
            }
        }
        // 获取cookie里面的ttwid
        let body = response.text().await?;
        // println!("获取的直播间HTML内容是：{}", body);
        // 判断是不是已经停播了，是的话仅获取主播头像
        // 使用正则表达式匹配直播间信息
        let re;
        let mut unique_id = "";
        if body.contains(r#"status\":4"#) {
            println!("主播已停播了");
            // 使用正则表达式匹配直播间信息
            re = Regex::new(r#"anchor\\":(.*?),\\"open_id_str"#).unwrap();
        } else {
            // 使用正则表达式匹配直播间信息
            re = Regex::new(r#"roomInfo\\":\{\\"room\\":(.*?),\\"toolbar_data"#).unwrap();
            let unique_re = Regex::new(r#"user_unique_id\\":\\"(.*?)\\"}"#).unwrap();
            unique_id = unique_re.captures(&body).unwrap().get(1).unwrap().as_str();
        }
        let main_info = re.captures(&body).unwrap().get(1).unwrap().as_str();
        // 替换里面的双引号,方便json解析
        let room_info = String::from(main_info) + "}";
        self.room_info = room_info.replace(r#"\""#, r#"""#);
        // println!("直播间信息是：{}", self.room_info);
        Ok(LiveInfo {
            room_info: self.room_info.clone(),
            ttwid,
            unique_id: String::from(unique_id),
        })
    }

    // pub async fn get_rank_info(&self) -> Result<(), Box<dyn std::error::Error>> {
    //     let mut headers = reqwest::header::HeaderMap::new();
    //     headers.insert("accept", "application/json, text/plain, */*".parse()?);
    //     headers.insert("accept-language", "zh-CN,zh;q=0.9,en;q=0.8".parse()?);
    //     headers.insert("cache-control", "no-cache".parse()?);
    //     headers.insert("cookie", "has_avx2=null; device_web_cpu_core=8; device_web_memory_size=8; live_use_vvc=%22false%22; xgplayer_user_id=32142398740; csrf_session_id=b154f2eb3608feb421dd6c9fe24bc2d4; odin_tt=a5b308e92c2f826f447b22425cb49c1faa5a13b64c07a6f7309186819371d4c74fe5dcf480e52fe2931fba91397a83a31c94e2df31a3735b839683d58bf010781b5c5f61c231ab52f5ecfbc03f80ff23; passport_csrf_token=6bc63b63e5fe245d323c824928bc812e; passport_csrf_token_default=6bc63b63e5fe245d323c824928bc812e; bd_ticket_guard_client_web_domain=2; webcast_local_quality=sd; SEARCH_RESULT_LIST_TYPE=%22single%22; ttwid=1%7CUOwlzl-VvV0COewDTk3CsEdp4EMg8CUFA-ICTdsrLQw%7C1712887757%7Cb40c2475ea6f287e8da8722ef9dfcb4b1b9d35e05158a6fc6dbc3282a4caf15a; __ac_nonce=0662a095500344b59f1a0; __ac_signature=_02B4Z6wo00f01OHJxKwAAIDDszbktR5C2nTh6cAAAF5e7JV0RQje.O9NY-t5t6vN9NKbPcnfXMkFfQLkfKLc17gPyPteEs6w5xUu7in-FxDZfmcOuSUKGOIUEeUxSuh0vbz9E.lVYSPp2boo0f; webcast_leading_last_show_time=1714030934972; webcast_leading_total_show_times=4; bd_ticket_guard_client_data=eyJiZC10aWNrZXQtZ3VhcmQtdmVyc2lvbiI6MiwiYmQtdGlja2V0LWd1YXJkLWl0ZXJhdGlvbi12ZXJzaW9uIjoxLCJiZC10aWNrZXQtZ3VhcmQtcmVlLXB1YmxpYy1rZXkiOiJCRExvdFozTlZJU3ZpQjZ3YzREeHdSdTYwaVY1eTIwUzM1UytLTllwTUs0Tmxoc3M3Z1ZjdFpYWmhiQ0ZWTzYrNEVsSGd0U25GM1BERWc4UFgvZFFodVE9IiwiYmQtdGlja2V0LWd1YXJkLXdlYi12ZXJzaW9uIjoxfQ%3D%3D; download_guide=%223%2F20240425%2F0%22; pwa2=%220%7C0%7C3%7C0%22; FORCE_LOGIN=%7B%22videoConsumedRemainSeconds%22%3A180%2C%22isForcePopClose%22%3A1%7D; home_can_add_dy_2_desktop=%221%22; __live_version__=%221.1.1.9809%22; xg_device_score=7.541386294591826; live_can_add_dy_2_desktop=%220%22; IsDouyinActive=true; msToken=LrwiNPyulLPWEKS-5jj4OvncuOKQA8y4qFfo1j-JN2Yw3-eg_j-DrE_CKTQmOz44dwG26uOxevFyITDrkPwx82M4k4XvQ8zgm3MjnQDDmtZ89Yikpkve-kRMQSuo; msToken=Qj3DmdHUf10MnlDFyLJeQaF1tLaXa93UwyL2V84tV9u8B0JAp1RuVZC41Lzw066HS7G2rqUkiQB-7DCWhkiEmQlD3KyucfKG5qPdUY3jEo39oRyafq4M2cpXm8Mv; ttwid=1%7CngabJA52sDUnYMxFKTFQmYEe2_RYNkefWVWEfuA53Mo%7C1713104743%7C34512c898d125865794d949a2477dda7493530c850da7c59a19c32a46642876c".parse()?);
    //     headers.insert("pragma", "no-cache".parse()?);
    //     headers.insert("priority", "u=1, i".parse()?);
    //     headers.insert(
    //         "sec-ch-ua",
    //         "\"Chromium\";v=\"124\", \"Google Chrome\";v=\"124\", \"Not-A.Brand\";v=\"99\""
    //             .parse()?,
    //     );
    //     headers.insert("sec-ch-ua-mobile", "?0".parse()?);
    //     headers.insert("sec-ch-ua-platform", "\"macOS\"".parse()?);
    //     headers.insert("sec-fetch-dest", "empty".parse()?);
    //     headers.insert("sec-fetch-mode", "cors".parse()?);
    //     headers.insert("sec-fetch-site", "same-origin".parse()?);
    //     headers.insert("user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36".parse()?);
    //     let request = self.request.get(format!("https://live.douyin.com/webcast/ranklist/audience/?aid=6383&app_name=douyin_web&live_id=1&device_platform=web&language=zh-CN&cookie_enabled=true&screen_width=2560&screen_height=1440&browser_language=zh-CN&browser_platform=Win32&browser_name=Chrome&browser_version=117.0.0.0&webcast_sdk_version=2450&room_info={}&rank_type=30", self.room_info)).headers(headers);
    //     let response = request.send().await?;
    //     let json_value = response.text().await?;
    //     println!("rank json value:{json_value:?}");
    //     Ok(())
    // }
}
