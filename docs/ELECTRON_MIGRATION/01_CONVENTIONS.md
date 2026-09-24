# Python → TypeScript conventions (the mechanical cheat sheet)

Follow these rules **literally**. They make the port faithful and consistent. If
the reference module (`src/core/store.ts`, `src/core/frontmatter.ts`) shows a
pattern that differs from your instinct, the reference module wins.

Golden rule: **same behaviour, same outputs.** When in doubt, prefer the dumb
literal translation over a "nicer" idiom.

---

## Modules, imports, exports

- One Python module → one `.ts` file with the same base name in **camelCase**
  (`vault_manager.py` → `vaultManager.ts`, `study_srs_manager.py` →
  `studySrsManager.ts`). The `02_MODULE_MAP.md` gives every destination path.
- Python `from .store import load_json` → `import { loadJson } from "./store";`
- Module-level constants stay module-level `export const`.
- Everything the Python module exposed (functions, classes, constants used by
  other modules or tests) must be `export`ed.

## Names

- Functions and variables: `snake_case` → **camelCase** (`get_day` → `getDay`).
- Classes and dataclasses: keep **PascalCase** (`HabitManager` → `HabitManager`).
- Constants: keep **UPPER_SNAKE** (`MAX_SCAN_NOTES` → `MAX_SCAN_NOTES`).
- **Dictionary keys that are serialized to disk or sent to the renderer keep
  their exact original string** (`{"note_id": ...}` stays `note_id`, NOT
  `noteId`). Only *code identifiers* are camelCased. This is critical: the JSON on
  disk and the shapes the React UI already expects must not change.

## Types

- `@dataclass` → a TS `class` with a constructor, **or** an `interface` + factory
  function. Use a **class** when the Python dataclass has methods
  (`to_dict`, properties); use an `interface` when it is a plain data bag.
  - `to_dict()` / `from_dict()` → methods `toDict()` / static `fromDict()`.
  - `@property` → a getter `get x()`.
  - `field(default_factory=list)` → default `[]` in the constructor.
- Python `dict` used as a record → `Record<string, T>` or a declared `interface`.
- Python `list` → `T[]`. `tuple` → a fixed-length tuple type `[A, B]`.
- `Optional[X]` → `X | null` (use `null`, not `undefined`, to match Python `None`
  round-tripping through JSON).
- Prefer explicit return types on exported functions.

## Filesystem — pathlib → node

Use the small helpers in `src/core/paths.ts` (provided) instead of raw `fs` where
they exist; otherwise `node:fs` (sync) + `node:path`.

| Python | TypeScript |
|---|---|
| `Path(a) / b / c` | `path.join(a, b, c)` |
| `p.exists()` | `fs.existsSync(p)` |
| `p.is_file()` / `p.is_dir()` | `fs.statSync(p).isFile()` / `.isDirectory()` (guard with existsSync) |
| `p.read_text(encoding="utf-8")` | `fs.readFileSync(p, "utf-8")` |
| `p.write_text(s, encoding="utf-8")` | `fs.writeFileSync(p, s, "utf-8")` |
| `p.read_bytes()` / `write_bytes` | `fs.readFileSync(p)` / `fs.writeFileSync(p, buf)` |
| `p.mkdir(parents=True, exist_ok=True)` | `fs.mkdirSync(p, { recursive: true })` |
| `p.iterdir()` | `fs.readdirSync(p).map(n => path.join(p, n))` |
| `p.glob("*.md")` | `fs.readdirSync(p).filter(n => n.endsWith(".md"))` (or a small glob helper) |
| `p.rename(q)` | `fs.renameSync(p, q)` |
| `p.unlink(missing_ok=True)` | `fs.rmSync(p, { force: true })` |
| `p.stem` / `p.name` / `p.suffix` | `path.parse(p).name` / `path.basename(p)` / `path.extname(p)` |
| `p.parent` | `path.dirname(p)` |
| `p.resolve()` | `path.resolve(p)` |
| `p.relative_to(root)` | `path.relative(root, p)` (posix-normalise: `.split(path.sep).join("/")`) |

- Keep I/O **synchronous** (`fs.*Sync`) — the Python code is synchronous and the
  IPC handler awaits the whole call, so sync fs keeps the translation 1:1 and
  avoids ordering bugs. (Electron main can block briefly; these ops are small.)
- **Atomic writes**: where Python does write-temp-then-`replace`, do the same:
  write `p + ".tmp"` then `fs.renameSync(tmp, p)`.

