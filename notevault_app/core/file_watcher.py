"""
SDD File Watcher Service
Uses watchdog to monitor project files and deliverable changes in real-time.
"""

import time
import threading
from pathlib import Path
from typing import Callable, Optional
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileModifiedEvent

class DeliverableFileHandler(FileSystemEventHandler):
    def __init__(self, on_modified_callback: Callable[[str], None]):
        super().__init__()
        self.on_modified_callback = on_modified_callback
        self.last_modified_time = 0

    def on_modified(self, event):
        if event.is_directory or not event.src_path.endswith(".md"):
            return

        # Debounce multiple rapid events (within 300ms)
        current_time = time.time()
        if current_time - self.last_modified_time < 0.3:
            return
        self.last_modified_time = current_time

        try:
            self.on_modified_callback(event.src_path)
        except Exception as e:
            print(f"Error in file watcher callback: {e}")

class FileWatcherService:
    def __init__(self, watch_dir: Path, on_modified_callback: Callable[[str], None]):
        self.watch_dir = watch_dir
        self.on_modified_callback = on_modified_callback
        self.observer: Optional[Observer] = None
        self.is_running = False

    def start(self):
        if self.is_running or not self.watch_dir.exists():
            return

        handler = DeliverableFileHandler(self.on_modified_callback)
        self.observer = Observer()
        self.observer.schedule(handler, str(self.watch_dir), recursive=True)
        self.observer.start()
        self.is_running = True

    def stop(self):
        if self.observer and self.is_running:
            self.observer.stop()
            self.observer.join(timeout=2.0)
            self.is_running = False
