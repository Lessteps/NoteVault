// Ported from notevault_app/webapp/media.py
//
// A tiny local server that streams media files to the web UI. Files are too big
// for data: URLs and the renderer cannot read the disk. The API registers one
// file at a time and gets back an unguessable URL; only those files are served,
// only on 127.0.0.1, with Range support so the player can seek.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import * as path from "node:path";

const CHUNK = 256 * 1024;
const MAX_ENTRIES = 64;

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".ogg": "video/ogg",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".opus": "audio/opus",
};

function guessType(name: string): string {
  return MIME[path.extname(name).toLowerCase()] || "application/octet-stream";
}

export class MediaServer {
  private server: http.Server | null = null;
  private files = new Map<string, string>();
  private port = 0;

  private async ensure(): Promise<http.Server> {
    if (this.server !== null) return this.server;
    const srv = http.createServer((req, res) => this.serve(req, res));
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    this.port = (srv.address() as AddressInfo).port;
    this.server = srv;
    return srv;
  }

  private target(url: string): string | null {
    const parts = (url.split("?")[0] || "").replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length !== 2 || parts[0] !== "m") return null;
    return this.files.get(parts[1]!) ?? null;
  }

  private serve(req: http.IncomingMessage, res: http.ServerResponse): void {
    const p = this.target(req.url || "");
    let size: number;
    if (p === null || !fs.existsSync(p) || !fs.statSync(p).isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    size = fs.statSync(p).size;
    let start = 0;
    let end = size - 1;
    let status = 200;
    const rng = req.headers.range || "";
    if (rng.startsWith("bytes=")) {
      const spec = rng.slice(6).split(",")[0] || "";
      const dash = spec.indexOf("-");
      const a = spec.slice(0, dash);
      const b = spec.slice(dash + 1);
      let bad = false;
      if (a) {
        start = parseInt(a, 10);
        end = b ? parseInt(b, 10) : size - 1;
      } else {
        start = Math.max(0, size - parseInt(b, 10));
      }
      end = Math.min(end, size - 1);
      if (!Number.isFinite(start) || start > end || start >= size) bad = true;
      if (bad) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` });
        res.end();
        return;
      }
      status = 206;
    }
    const headers: Record<string, string> = {
      "Content-Type": guessType(p),
      "Accept-Ranges": "bytes",
      "Content-Length": String(end - start + 1),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    if (status === 206) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    res.writeHead(status, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const stream = fs.createReadStream(p, { start, end, highWaterMark: CHUNK });
    stream.on("error", () => res.end());
    stream.pipe(res);
  }

  async urlFor(filePath: string): Promise<string> {
    const srv = await this.ensure();
    let token: string | null = null;
    for (const [t, fp] of this.files) {
      if (fp === filePath) {
        token = t;
        break;
      }
    }
    if (token === null) {
      if (this.files.size >= MAX_ENTRIES) {
        const first = this.files.keys().next().value;
        if (first !== undefined) this.files.delete(first);
      }
      token = crypto.randomBytes(16).toString("hex");
      this.files.set(token, filePath);
    }
    void srv;
    return `http://127.0.0.1:${this.port}/m/${token}`;
  }

  shutdown(): void {
    if (this.server !== null) {
      this.server.close();
      this.server = null;
    }
  }
}
