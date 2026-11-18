"""
GiccooBox 的 TikTok 直播采集桥接脚本。

基于 TikTokLive (https://github.com/isaackogan/TikTokLive) 连接 TikTok 直播间，
把收到的事件转换成和抖音采集相同的数据结构，每行一个 JSON 输出到 stdout，由程序读取。

用法:
    python tiktok_bridge.py <主播 unique_id 或直播间地址> [--proxy http://host:port]

输出的每一行都是 {"event": "...", ...}:
    status      连接状态变化 (connecting / connected / reconnecting)
    room        直播间信息 (主播昵称、头像、标题、拉流地址等)
    chat        聊天
    gift        礼物 (repeatCount 为连击累计数量，和抖音一致)
    like        点赞
    join        进入直播间
    follow      关注
    stats       在线人数
    live_end    直播结束 (脚本随后退出)
    offline     主播没有在直播 (脚本随后退出)
    error       错误信息 (fatal=true 时脚本随后退出)
"""

import argparse
import asyncio
import json
import sys
import time
import traceback

# 输出统一使用 UTF-8，避免 Windows 控制台编码导致中文/表情乱码
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def emit(event: str, **data) -> None:
    """输出一行事件"""
    data["event"] = event
    try:
        sys.stdout.write(json.dumps(data, ensure_ascii=False, default=str) + "\n")
        sys.stdout.flush()
    except (BrokenPipeError, OSError):
        # 程序已经关闭了管道，直接退出
        sys.exit(0)


def log(message: str) -> None:
    """调试信息写到 stderr，不影响事件输出"""
    try:
        sys.stderr.write(message + "\n")
        sys.stderr.flush()
    except (BrokenPipeError, OSError):
        pass


try:
    import httpx
    from TikTokLive import TikTokLiveClient
    from TikTokLive.client.errors import (
        SignatureRateLimitError,
        UserNotFoundError,
        UserOfflineError,
    )
    from TikTokLive.client.logger import LogLevel
    from TikTokLive.events import (
        CommentEvent,
        ConnectEvent,
        DisconnectEvent,
        FollowEvent,
        GiftEvent,
        JoinEvent,
        LikeEvent,
        LiveEndEvent,
        RoomUserSeqEvent,
    )
except ImportError as ex:
    emit(
        "error",
        fatal=True,
        code="missing_dependency",
        message=f"没有安装 TikTokLive 组件: {ex}",
    )
    sys.exit(3)


# ---------------------------------------------------------------------------
# 转换成抖音的数据结构
# 字段名、类型和抖音 protobuf 转 JSON 的结果保持一致：uint64 用字符串，uint32 用数字
# ---------------------------------------------------------------------------


def _str(value) -> str:
    return "" if value is None else str(value)


def image_json(image) -> dict:
    """ImageModel -> 抖音 Image"""
    if image is None:
        return {}
    data = {"urlListList": list(getattr(image, "url_list", None) or [])}
    if getattr(image, "uri", ""):
        data["uri"] = image.uri
    if getattr(image, "height", 0):
        data["height"] = _str(image.height)
    if getattr(image, "width", 0):
        data["width"] = _str(image.width)
    return data


def user_json(user) -> dict:
    """User -> 抖音 User"""
    if user is None:
        return {}
    user_id = getattr(user, "id", 0) or 0
    data = {
        "id": _str(user_id),
        "nickName": getattr(user, "nickname", "") or "",
        # TikTok 的 @用户名 对应抖音号
        "displayId": getattr(user, "display_id", "") or "",
        "secUid": getattr(user, "sec_uid", "") or "",
        "idStr": getattr(user, "id_str", "") or _str(user_id),
        "AvatarThumb": image_json(getattr(user, "avatar_thumb", None)),
        "AvatarMedium": image_json(getattr(user, "avatar_medium", None)),
        "AvatarLarge": image_json(getattr(user, "avatar_large", None)),
    }
    follow = getattr(user, "follow_info", None)
    if follow is not None:
        data["FollowInfo"] = {
            "followingCount": _str(getattr(follow, "following_count", 0)),
            "followerCount": _str(getattr(follow, "follower_count", 0)),
            "followStatus": _str(getattr(follow, "follow_status", 0)),
        }
    return data


def gift_json(gift) -> dict:
    """Gift -> 抖音 GiftStruct"""
    if gift is None:
        return {}
    return {
        "id": _str(getattr(gift, "id", 0)),
        "name": getattr(gift, "name", "") or "",
        "describe": getattr(gift, "describe", "") or "",
        "combo": bool(getattr(gift, "combo", False)),
        "type": int(getattr(gift, "type", 0) or 0),
        "diamondCount": int(getattr(gift, "diamond_count", 0) or 0),
        "icon": image_json(getattr(gift, "icon", None)),
        "image": image_json(getattr(gift, "image", None)),
    }


def msg_id(event) -> str:
    common = getattr(event, "common", None)
    return _str(getattr(common, "msg_id", 0)) if common else "0"


def first_url(value) -> str:
    """从 room_info 里的图片字段取第一个地址"""
    if isinstance(value, dict):
        urls = value.get("url_list") or []
        return urls[0] if urls else ""
    return ""