## Strings, regex, text

- `re.compile(r"...")` → `const RE = /.../;` Flags: `re.MULTILINE`→`m`,
  `re.DOTALL`→`s`, `re.IGNORECASE`→`i`. Combine as `/.../ms`.
- Named groups `(?P<name>...)` → `(?<name>...)`; access `m.groups.name` →
  `m.groups?.name`.
- `re.sub(pat, repl, s)` → `s.replace(pat_with_g_flag, repl)`. **Add the `g`
  flag** when Python replaces all (it does by default). `\1` → `$1`.
- `re.findall` → `[...s.matchAll(/.../g)]`. `re.search` → `s.match(/.../)`.
- `str.strip()`→`.trim()`, `lstrip`/`rstrip`→`.replace(/^\s+/,"")`/`.replace(/\s+$/,"")`
  (or `.trimStart()`/`.trimEnd()`).
- `" ".join(xs)` → `xs.join(" ")`. `s.split(sep)` → `s.split(sep)` (careful:
  Python `s.split()` with no arg splits on any whitespace and drops empties →
  `s.split(/\s+/).filter(Boolean)`).
- `str.startswith((a, b))` (tuple) → `[a, b].some(x => s.startsWith(x))`.
- `unicodedata.normalize("NFKD", s).encode("ascii","ignore")` (accent folding) →
  `s.normalize("NFKD").replace(/\p{Diacritic}/gu, "")`. A helper `fold()` is in
  `src/core/text.ts` (provided) — use it.
- f-strings → template literals. `f"{x:02d}"` → `String(x).padStart(2,"0")`;
  `f"{x:.1f}"` → `x.toFixed(1)`.

## Numbers

- `int(x)` → `Math.trunc(Number(x))` (or `parseInt` for strings); guard `NaN`.
- `round(x)` → **banker's rounding differs**: Python `round` is round-half-even,
  JS `Math.round` is round-half-up. Where the code rounds money/scores, use the
  provided `roundHalfEven()` in `src/core/num.ts` **only if** a test shows the
  difference matters; otherwise `Math.round` is fine. Note this in the port.
- Integer division `a // b` → `Math.floor(a / b)`. `a % b` in Python always has
  the sign of `b`; JS `%` has the sign of `a`. For non-negative operands (the
  common case here) they match; if negatives are possible use
  `((a % b) + b) % b`.
- `Fraction` (used in `practice/drills.py`) → keep exact rational arithmetic with
  a tiny `Fraction` class (provided stub in `src/core/fraction.ts` for that batch).

## Dates & times

- The code stores dates as ISO `YYYY-MM-DD` and datetimes as
  `YYYY-MM-DD HH:MM:SS` or ISO. **Preserve those exact string formats.**
- Use the helpers in `src/core/dates.ts` (provided): `todayIso()`,
  `nowLocalIso()`, `parseIsoDate()`, `formatDate(d, fmt)`, `addDays()`,
  `weekday()` (Mon=0..Sun=6, like Python `date.weekday()`). Do **not** use raw
  `new Date().toISOString()` for dates — it is UTC and off by a day (this bug was
  already fixed once on the renderer side; do not reintroduce it).
- `date.today().isoformat()` → `todayIso()`.
- `datetime.now().strftime(FMT)` → `formatDate(new Date(), FMT)`.
- `calendar.monthrange`, week math → use `dates.ts` helpers; add to it if missing
  rather than inlining.

## JSON

- `json.dumps(obj, indent=2, ensure_ascii=False)` → `JSON.stringify(obj, null, 2)`.
  (JS `JSON.stringify` never escapes non-ASCII, matching `ensure_ascii=False`.)
- `json.loads(s)` → `JSON.parse(s)`.
- **Key order matters for byte-identical files.** Python `dict` preserves insertion
  order and `json.dumps` keeps it. Build TS objects with keys in the **same order**
  the Python code inserts them. Where Python does `dict(sorted(x.items()))`, do
  `Object.fromEntries(Object.entries(x).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0))`.
- Use `loadJson(path, default)` / `writeJson(path, obj)` from `store.ts` (provided
  reference) — they handle missing files, atomic writes and indent exactly like
  Python `store.py`.

## YAML (frontmatter, specs)

