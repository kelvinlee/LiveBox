"""LiveBox TikTok worker: one JSON configuration, then newline-delimited commands/events."""
import asyncio
import contextlib
import json
import logging
import sys
import threading
from collections import OrderedDict
from uuid import uuid4

from protocol import account_from_input, image_urls, normalize_event, stream_sources

OUTPUT = sys.stdout


def emit(kind, **data):
    OUTPUT.write(json.dumps({"type": kind, **data}, ensure_ascii=False) + "\n")
    OUTPUT.flush()


async def run(config):
    from httpx import AsyncClient, Proxy
    from TikTokLive import TikTokLiveClient
    from TikTokLive.events import CommentEvent, GiftEvent, LikeEvent, ConnectEvent, LiveEndEvent, RoomUserSeqEvent
    from media import MediaGateway

    account = account_from_input(config.get("account", ""))
    proxy_url = (config.get("proxy") or "").strip() or None
    api_key = (config.get("apiKey") or "").strip() or None
    proxy = Proxy(proxy_url) if proxy_url else None
    client = TikTokLiveClient(
        unique_id=account, web_proxy=proxy, ws_proxy=proxy,
        web_kwargs={"signer_kwargs": {"sign_api_key": api_key}},
    )
    # Upstream signer defaults disable TLS verification and do not inherit web_proxy.
    # Configure its SDK HTTP client explicitly for the same proxy and verified TLS.
    signer_http = AsyncClient(base_url=client.web.signer.sdk_client._base_url,
                              proxy=proxy_url, timeout=30, verify=True,
                              headers={"User-Agent": "TikTokLive.py/7.0.1", **({"X-Api-Key": api_key} if api_key else {})})
    client.web.signer.sdk_client.set_async_httpx_client(signer_http)
    client.logger.setLevel(logging.CRITICAL)
    gateway = MediaGateway(proxy_url, client.web.headers.get('User-Agent'))
    stop = asyncio.Event()
    refresh = asyncio.Event()
    loop = asyncio.get_running_loop()
    seen = OrderedDict()

    def commands():
        try:
            for line in sys.stdin:
                command = json.loads(line)
                if command.get("action") == "refresh":
                    loop.call_soon_threadsafe(refresh.set)
                elif command.get("action") == "stop":
                    break
        except (ValueError, OSError):
            pass
        finally:
            if not loop.is_closed():
                loop.call_soon_threadsafe(stop.set)

    threading.Thread(target=commands, daemon=True).start()

    def publish(kind, event):
        data = normalize_event(kind, event)
        if data is None:
            return
        identity = data["id"]
        key = (kind, identity)
        if identity and key in seen:
            return
        if identity:
            seen[key] = True
            if len(seen) > 5000:
                seen.popitem(last=False)
        else:
            data["id"] = uuid4().hex
        emit("event", event=data)

    @client.on(CommentEvent)
    async def comment(event):
        publish("chat", event)

    @client.on(GiftEvent)
    async def gift(event):
        publish("gift", event)

    @client.on(LikeEvent)
    async def like(event):
        publish("like", event)

    @client.on(ConnectEvent)
    async def connected(event):
        emit("status", state="connected", message="TikTok 实时消息已连接", roomId=str(event.room_id))

    @client.on(RoomUserSeqEvent)
    async def viewers(event):
        emit("stats", viewers=int(event.total))

    @client.on(LiveEndEvent)
    async def ended(_):
        emit("status", state="ended", message="直播已结束")
        stop.set()

    async def rooms():
        while not stop.is_set():
            refresh.clear()
            try:
                room = await client.web.fetch_room_info(unique_id=account)
                owner = room.get("owner") or {}
                streams = stream_sources(room)
                for source in streams:
                    source["url"] = gateway.register(source["url"])
                emit("room", room={
                    "id": str(room.get("id_str") or room.get("id") or ""),
                    "name": owner.get("nickname", account), "title": room.get("title", ""),
                    "avatar": next(iter(image_urls(owner.get("avatar_thumb"))), ""),
                    "viewers": room.get("user_count", 0), "streams": streams,
                })
                if not streams:
                    emit("video_error", message="未获取到视频地址；实时消息采集可继续运行")
            except Exception:
                emit("video_error", message="获取视频地址失败，请检查网络后点击刷新视频；实时消息采集独立运行")
            # Refresh only on request so a playing stream is not restarted periodically.
            await refresh.wait()

    async def chat_connection():
        for attempt in range(5):
            if stop.is_set():
                return
            emit("status", state="connecting", message=f"正在连接 TikTok（第 {attempt + 1} 次）")
            try:
                # A fresh connect gets a fresh signed URL. Room/video fetch is independent.
                task = await client.start(fetch_room_info=False)
                await task
                if stop.is_set():
                    return
                message = "消息连接已断开，正在重新连接"
                delay = min(30, 2 ** (attempt + 1))
            except Exception as error:
                code = type(error).__name__
                if code in ("UserOfflineError", "UserNotFoundError", "AgeRestrictedError"):
                    emit("status", state="error", message={
                        "UserOfflineError": "主播尚未开播",
                        "UserNotFoundError": "未找到主播，请检查用户名",
                        "AgeRestrictedError": "该直播间存在访问限制",
                    }[code], code=code)
                    return
                delay = max(2, min(300, float(getattr(error, "retry_after", 0) or 2 ** (attempt + 1))))
                message = f"消息连接失败（{code}），{int(delay)} 秒后重试；请检查网络、代理或签名服务额度"
            emit("status", state="reconnecting", message=message)
            try:
                await asyncio.wait_for(stop.wait(), timeout=delay)
                return
            except asyncio.TimeoutError:
                pass
        emit("status", state="error", message="消息连接多次失败，请停止后重新采集；已获取的视频仍可播放")

    tasks = [asyncio.create_task(rooms()), asyncio.create_task(chat_connection())]
    try:
        await stop.wait()
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        with contextlib.suppress(Exception, asyncio.CancelledError):
            await client.disconnect()
        await signer_http.aclose()
        await client.web.httpx_client.aclose()
        await asyncio.to_thread(gateway.close)
        emit("status", state="stopped", message="TikTok 采集已停止")


def main():
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
        OUTPUT.reconfigure(encoding="utf-8", line_buffering=True)
    try:
        config = json.loads(sys.stdin.readline())
        # Reserve stdout for our protocol even if a dependency prints diagnostics.
        with contextlib.redirect_stdout(sys.stderr):
            asyncio.run(run(config))
    except Exception as error:
        code = type(error).__name__
        message = "采集程序缺少依赖，请重新打包 TikTok 组件" if isinstance(error, ImportError) else "TikTok 组件启动失败，请检查配置或重新打包"
        emit("status", state="error", code=code, message=message)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
