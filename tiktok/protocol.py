"""Pure data conversion; no TikTok/network imports, also used by offline tests."""
import json
import re
from urllib.parse import urlparse


def account_from_input(value):
    value = value.strip()
    if "://" in value:
        parsed = urlparse(value)
        if parsed.scheme != "https" or parsed.hostname not in ("www.tiktok.com", "tiktok.com"):
            raise ValueError("请输入 TikTok 主播用户名或 https://www.tiktok.com/@用户名/live")
        match = re.fullmatch(r"/@([\w.]+)(?:/live)?/?", parsed.path, re.ASCII)
        value = match.group(1) if match else ""
    value = value.removeprefix("@")
    if not re.fullmatch(r"[A-Za-z0-9_.]{1,64}", value):
        raise ValueError("TikTok 用户名格式不正确；暂不支持短链接")
    return value


def image_urls(image):
    if isinstance(image, dict):
        return image.get("url_list", [])
    return list(getattr(image, "url_list", []) or [])


def normalize_user(user):
    return {
        "id": str(getattr(user, "id", 0)),
        "uniqueId": str(getattr(user, "unique_id", "")),
        "nickName": str(getattr(user, "nickname", "")),
        "avatarThumb": {"urlListList": image_urls(getattr(user, "avatar_thumb", None))},
    }


def event_id(event):
    return str(getattr(getattr(event, "common", None), "msg_id", 0) or "")


def normalize_event(kind, event):
    result = {"type": kind, "id": event_id(event), "user": normalize_user(event.user)}
    if kind == "chat":
        result["content"] = event.comment
    elif kind == "like":
        result.update(like=int(event.count), total=int(event.total))
    elif kind == "gift":
        # Intermediate repeat_count values are cumulative, not increments.
        if event.streaking or event.gift is None:
            return None
        gift = event.gift
        result.update(
            gift={"id": str(gift.id), "name": gift.name,
                  "diamondCount": int(gift.diamond_count),
                  "icon": {"urlListList": image_urls(gift.image)}},
            repeatCount=max(1, int(event.repeat_count)),
        )
    return result


def stream_sources(room):
    stream = room.get("stream_url") or {}
    sources = []

    def add(label, kind, url):
        if isinstance(url, str) and url.startswith(("https://", "http://")) and not any(s["url"] == url for s in sources):
            sources.append({"label": label, "format": kind, "url": url})

    raw = ((stream.get("live_core_sdk_data") or {}).get("pull_data") or {}).get("stream_data", {})
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
        for quality, entry in (data.get("data", {}) if isinstance(data, dict) else {}).items():
            if quality.upper() in ("AO", "AUDIO_ONLY"):
                continue
            for kind in ("hls", "flv"):
                add(f"{quality.upper()} · {kind.upper()}", kind, (entry.get("main") or {}).get(kind))
    except (ValueError, TypeError, AttributeError):
        pass
    add("默认 · HLS", "hls", stream.get("hls_pull_url"))
    for quality, url in (stream.get("flv_pull_url") or {}).items():
        if quality.upper() in ("AO", "AUDIO_ONLY"):
            continue
        add(f"{quality} · FLV", "flv", url)
    add("默认 · FLV", "flv", stream.get("rtmp_pull_url"))
    return sources
