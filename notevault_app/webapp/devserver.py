"""
Development / test bridge: the same NoteVaultApi over localhost HTTP.

The desktop app never uses this — pywebview injects the API directly. It
exists so the UI can be opened in an ordinary browser (devtools, hot reload)
and driven by automated tests against the real Python logic.

Guard rails, since it can read and write the vault:
- binds 127.0.0.1 only;
- every API call must carry the per-run token (X-NoteVault-Token); the
  page fetches it from /__nv_dev_token, which sends no CORS headers, so
  only a page served by this process (same origin) can read it;
- the Host header must be this server (blocks DNS-rebinding attacks);
- only NoteVaultApi's public methods can be dispatched.

    python -m notevault_app.webapp.devserver [--vault PATH] [--port 8765]
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .api import ApiError, NoteVaultApi, public_methods

DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
MAX_BODY = 12 * 1024 * 1024
CSP = ("default-src 'self'; img-src 'self' data:; media-src http://127.0.0.1:* blob:; style-src 'self' 'unsafe-inline'; "
       "font-src 'self' data:; script-src 'self' 'unsafe-eval'; connect-src 'self'; "
       "object-src 'none'; base-uri 'none'; frame-ancestors 'none'")


def make_server(api: NoteVaultApi, port: int = 8765, dist: Path = DIST,
                token: str | None = None) -> tuple[ThreadingHTTPServer, str]:
    token = token or secrets.token_urlsafe(24)
    allowed = set(public_methods())
    dist = dist.resolve()

    class Handler(BaseHTTPRequestHandler):
        server_version = "NoteVaultDev"

        def log_message(self, *_):   # quiet
            pass

        def _host_ok(self) -> bool:
            port_ = self.server.server_address[1]
            return self.headers.get("Host", "") in (
                f"127.0.0.1:{port_}", f"localhost:{port_}")

        def _send(self, code: int, body: bytes, ctype: str):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Cache-Control", "no-store")
            if ctype.startswith("text/html"):
                self.send_header("Content-Security-Policy", CSP)
            self.end_headers()
            self.wfile.write(body)

        def _json(self, code: int, obj):
            self._send(code, json.dumps(obj).encode("utf-8"),
                       "application/json; charset=utf-8")

        def do_POST(self):
            if not self._host_ok():
                return self._json(403, {"error": "host"})
            if not self.path.startswith("/api/"):
                return self._json(404, {"error": "not found"})
            if not secrets.compare_digest(
                    self.headers.get("X-NoteVault-Token", ""), token):
                return self._json(403, {"error": "token"})
            method = self.path[len("/api/"):]
            if method not in allowed:
                return self._json(404, {"error": f"unknown method {method}"})
            length = int(self.headers.get("Content-Length") or 0)
            if length > MAX_BODY:
                return self._json(413, {"error": "too large"})
            try:
                payload = json.loads(self.rfile.read(length) or b"{}")
                args = payload.get("args", [])
                if not isinstance(args, list):
                    raise ApiError("args must be a list")
                result = getattr(api, method)(*args)
            except ApiError as exc:
                return self._json(400, {"error": str(exc)})
            except (TypeError, ValueError, json.JSONDecodeError) as exc:
                return self._json(400, {"error": f"bad request: {exc}"})
            return self._json(200, {"result": result})

        def do_GET(self):
            if not self._host_ok():
                return self._send(403, b"host", "text/plain")
            if self.path == "/__nv_dev_token":
                return self._json(200, {"token": token})
            rel = self.path.split("?", 1)[0].lstrip("/") or "index.html"
            target = (dist / rel).resolve()
            if dist not in target.parents or not target.is_file():
                target = dist / "index.html"          # SPA fallback
            if not target.is_file():
                return self._send(404, b"frontend not built: run npm run build",
                                  "text/plain")
            body = target.read_bytes()
            ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            if target.suffix == ".html":
                ctype = "text/html; charset=utf-8"
            elif target.suffix == ".js":
                ctype = "text/javascript; charset=utf-8"
            self._send(200, body, ctype)

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    return server, token


def serve_in_thread(api: NoteVaultApi, port: int = 0, dist: Path = DIST):
    """Start on a free port in a daemon thread; returns (server, url, token)."""
    server, token = make_server(api, port, dist)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, f"http://127.0.0.1:{server.server_address[1]}/", token


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument("--vault", type=Path, default=None)
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()
    server, _token = make_server(NoteVaultApi(args.vault), args.port)
    print(f"NoteVault dev bridge on http://127.0.0.1:{args.port}/  (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
