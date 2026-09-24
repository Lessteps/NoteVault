import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotesService } from "./notesService";
import { VaultManager } from "./vaultManager";

describe("search operators", () => {
  describe("parse query", () => {
    it("parses plain terms", () => {
      const f = NotesService._parse_query("hello world");
      expect(f.terms).toEqual(["hello", "world"]);
    });

    it("parses tag operator", () => {
      const f = NotesService._parse_query("tag:python");
      expect(f.tags).toContain("python");
    });

    it("parses path operator", () => {
      const f = NotesService._parse_query("path:carpeta");
      expect(f.path_frags).toContain("carpeta");
    });

    it("parses property operator", () => {
      const f = NotesService._parse_query("property:author");
      expect(f.properties).toContain("author");
    });

    it("parses quoted phrase", () => {
      const f = NotesService._parse_query('"hello world"');
      expect(f.phrases).toContain("hello world");
    });

    it("parses combined operators", () => {
      const f = NotesService._parse_query('tag:math "equation" path:Matematicas');
      expect(f.tags).toContain("math");
      expect(f.phrases).toContain("equation");
      expect(f.path_frags).toContain("matematicas");
    });
  });

  describe("search in vault", () => {
    let tmp: string;
    let vault: VaultManager;
    let service: NotesService;

    beforeEach(() => {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nv_search_"));
      vault = new VaultManager(tmp);
      service = new NotesService(vault);

      const makeNote = (rel: string, content: string) => {
        const p = path.join(tmp, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, content, "utf-8");
      };

      makeNote(
        "Matematicas/algebra.md",
        "---\ntitle: Algebra\ntags: [math, algebra]\n---\n\n# Algebra\n\nLas ecuaciones son importantes.\n",
      );
      makeNote(
        "Programacion/python.md",
        "---\ntitle: Python\ntags: [code, python]\nauthor: Julian\n---\n\n# Python\n\n#python es genial.\n",
      );
      makeNote(
        "Notas/general.md",
        "---\ntitle: General\n---\n\nNota general sin tags.\n",
      );

      // Force index load
      service.index.notes();
    });

    afterEach(() => {
      fs.rmSync(tmp, { recursive: true, force: true });
    });

    it("searches plain text", () => {
      const hits = service.search("algebra");
      const names = hits.map((h) => path.basename(h.path));
      expect(names).toContain("algebra.md");
    });

    it("searches with tag operator", () => {
      const hits = service.search("tag:math");
      const names = hits.map((h) => path.basename(h.path));
      expect(names).toContain("algebra.md");
      expect(names).not.toContain("python.md");
    });

    it("searches with path operator", () => {
      const hits = service.search("path:Matematicas");
      const names = hits.map((h) => path.basename(h.path));
      expect(names).toContain("algebra.md");
      expect(names).not.toContain("python.md");
    });

    it("searches with property operator", () => {
      const hits = service.search("property:author");
      const names = hits.map((h) => path.basename(h.path));
      expect(names).toContain("python.md");
      expect(names).not.toContain("algebra.md");
    });

    it("searches with quoted phrase", () => {
      const hits = service.search('"son importantes"');
      const names = hits.map((h) => path.basename(h.path));
      expect(names).toContain("algebra.md");
    });
  });
});