- Add `js-yaml` (already a dep after scaffold). `yaml.safe_load` → `yaml.load(s)`
  (js-yaml's `load` is safe by default in v4). `yaml.safe_dump` → `yaml.dump`.
- **But most frontmatter code in this repo does NOT round-trip through a YAML
  dumper** — it edits keys surgically to preserve the user's exact formatting
  (see `frontmatter_utils.py` and `api.py:_set_frontmatter_keys`). Port that
  surgical logic literally; do not replace it with dump/reparse.

## Collections & control flow

- `dict.get(k, default)` → `obj[k] ?? default` (careful: `??` only catches
  null/undefined; Python `.get` returns default only when key absent — if the
  stored value can be `0`/`""`/`false` and you need "absent", use
  `k in obj ? obj[k] : default`).
- `dict.setdefault(k, d)` → `obj[k] ??= d; obj[k]` (or explicit).
- `{k: v for ...}` comprehensions → `Object.fromEntries(...)` or a loop.
- `[x for x in xs if cond]` → `xs.filter(...).map(...)`.
- `sorted(xs, key=f)` → `[...xs].sort((a,b) => cmp(f(a), f(b)))`. Provide a `cmp`
  for strings/tuples; JS default sort is lexicographic on strings coerced — always
  pass a comparator.
- `enumerate(xs)` → `xs.entries()` / `xs.forEach((x,i)=>...)`.
- `zip(a,b)` → `a.map((x,i) => [x, b[i]])`.
- `any(...)`/`all(...)` → `arr.some(...)`/`arr.every(...)`.
- `try/except X` → `try/catch (e)` + `if (e instanceof X)`. Catch narrowly; do not
  swallow errors the Python code lets propagate.
- Python truthiness: empty string/list/dict/0 are falsy. In TS, `[]` and `{}` are
  **truthy** — replace `if xs:` with `if (xs.length)` / `if (Object.keys(o).length)`.

## Misc stdlib

| Python | TypeScript |
|---|---|
| `uuid.uuid4().hex[:12]` | `crypto.randomUUID().replace(/-/g,"").slice(0,12)` (node:crypto) |
| `hashlib.sha256(s.encode()).hexdigest()` | `crypto.createHash("sha256").update(s).digest("hex")` |
| `secrets.token_hex(n)` | `crypto.randomBytes(n).toString("hex")` |
| `threading.RLock()` + `with self._lock:` | **drop it** — Node is single-threaded; remove the lock, keep the body |
| `time.monotonic()` | `performance.now()/1000` (seconds) |
| `shutil.copy`, `shutil.rmtree` | `fs.copyFileSync`, `fs.rmSync(p,{recursive:true,force:true})` |
| `subprocess.Popen([...])` | `child_process.spawn(...)` (only in `english`/notify/web batches) |
| `ast.parse` (drills safe eval) | a tiny expression parser (provided in the drills batch) |
| `watchdog` file watcher | `chokidar` — or skip watching for v1 (renderer refreshes) |

## Errors

- `ApiError` is provided in `src/core/errors.ts`. `raise ApiError("msg")` →
  `throw new ApiError("msg")`. Keep the **exact Spanish messages** — tests and the
  UI depend on them.
- Other `raise ValueError(...)` etc. → `throw new Error(...)` unless a test checks
  the type, in which case make a matching class.

## Tests (pytest → vitest)

- `tests/test_<x>.py` → `src/core/<x>.test.ts` (next to the module, or under
  `src/core/__tests__/`; be consistent — the reference puts them next to the file).
- `class TestFoo(unittest.TestCase)` → `describe("Foo", () => { ... })`.
- `def test_bar(self)` → `it("bar", () => { ... })`. Keep the test's intent and its
  assertions.
- `self.assertEqual(a, b)` → `expect(a).toEqual(b)`; `assertTrue`→`toBe(true)`;
  `assertIsNone`→`toBeNull()`; `assertRaises(ApiError)` →
  `expect(() => f()).toThrow(ApiError)` (or `.rejects.toThrow` if async).
- Temp vault dirs: Python `tempfile.mkdtemp()` →
  `fs.mkdtempSync(path.join(os.tmpdir(), "nv_"))`; clean up in `afterEach` with
  `fs.rmSync(dir, { recursive: true, force: true })`.
- Fixtures under `docs/knowledge_base/examples/**` are read the same way (relative
  to repo root) — resolve with `path.resolve(__dirname, "../../..", ...)` and
  verify the path exists in a `beforeAll`.
- A ported module is **not done** until its test file is ported and green.
