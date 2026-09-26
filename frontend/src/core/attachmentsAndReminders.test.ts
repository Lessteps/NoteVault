import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  attachmentsFolder,
  importFile,
  kindOf,
  markdownFor,
  resolveAttachment,
} from "./attachments";
import {
  folderFor,
  isSupported,
  removeModuleAttachment,
  resolveModuleAttachment,
  storeFile,
} from "./moduleAttachments";
import {
  dueNow,
  staleReminders,
  summarizeReminders,
  upcomingReminders,
} from "./reminderScheduler";

describe("attachments and reminders", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nv_att_"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  describe("attachments", () => {
    it("classifies file kind by extension", () => {
      expect(kindOf("pic.png")).toBe("image");
      expect(kindOf("clip.mp4")).toBe("video");
      expect(kindOf("song.mp3")).toBe("audio");
      expect(kindOf("doc.pdf")).toBe("pdf");
      expect(kindOf("code.py")).toBeNull();
    });

    it("imports and resolves note attachment", () => {
      const notePath = path.join(tmp, "Note.md");
      fs.writeFileSync(notePath, "# Note\n");
      const srcFile = path.join(tmp, "photo.png");
      fs.writeFileSync(srcFile, "fake-bytes");

      const imported = importFile(notePath, srcFile);
      expect(fs.existsSync(imported)).toBe(true);
      expect(imported).toContain(attachmentsFolder(notePath));

      const md = markdownFor(notePath, imported);
      expect(md).toContain("attachments/photo.png");

      const resolved = resolveAttachment(notePath, "photo.png", tmp);
      expect(resolved).not.toBeNull();
    });
  });

  describe("moduleAttachments", () => {
    it("determines folder and support", () => {
      expect(isSupported("invoice.pdf")).toBe(true);
      expect(isSupported("virus.exe")).toBe(false);

      const f = folderFor(tmp, "finanzas", new Date(2026, 8, 14));
      expect(f.replace(/\\/g, "/")).toContain(".notevault/finanzas/adjuntos/2026/09");
    });

    it("stores and resolves module attachment", () => {
      const srcFile = path.join(tmp, "factura.png");
      fs.writeFileSync(srcFile, "invoice-data");

      const ref = storeFile(tmp, "finanzas", "mv1", srcFile, new Date(2026, 8, 14));
      expect(ref.replace(/\\/g, "/")).toBe("finanzas/adjuntos/2026/09/mv1-1.png");

      const abs = resolveModuleAttachment(tmp, ref);
      expect(abs).not.toBeNull();
      expect(fs.existsSync(abs!)).toBe(true);

      removeModuleAttachment(tmp, ref, "finanzas");
      expect(resolveModuleAttachment(tmp, ref)).toBeNull();
    });
  });

  describe("reminderScheduler", () => {
    it("builds and computes dueNow, stale, upcoming", () => {
      const now = new Date(2026, 8, 12, 10, 0, 0);

      const taskDue5m = {
        id: "t1",
        name: "Tarea 1",
        reminder: new Date(now.getTime() - 5 * 60 * 1000),
        reminder_done: false,
        is_done: false,
      };

      const taskIn1h = {
        id: "t2",
        name: "Tarea 2",
        reminder: new Date(now.getTime() + 60 * 60 * 1000),
        reminder_done: false,
        is_done: false,
      };

      const taskStale = {
        id: "t3",
        name: "Tarea 3",
        reminder: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        reminder_done: false,
        is_done: false,
      };

      const tasks = [taskDue5m, taskIn1h, taskStale];

      const due = dueNow(tasks, now);
      expect(due.map((r) => r.taskId)).toEqual(["t1"]);

      const stale = staleReminders(tasks, now);
      expect(stale.map((r) => r.taskId)).toEqual(["t3"]);

      const up = upcomingReminders(tasks, now);
      expect(up.map((r) => r.taskId)).toEqual(["t2"]);

      const [title, body] = summarizeReminders(due);
      expect(title).toBe("Recordatorio de tarea");
      expect(body).toContain("Tarea 1");
    });
  });
});
