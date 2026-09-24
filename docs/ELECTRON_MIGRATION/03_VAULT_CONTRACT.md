# Vault byte-compatibility contract

The TypeScript port must produce **byte-identical** vault files to the Python
code. A user's vault written by the Python app must keep working with the TS app
and vice-versa. This is the single highest-risk part of the migration — a subtle
difference (a trailing newline, key order, date format, indent) silently corrupts
or churns users' files.

Authoritative format reference: **`docs/VAULT_FORMAT.md`** and the `LAYOUT` dict
in `core/vault_format.py` (→ `src/core/vaultFormat.ts`). Read both before porting
anything that writes to disk.

## Invariants to preserve exactly

1. **JSON**: `json.dumps(obj, indent=2, ensure_ascii=False)` →
   `JSON.stringify(obj, null, 2)`. 2-space indent, non-ASCII kept literal, **no
   trailing newline** unless the Python code adds one (`store.write_json` does
   not; `store.write_text` writes exactly the string given). Match whatever the
   Python function does.
2. **Key order**: objects serialize keys in insertion order. Insert keys in the
   **same order** the Python code does. Where Python sorts
   (`dict(sorted(x.items()))`), sort identically (string compare).
3. **Line endings**: notes preserve their existing EOL (`\n` or `\r\n`). Read with
   the equivalent of `newline=""` (don't translate), write back the same bytes.
   New files use `\n` unless the format says otherwise.
4. **Frontmatter**: the surgical key-edit logic
   (`frontmatter_utils.py`, `api.py:_set_frontmatter_keys`) must be ported
   literally — it edits only the targeted keys and leaves every other line,
   nested YAML, comments and spacing untouched. Do **not** dump/reparse.
5. **Dates**: `YYYY-MM-DD` for dates, the exact `DATETIME_FMT` from
   `vault_format.py` for datetimes. Local time, never UTC (`src/core/dates.ts`).
6. **`.canvas` files**: Obsidian-compatible JSON, `indent=2`, the node/edge key
   order defined in `canvas_format.py` (`to_dict` builds keys in a specific
   order — replicate it). NoteVault extras go under `"nv"`.
7. **IDs**: same shape (`store.new_id(prefix)` → `<prefix><YYYYMMDD>-<6 hex>` or
   whatever the Python does — copy it exactly). Randomness is fine; the *format*
   must match so validators/regexes still accept them.
8. **Encoding**: UTF-8 everywhere; read tolerant (`errors="replace"` →
   read as `"utf-8"` and don't throw on bad bytes where Python didn't).

## Golden-file test recipe (do this for every file-writing module)

Prove equality against the Python implementation with fixtures generated from
Python, checked into the repo, and asserted byte-for-byte by a vitest test.

1. **Generate the fixtures once, from Python** (before deleting it). Add a small
   script `tools/gen_golden.py` that, for each writer, creates a temp vault,
   calls the Python function with fixed inputs, and copies the produced files
   into `frontend/src/core/__golden__/<module>/`. Commit those files.

   Example (habits):
   ```python
   # tools/gen_golden.py  (runs on the Python side, one-off)
   api = NoteVaultApi(tmp)
   api.habits_set_done("2026-01-05", h_id, True)
   api.habits_set_day_text("2026-01-05", "nota", "diario")
   shutil.copytree(tmp/".notevault"/"habitos", GOLDEN/"habits")
   ```
2. **Assert in TS**: the ported module, given the **same fixed inputs**, must
   produce files whose bytes equal the golden files.
   ```ts
   it("writes the day file byte-for-byte like Python", () => {
     const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nv_"));
     // ...call the ported functions with the same fixed inputs...
     const got = fs.readFileSync(path.join(dir, ".notevault/habitos/2026/2026-01-05.md"));
     const want = fs.readFileSync(path.resolve(__dirname, "__golden__/habits/2026/2026-01-05.md"));
     expect(got.equals(want)).toBe(true);
   });
   ```
3. Use **fixed inputs** (fixed dates, fixed ids where the format allows — pass an
   explicit id when the API accepts one, e.g. `fin_add(..., {"id": "mv..."})`, so
   the golden file is deterministic). For genuinely random ids, assert the
   **shape** with a regex instead of exact bytes.
4. If a golden test fails, the Python output is the source of truth — fix the TS
   until the bytes match. Never edit the golden file to match a buggy port.

## Round-trip test (read what Python wrote)

Also assert the TS **reader** parses Python-written fixtures correctly: point the
ported manager at a copy of a real example vault
(`docs/knowledge_base/examples/**`) and check it reads the same values the Python
tests expect. Many existing `test_webapp_*` tests already do this — porting them
(Batch 9) covers it.

## Priority modules for golden coverage (they write the most)

`store`, `frontmatter`, `vaultManager`, `habitManager`, `taskManager`,
`financeManager`, `goalManager`, `projectManager`, `scheduleManager`,
`exerciseManager`, `canvasFormat`/`canvasBuilder`, `practice/attempts`,
`practice/ledger`, `studySrsManager`, `studyErrorManager`, `webStore`,
`english/mining`. Do a golden test for each before marking its batch done.
