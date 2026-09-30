/**
 * File Watcher Service for NoteVault.
 * Ported from notevault_app/core/file_watcher.py.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { ATTACHMENTS_DIR } from "./attachments";

export interface WatchEvent {
  eventType: string;
  relPath: string;
  fullPath: string;
}

export type WatchCallback = (event: WatchEvent) => void;

/** The old Python signature took a bare path; kept for callers that still do. */
export type LegacyWatchCallback = (path: string, event: WatchEvent) => void;

export class FileWatcherService {
  private watchDir: string;
  private onModifiedCallback: WatchCallback;
  private watcher: fs.FSWatcher | null = null;
  private lastTriggerTimes = new Map<string, number>();
  isRunning = false;

  /**
   * `onModifiedCallback` receives the whole event. The port from Python also
   * fired a second call with the bare path, so an Electron listener that only
   * wanted the event saw a string first and a string in `relPath`; only one call
   * per change now. A listener that takes a path as its first argument still
   * works: the event carries `fullPath`.
   */
  constructor(watchDir: string, onModifiedCallback: WatchCallback | LegacyWatchCallback) {
    this.watchDir = path.resolve(watchDir);
    this.onModifiedCallback = (event: WatchEvent) => {
      if (typeof onModifiedCallback === "function") {
        try {
          (onModifiedCallback as WatchCallback)(event);
        } catch {
          // Ignore callback errors
        }
      }
    };
  }

  start(): void {
    if (this.isRunning || !fs.existsSync(this.watchDir)) {
      return;
    }

    try {
      this.watcher = fs.watch(this.watchDir, { recursive: true }, (eventType, rawFilename) => {
        if (!rawFilename) return;
        const filename = String(rawFilename).replace(/\\/g, "/");

        // Ignore internal directories and attachments:
        // .git, .trash, .notevault, node_modules, etc.
        const parts = filename.split("/").filter(Boolean);
        if (parts.some((p) => p.startsWith(".") || p === "node_modules" || p === "__pycache__" || p === ATTACHMENTS_DIR)) {
          return;
        }

        const now = performance.now();
        const prev = this.lastTriggerTimes.get(filename) ?? 0;
        if (now - prev < 200) {
          return;
        }
        this.lastTriggerTimes.set(filename, now);
        if (this.lastTriggerTimes.size > 200) {
          this.lastTriggerTimes.clear();
        }

        const fullPath = path.join(this.watchDir, filename);
        try {
          this.onModifiedCallback({
            eventType: eventType ?? "change",
            relPath: filename,
            fullPath,
          });
        } catch {
          // Ignore callback errors
        }
      });
      this.isRunning = true;
    } catch {
      this.isRunning = false;
    }
  }

  stop(): void {
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {
        /* ignore close errors */
      }
      this.watcher = null;
    }
    this.isRunning = false;
  }

  refresh(): void {
    try {
      this.onModifiedCallback({
        eventType: "change",
        relPath: "",
        fullPath: this.watchDir,
      });
    } catch {
      // Ignore
    }
  }
}
