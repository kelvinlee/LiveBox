"""Token-scoped loopback gateway for HLS/FLV, including HLS keys/segments."""
import re
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urljoin, urlparse

import httpx


class MediaGateway:
    def __init__(self, proxy=None, user_agent=None):
        self.token = secrets.token_urlsafe(24)
        self.urls = {}
        self.reverse = {}
        self.lock = threading.Lock()
        self.client = httpx.Client(proxy=proxy, follow_redirects=True, timeout=httpx.Timeout(30, read=20),
                                   headers={"User-Agent": user_agent or "Mozilla/5.0"})
        gateway = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.0"

            def log_message(self, *_):
                pass

            def do_OPTIONS(self):
                self.send_response(204)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Headers", "Range")
                self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
                self.end_headers()

            def do_GET(self):
                with gateway.lock:
                    url = gateway.urls.get(self.path)
                if not url:
                    self.send_error(404)
                    return
                headers = {"Referer": "https://www.tiktok.com/", "Origin": "https://www.tiktok.com"}
                if self.headers.get("Range"):
                    headers["Range"] = self.headers["Range"]
                try:
                    with gateway.client.stream("GET", url, headers=headers) as upstream:
                        if upstream.status_code not in (200, 206):
                            self.send_response(upstream.status_code)
                            self.send_header("Access-Control-Allow-Origin", "*")
                            self.end_headers()
                            return
                        content_type = upstream.headers.get("content-type", "application/octet-stream")
                        playlist = ".m3u8" in urlparse(str(upstream.url)).path.lower() or "mpegurl" in content_type.lower()
                        self.send_response(upstream.status_code)
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.send_header("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges")
                        self.send_header("Cache-Control", "no-store")
                        self.send_header("Content-Type", "application/vnd.apple.mpegurl" if playlist else content_type)
                        if not playlist:
                            for name in ("content-range", "accept-ranges"):
                                if name in upstream.headers:
                                    self.send_header(name, upstream.headers[name])
                        self.end_headers()
                        if playlist:
                            raw = upstream.read()
                            if len(raw) > 2 * 1024 * 1024:
                                return
                            self.wfile.write(gateway.rewrite_playlist(raw.decode("utf-8-sig"), str(upstream.url)).encode())
                        else:
                            for chunk in upstream.iter_bytes():
                                self.wfile.write(chunk)
                                self.wfile.flush()
                except (httpx.HTTPError, OSError, ValueError):
                    # The player reports errors and offers refresh/fallback.
                    self.close_connection = True

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def register(self, url):
        parsed = urlparse(url)
        if parsed.scheme not in ("https", "http") or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Unsupported media URL")
        with self.lock:
            if url not in self.reverse:
                # Bound memory for long-running HLS streams. Stale requests can be retried by the player.
                if len(self.urls) >= 20000:
                    oldest = next(iter(self.urls))
                    self.reverse.pop(self.urls.pop(oldest), None)
                path = f"/{self.token}/{secrets.token_urlsafe(12)}"
                self.urls[path] = url
                self.reverse[url] = path
            path = self.reverse[url]
        return f"http://127.0.0.1:{self.server.server_port}{path}"

    def rewrite_playlist(self, text, base):
        result = []
        for line in text.splitlines():
            if line.startswith("#"):
                line = re.sub(r'URI="([^"]+)"', lambda m: f'URI="{self.register(urljoin(base, m[1]))}"', line)
            elif line.strip():
                line = self.register(urljoin(base, line.strip()))
            result.append(line)
        return "\n".join(result) + "\n"

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.client.close()
