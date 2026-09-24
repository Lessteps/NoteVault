"""A tiny local server that streams video files to the web UI.

Videos are too big for data: URLs and the page cannot read the disk. The API
registers one file at a time and gets back an unguessable URL; only those
files are ever served, only on 127.0.0.1, with Range support so the player
can seek. Nothing else (no listing, no paths in the URL).
"""

from __future__ import annotations

import mimetypes
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional

CHUNK = 256 * 1024
MAX_ENTRIES = 64


class _Handler(BaseHTTPRequestHandler):
    server_version = "NoteVaultMedia"

    def log_message(self, *_args):
        pass

    def _target(self) -> Optional[Path]:
        parts = self.path.split("?", 1)[0].strip("/").split("/")
        if len(parts) != 2 or parts[0] != "m":
            return None
        return self.server.files.get(parts[1])  # type: ignore[attr-defined]

    def do_HEAD(self):
        self._serve(body=False)

    def do_GET(self):
        self._serve(body=True)

    def _serve(self, body: bool):
        path = self._target()
        if path is None or not path.is_file():
            self.send_error(404)
            return
        size = path.stat().st_size
        start, end = 0, size - 1
        status = 200
        rng = self.headers.get("Range", "")
        if rng.startswith("bytes="):
            try:
                a, _, b = rng[6:].split(",")[0].partition("-")
                if a:
                    start = int(a)
                    end = int(b) if b else size - 1
                else:
                    start = max(0, size - int(b))
                end = min(end, size - 1)
                if start > end or start >= size:
                    raise ValueError
                status = 206
            except ValueError:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{size}")
                self.end_headers()
                return
        self.send_response(status)
        self.send_header("Content-Type", mimetypes.guess_type(path.name)[0] or "application/octet-stream")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.end_headers()
        if not body:
            return
        with open(path, "rb") as fh:
            fh.seek(start)
            left = end - start + 1
            try:
                while left > 0:
                    data = fh.read(min(CHUNK, left))
                    if not data:
                        break
                    self.wfile.write(data)
                    left -= len(data)
            except (BrokenPipeError, ConnectionResetError):
                pass     # the player jumped elsewhere


class MediaServer:
    def __init__(self):
        self._lock = threading.Lock()
        self._server: Optional[ThreadingHTTPServer] = None

    def _ensure(self) -> ThreadingHTTPServer:
        with self._lock:
            if self._server is None:
                srv = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
                srv.daemon_threads = True
                srv.files = {}  # type: ignore[attr-defined]
                threading.Thread(target=srv.serve_forever, daemon=True).start()
                self._server = srv
            return self._server

    def url_for(self, path: Path) -> str:
        srv = self._ensure()
        files = srv.files  # type: ignore[attr-defined]
        with self._lock:
            for token, p in files.items():
                if p == path:
                    break
            else:
                if len(files) >= MAX_ENTRIES:
                    files.pop(next(iter(files)))
                token = secrets.token_hex(16)
                files[token] = path
        return f"http://127.0.0.1:{srv.server_address[1]}/m/{token}"

    def shutdown(self):
        with self._lock:
            if self._server is not None:
                self._server.shutdown()
                self._server.server_close()
                self._server = None
