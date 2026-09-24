/**
 * File Watcher Service for NoteVault.
 * Ported from notevault_app/core/file_watcher.py.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export class FileWatcherService {
  private watchDir: string;
  private onModifiedCallback: (p: string) => void;
  private watcher: fs.FSWatcher | null = null;
  private lastModifiedTime = 0;
  isRunning = false;

  constructor(watchDir: string, onModifiedCallback: (p: string) => void) {
    this.watchDir = path.resolve(watchDir);
    this.onModifiedCallback = onModifiedCallback;
  }

  start(): void {
    if (this.isRunning || !fs.existsSync(this.watchDir)) {
      return;
    }

    try {
      this.watcher = fs.watch(this.watchDir, { recursive: true }, (_eventType, filename) => {
        if (!filename || !filename.endsWith(".md")) {
          return;
        }

        const now = performance.now();
        if (now - this.lastModifiedTime < 300) {
          return;
        }
        this.lastModifiedTime = now;

        const fullPath = path.join(this.watchDir, filename);
        try {
          this.onModifiedCallback(fullPath);
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
      this.watcher.close();
      this.watcher = null;
    }
    this.isRunning = false;
  }

  refresh(): void {
    // Manual trigger hook for renderer refresh requests
    try {
      this.onModifiedCallback(this.watchDir);
    } catch {
      // Ignore
    }
  }
}