def room_json(info: dict) -> dict:
    """room_info -> 界面需要的直播间信息"""
    owner = info.get("owner") or {}
    stats = info.get("stats") or {}
    stream = info.get("stream_url") or {}
    flv = stream.get("flv_pull_url") or {}
    video = ""
    for key in ("HD1", "SD1", "SD2", "FULL_HD1"):
        if flv.get(key):
            video = flv[key]
            break
    if not video and flv:
        video = next(iter(flv.values()))
    return {
        "roomId": _str(info.get("id_str") or info.get("id")),
        "title": info.get("title") or "",
        "status": info.get("status"),
        "nickName": owner.get("nickname") or "",
        "avatar": first_url(owner.get("avatar_thumb")),
        "userCount": info.get("user_count") or 0,
        "likeCount": stats.get("like_count") or 0,
        "followerCount": (owner.get("follow_info") or {}).get("follower_count") or 0,
        "videoUrl": video,
    }


# ---------------------------------------------------------------------------
# 连接与重连
# ---------------------------------------------------------------------------

# 超过这个时间没有收到任何事件，认为连接已经假死，主动重连
STALE_TIMEOUT = 90
MAX_RECONNECT_DELAY = 60


class Bridge:
    def __init__(self, unique_id: str, proxy: str):
        self.unique_id = TikTokLiveClient.parse_unique_id(unique_id)
        self.proxy = proxy
        self.live_ended = False
        self.last_event_at = time.monotonic()

    def make_client(self) -> "TikTokLiveClient":
        kwargs = {"unique_id": self.unique_id}
        if self.proxy:
            kwargs["web_proxy"] = httpx.Proxy(self.proxy)
            kwargs["ws_proxy"] = httpx.Proxy(self.proxy)
        client = TikTokLiveClient(**kwargs)
        client.logger.setLevel(LogLevel.ERROR.value)
        self.bind(client)
        return client

    def touch(self) -> None:
        self.last_event_at = time.monotonic()

    def bind(self, client: "TikTokLiveClient") -> None:
        @client.on(ConnectEvent)
        async def on_connect(event: ConnectEvent):
            self.touch()
            emit("status", status="connected", roomId=_str(event.room_id))
            if client.room_info:
                try:
                    emit("room", **room_json(client.room_info))
                except Exception as ex:
                    log(f"解析直播间信息失败: {ex}")

        @client.on(CommentEvent)
        async def on_comment(event: CommentEvent):
            self.touch()
            emit("chat", id=msg_id(event), user=user_json(event.user), content=event.comment or "")

        @client.on(GiftEvent)
        async def on_gift(event: GiftEvent):
            self.touch()
            gift = gift_json(event.gift)
            emit(
                "gift",
                id=msg_id(event),
                user=user_json(event.user),
                gift=gift,
                giftId=_str(event.gift_id or gift.get("id")),
                repeatCount=int(event.repeat_count or 1),
                repeatEnd=int(event.repeat_end or 0),
                groupId=_str(event.group_id),
            )

        @client.on(LikeEvent)
        async def on_like(event: LikeEvent):
            self.touch()
            emit(
                "like",
                id=msg_id(event),
                user=user_json(event.user),
                count=int(event.count or 0),
                total=int(event.total or 0),
            )

        @client.on(JoinEvent)
        async def on_join(event: JoinEvent):
            self.touch()
            emit("join", id=msg_id(event), user=user_json(event.user))

        @client.on(FollowEvent)
        async def on_follow(event: FollowEvent):
            self.touch()
            emit(
                "follow",
                id=msg_id(event),
                user=user_json(event.user),
                followCount=int(getattr(event, "follow_count", 0) or 0),
            )

        @client.on(RoomUserSeqEvent)
        async def on_stats(event: RoomUserSeqEvent):
            self.touch()
            emit("stats", viewers=int(event.total or 0))

        @client.on(LiveEndEvent)
        async def on_live_end(_: LiveEndEvent):
            self.live_ended = True

        @client.on(DisconnectEvent)
        async def on_disconnect(_: DisconnectEvent):
            log("连接已断开")

    async def watchdog(self, client: "TikTokLiveClient") -> None:
        """长时间没有事件时主动断开，交给外层重连"""
        while True:
            await asyncio.sleep(10)
            if time.monotonic() - self.last_event_at > STALE_TIMEOUT:
                log("长时间未收到事件，重新连接")
                try:
                    await client.disconnect()
                except Exception:
                    pass
                return

    async def run(self) -> int:
        attempt = 0
        while True:
            emit("status", status="connecting" if attempt == 0 else "reconnecting")
            client = self.make_client()
            self.touch()
            watchdog = None
            connected_at = time.monotonic()
            try:
                watchdog = asyncio.create_task(self.watchdog(client))
                await client.connect(fetch_room_info=True)
            except UserOfflineError:
                emit("offline", message="主播当前没有在直播")
                return 0
            except UserNotFoundError:
                emit("error", fatal=True, code="user_not_found", message=f"找不到 TikTok 用户 @{self.unique_id}")
                return 2
            except SignatureRateLimitError as ex:
                emit("error", code="rate_limit", message=f"签名服务限流，稍后自动重试: {ex}")
                attempt = max(attempt, 5)
            except Exception as ex:
                log(traceback.format_exc())
                emit("error", code="connect_failed", message=f"连接失败: {type(ex).__name__}: {ex}")
            finally:
                if watchdog:
                    watchdog.cancel()
                try:
                    await client.disconnect()
                except Exception:
                    pass

            if self.live_ended:
                emit("live_end", message="直播已结束")
                return 0

            # 连接稳定过一段时间，重连退避归零
            if time.monotonic() - connected_at > 120:
                attempt = 0
            attempt += 1
            delay = min(2 ** attempt, MAX_RECONNECT_DELAY)
            log(f"{delay} 秒后第 {attempt} 次重连")
            await asyncio.sleep(delay)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("unique_id")
    parser.add_argument("--proxy", default="")
    args = parser.parse_args()
    try:
        return asyncio.run(Bridge(args.unique_id, args.proxy.strip()).run())
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())
