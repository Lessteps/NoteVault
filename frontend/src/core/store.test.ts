import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decode,
  dumpDoc,
  dumpJson,
  encode,
  fmtNum,
  loadJson,
  MtimeCache,
  newId,
  parseDay,
  parseDoc,
  parseIntSafe,
  parseNum,
  quote,
  readDoc,
  slug,
  toTrash,
  unquote,
  writeJson,
  writeText,
} from "./store";
import { FieldDef, PROJECT_FIELDS } from "./vaultFormat";

describe("store", () => {
  let tmpDir: string;

  const fields: readonly FieldDef[] = [
    ["id", "id"],
    ["name", "str"],
    ["n", "int"],
    ["x", "num"],
    ["flag", "bool"],
    ["day", "date"],
    ["tags", "list"],
  ];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_store_test_"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("newId", () => {
    it("generates formatted ids with prefix, date, and 6 hex digits", () => {
      const id1 = newId("t");
      expect(id1).toMatch(/^t\d{8}-[0-9a-f]{6}$/);

      const id2 = newId("p", new Date(2026, 8, 14));
      expect(id2).toMatch(/^p20260914-[0-9a-f]{6}$/);

      const id3 = newId("g", "2026-09-12");
      expect(id3).toMatch(/^g20260912-[0-9a-f]{6}$/);
    });
  });

  describe("slug", () => {
    it("translates accents and replaces symbols with hyphens", () => {
      expect(slug("Programación y más")).toBe("programacion-y-mas");
      expect(slug("ÁÉÍÓÚÜÑ")).toBe("aeiouun");
      expect(slug("   --Hola Mundo!!--   ")).toBe("hola-mundo");
      expect(slug("")).toBe("x");
      expect(slug("---")).toBe("x");
    });
  });

  describe("quote & unquote", () => {
    it("quotes strings escaping backslashes and double quotes", () => {
      expect(quote('hola "mundo" \\ fin')).toBe('"hola \\"mundo\\" \\\\ fin"');
    });

    it("unquotes double-quoted and single-quoted strings", () => {
      expect(unquote('"hola \\"mundo\\" \\\\ fin"')).toBe('hola "mundo" \\ fin');
      expect(unquote('"line1\\nline2\\ttab"')).toBe("line1\nline2\ttab");
      expect(unquote("'it''s simple'")).toBe("it's simple");
      expect(unquote("unquoted raw string")).toBe("unquoted raw string");
    });
  });

  describe("number & date parsing", () => {
    it("formats and parses numbers", () => {
      expect(fmtNum(3)).toBe("3");
      expect(fmtNum(2.5)).toBe("2.5");
      expect(fmtNum(true)).toBe("1");
      expect(fmtNum(false)).toBe("0");

      expect(parseNum("2.5")).toBe(2.5);
      expect(parseNum("2,5")).toBe(2.5);
      expect(parseNum("4.0")).toBe(4);
      expect(parseNum("not_a_number")).toBeNull();

      expect(parseIntSafe("42")).toBe(42);
      expect(parseIntSafe("-10")).toBe(-10);
      expect(parseIntSafe("12.5")).toBeNull();
      expect(parseIntSafe(true)).toBeNull();
    });

    it("parses dates safely", () => {
      expect(parseDay("2026-09-14")).toBe("2026-09-14");
      expect(parseDay("2026-09-14T10:30:00")).toBe("2026-09-14");
      expect(parseDay("invalid")).toBeNull();
    });
  });

  describe("encode & decode", () => {
    it("handles bool, id, str, int, num, date, list", () => {
      expect(encode("bool", true)).toBe("true");
      expect(encode("bool", false)).toBeNull();
      expect(encode("bool0", false)).toBe("false");
      expect(encode("id", "g123")).toBe("g123");
      expect(encode("str", "test")).toBe('"test"');
      expect(encode("int", 5)).toBe("5");
      expect(encode("num", 3.14)).toBe("3.14");
      expect(encode("list", ["a", "b"])).toBe('"a,b"');

      expect(decode("bool", "true")).toBe(true);
      expect(decode("bool", "false")).toBe(false);
      expect(decode("id", "g123")).toBe("g123");
      expect(decode("str", '"hello"')).toBe("hello");
      expect(decode("int", "42")).toBe(42);
      expect(decode("num", "3.14")).toBe(3.14);
      expect(decode("list", '"uno,dos"')).toEqual(["uno", "dos"]);
    });
  });

  describe("dumpDoc & parseDoc", () => {
    it("round-trips with escapes and unknown extra keys", () => {
      const text = dumpDoc(
        fields,
        {
          id: "a1",
          name: 'Dice "hola" \\ fin',
          n: 3,
          x: 2.5,
          flag: true,
          day: "2026-09-14",
          tags: ["uno", "dos"],
        },
        { futuro: "valor: raro" },
        "Cuerpo\n\nlínea",
      );

      expect(text).toBe(
        '---\nid: a1\nname: "Dice \\"hola\\" \\\\ fin"\nn: 3\nx: 2.5\nflag: true\n' +
        'day: 2026-09-14\ntags: "uno,dos"\nfuturo: "valor: raro"\n---\n\n' +
        "Cuerpo\n\nlínea\n",
      );

      const [values, extra, body] = parseDoc(text, fields);
      expect(values["name"]).toBe('Dice "hola" \\ fin');
      expect(values["tags"]).toEqual(["uno", "dos"]);
      expect(extra["futuro"]).toBe("valor: raro");
      expect(body).toBe("Cuerpo\n\nlínea");
    });

    it("does not write empty values", () => {
      const text = dumpDoc(fields, { id: "a", name: "", flag: false, x: 3.0 });
      expect(text).toBe("---\nid: a\nx: 3\n---\n");
    });
  });

  describe("file operations & trash", () => {
    it("writes and reads atomic text files", () => {
      const p = path.join(tmpDir, "sub", "test.txt");
      writeText(p, "hello\nworld\n");
      expect(fs.readFileSync(p, "utf-8")).toBe("hello\nworld\n");

      // Test dumpJson, writeJson, loadJson
      const jsonPath = path.join(tmpDir, "data.json");
      const testData = { a: 1, b: "dos" };
      expect(dumpJson(testData)).toBe('{\n  "a": 1,\n  "b": "dos"\n}\n');
      writeJson(jsonPath, testData);
      expect(loadJson(jsonPath)).toEqual(testData);
      expect(loadJson(path.join(tmpDir, "nonexistent.json"), { fallback: true })).toEqual({ fallback: true });
    });

    it("reads frontmatter documents from disk with readDoc", () => {
      const docPath = path.join(tmpDir, "doc.md");
      const docContent = dumpDoc(fields, { id: "item1", name: "Elemento" }, null, "Contenido");
      writeText(docPath, docContent);

      const parsed = readDoc(docPath, fields);
      expect(parsed).not.toBeNull();
      expect(parsed![0]["name"]).toBe("Elemento");
      expect(parsed![2]).toBe("Contenido");

      expect(readDoc(path.join(tmpDir, "missing.md"), fields)).toBeNull();
    });

    it("moves files to trash without overwriting", () => {
      const f = path.join(tmpDir, "a.txt");
      writeText(f, "1");
      toTrash(tmpDir, f, "t");

      writeText(f, "2");
      toTrash(tmpDir, f, "t");

      const trashFolder = path.join(tmpDir, ".notevault", ".papelera", "t");
      const files = fs.readdirSync(trashFolder).sort();
      expect(files).toEqual(["a 1.txt", "a.txt"]);
    });

    it("caches files by mtime", async () => {
      const cache = new MtimeCache<string>();
      const p = path.join(tmpDir, "cached.txt");
      writeText(p, "v1");

      let loads = 0;
      const loader = (filePath: string | null) => {
        loads++;
        return filePath ? fs.readFileSync(filePath, "utf-8") : "";
      };

      expect(cache.get(p, loader)).toBe("v1");
      expect(cache.get(p, loader)).toBe("v1");
      expect(loads).toBe(1);

      // Modify file with new mtime
      await new Promise((r) => setTimeout(r, 20));
      writeText(p, "v2");
      expect(cache.get(p, loader)).toBe("v2");
      expect(loads).toBe(2);

      cache.forget(p);
      expect(cache.get(p, loader)).toBe("v2");
      expect(loads).toBe(3);
    });
  });

  describe("golden file comparisons", () => {
    it("writes JSON identical byte-for-byte to golden fixtures", () => {
      const goldenAreaPath = path.resolve(__dirname, "__golden__/.notevault/areas/programacion.json");
      if (fs.existsSync(goldenAreaPath)) {
        const wantBytes = fs.readFileSync(goldenAreaPath);
        const goldenData = JSON.parse(wantBytes.toString("utf-8"));

        const testPath = path.join(tmpDir, "programacion.json");
        writeJson(testPath, goldenData);

        const gotBytes = fs.readFileSync(testPath);
        expect(gotBytes.equals(wantBytes)).toBe(true);
      }
    });

    it("writes frontmatter doc identical byte-for-byte to golden project fixture", () => {
      const goldenProjectPath = path.resolve(
        __dirname,
        "__golden__/.notevault/proyectos/PROJECT_ID/PROJECT_ID.md",
      );
      if (fs.existsSync(goldenProjectPath)) {
        const wantBytes = fs.readFileSync(goldenProjectPath);

        const values = {
          id: "PROJECT_ID",
          key: "PW",
          name: "Portafolio web",
          status: "En curso",
          area: "programacion",
          colour: "#4ade80",
          created: "2026-09-01",
          start: "2026-09-01",
          deadline: "2026-10-30",
          columns: ["Por hacer", "En curso", "En revisión", "Hecho"],
          done_column: "Hecho",
          in_calendar: true,
        };
        const body = "Sitio personal.";

        const generated = dumpDoc(PROJECT_FIELDS, values, null, body);
        const gotBytes = Buffer.from(generated, "utf-8");
        expect(gotBytes.equals(wantBytes)).toBe(true);
      }
    });
  });
});
