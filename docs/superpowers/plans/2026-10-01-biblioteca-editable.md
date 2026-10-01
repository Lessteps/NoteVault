# Biblioteca de Ejercicio editable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la Biblioteca deje de ser código de solo lectura y pase a ser una capa editable sobre el catálogo, con dos botones separados en el formulario y aviso de copias desfasadas.

**Architecture:** Un fichero del vault, `biblioteca.json`, guarda las entradas propias. `exerciseLibrary.ts` deja de leer solo el paquete: recibe las entradas propias y las fusiona por `slug`, de forma que un campo propio relleno gana y uno vacío deja el original intacto. El programa guarda, en cada ejercicio, de qué entrada salió y una huella de los campos que copió, para poder avisar de copias desfasadas.

**Tech Stack:** TypeScript, React 19, Zustand, Electron + bridge IPC, vitest (jsdom para componentes, node para core), Playwright para e2e, Tailwind con los tokens ya existentes.

**Spec:** `docs/superpowers/specs/2026-10-01-biblioteca-editable-design.md`

## Global Constraints

- Todo el texto visible al usuario va en **español**. Los comentarios del código, también.
- Tokens de estilo existentes, no inventar nuevos: `bg-card`, `bg-panel`, `border-line`, `text-text`, `text-dim`, `text-faint`, `text-accent-text`, `bg-accent-soft`, `hover:bg-hover`, `ORANGE` (de `./parts`), `input` y `GhostButton`/`PrimaryButton` (de `../common/forms`).
- `GhostButton` acepta `data-*`; se usa para que los tests localicen botones.
- Ninguna ruta del código puede **producir un duplicado** por nombre normalizado. Es la garantía central del spec.
- Los ficheros del vault se leen con tolerancia: si uno está corrupto, se trata como vacío y se avisa. **Nunca** debe impedir arrancar la app.
- Verificar antes de dar algo por hecho: `npx tsc -b` y `npx vitest run` en `frontend/`, `npm run build`, y `npx playwright test` para e2e.
- Commits frecuentes, uno por tarea.

## Review Focus

Cinco entradas que el spec insinúa y que es fácil que rompan el programa. Cada una tiene su test en la tarea indicada.

1. **Nombre vacío o solo espacios al guardar en la Biblioteca** → no debe crear una entrada fantasma con nombre vacío (Task 3).
2. **Entrada propia creada sin músculos** → no pinta en el mapa; los avisos de «sin músculos» deben seguir funcionando y apuntar a donde se asignan (Task 2).
3. **Dos entradas propias que solo se diferencian en mayúsculas o espacios dobles** → edita la existente, no crea otra (Task 3).
4. **`biblioteca.json` con el mismo slug repetido dentro** → arranca igual, gana la última (Task 1).
5. **Ejercicio del programa cuyo `source` ya no existe en la Biblioteca** (entrada borrada) → no rompe nada y no dispara un aviso Mentiroso (Task 6).

---

## File Structure

| Fichero | Responsabilidad |
|---|---|
| `frontend/src/core/vaultFormat.ts` *(mod)* | Una clave más en `LAYOUT`. |
| `frontend/src/core/libraryStore.ts` *(nuevo)* | Leer y escribir `biblioteca.json`. Nada más: no sabe nada del catálogo. |
| `frontend/src/core/libraryStore.test.ts` *(nuevo)* | Su ciclo TDD. |
| `frontend/src/lib/exerciseLibrary.ts` *(mod)* | Fusionar catálogo + entradas propias. Sigue siendo el único sitio que sabe qué es un `LibraryEntry`. |
| `frontend/src/lib/exerciseLibrary.test.ts` *(mod)* | Sus tests actuales + los nuevos de la mezcla. |
| `frontend/src/api/modules/exercise.ts` *(mod)* | `ex_library_list` / `ex_library_save` / `ex_library_remove`, y exponer `source`. |
| `frontend/src/api/modules/exercise.test.ts` *(mod)* | Su ciclo TDD. |
| `frontend/src/lib/types.ts` *(mod)* | `Exercise.source`, `Exercise.sourceFp`, `LibraryUserEntry`. |
| `frontend/src/lib/bridge.ts` *(mod)* | Los tres métodos nuevos en el puente. |
| `frontend/src/components/exercise/Routine.tsx` *(mod)* | Los dos botones; el aviso de desfasado; el picker usa `source`. |
| `frontend/src/components/exercise/Library.tsx` *(mod)* | Pasa las entradas propias a la biblioteca y fija `source`/`sourceFp` al copiar. |
| `frontend/src/components/exercise/LibraryDetail.tsx` *(mod)* | «Sin imágenes» cuando no hay frames. |
| `frontend/src/components/exercise/Library.test.tsx` *(mod)* | Su ciclo TDD. |

---

### Task 1: Almacenar las entradas propias

**Files:**
- Modify: `frontend/src/core/vaultFormat.ts` (dentro de `LAYOUT`)
- Create: `frontend/src/core/libraryStore.ts`
- Test: `frontend/src/core/libraryStore.test.ts`

**Interfaces:**
- Produces:
  - `LAYOUT.library: string` con el valor `` `${DATA_DIR}/ejercicio/biblioteca.json` ``
  - `interface LibraryUserEntry { slug: string; name: string; equipment: string; muscles: { primary: string[]; secondary: string[] }; how_to: string }`
  - `class LibraryStore { constructor(vaultRoot: string); entries(): LibraryUserEntry[]; save(entries: LibraryUserEntry[]): void }`

- [ ] **Step 1: Escribe el test que falla**

En `libraryStore.test.ts`, con `fs.mkdtempSync` como en `exerciseManager.test.ts`:

```ts
it("sin fichero, la biblioteca propia está vacía", () => {
  const s = new LibraryStore(tmpDir);
  expect(s.entries()).toEqual([]);
});

it("guarda y relee las entradas", () => {
  const s = new LibraryStore(tmpDir);
  s.save([{ slug: "mia-a1", name: "Press banca", equipment: "Barra",
            muscles: { primary: ["pectoral"], secondary: [] }, how_to: "Baja al pecho" }]);
  expect(new LibraryStore(tmpDir).entries()).toHaveLength(1);
  expect(new LibraryStore(tmpDir).entries()[0]!.name).toBe("Press banca");
});

it("un fichero corrupto no rompe: vacío y sin lanzar", () => {
  fs.mkdirSync(path.join(tmpDir, ".notevault", "ejercicio"), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, ".notevault", "ejercicio", "biblioteca.json"), "{ roto", "utf-8");
  expect(() => new LibraryStore(tmpDir).entries()).not.toThrow();
  expect(new LibraryStore(tmpDir).entries()).toEqual([]);
});

it("el mismo slug repetido dentro del fichero: gana la última", () => {
  // Review Focus 4: fichero escrito a mano con duplicados.
  // Escribe el JSON con dos entradas de slug "mia-a1" y nombres distintos.
  expect(new LibraryStore(tmpDir).entries()).toHaveLength(1);
  expect(new LibraryStore(tmpDir).entries()[0]!.name).toBe("el segundo");
});

it("una entrada sin muscles.primary se normaliza a lista vacía", () => {
  // No debe llegar undefined donde el resto del código espera string[].
  expect(new LibraryStore(tmpDir).entries()[0]!.muscles.primary).toEqual([]);
});
```

- [ ] **Step 2: Ejecuta y mira cómo falla**

Run: `npx vitest run src/core/libraryStore.test.ts`
Expected: FAIL con «Cannot find module './libraryStore'».

- [ ] **Step 3: Implementa**

Añade a `LAYOUT`: `library: \`${DATA_DIR}/ejercicio/biblioteca.json\`,`.

`libraryStore.ts`: sigue la forma de `ExerciseManager` — `path.resolve(vaultRoot)` en el constructor, guarda `this._configPath = path.join(vaultRoot, LAYOUT.library)`. `entries()` devuelve `[]` si el fichero no existe; si existe, `JSON.parse` dentro de `try/catch` y devuelve `[]` ante cualquier error. **Acumula en memoria**: lee el disco una vez y guarda en `_entries`, igual que hace `ExerciseManager.exercises()`. `save()` escribe `JSON.stringify({ entries }, null, 2)` con `"utf-8"`, creando el directorio con `mkdirSync(..., { recursive: true })` antes.

Al leer, normaliza cada entrada defensivamente: `muscles.primary` y `muscles.secondary` a `string[]` con `Array.isArray` y filtro de `typeof === "string"`; `equipment`, `how_to`, `name` a `String(x ?? "")`; `slug` a `String(x ?? "")` y **descarta las entradas con slug vacío**. Si dos entradas comparten slug, **gana la última** (construye un `Map` iterando en orden).

- [ ] **Step 4: Ejecuta y mira cómo pasa**

Run: `npx vitest run src/core/libraryStore.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/core/vaultFormat.ts frontend/src/core/libraryStore.ts frontend/src/core/libraryStore.test.ts
git commit -m "feat(ejercicio): almacenamiento de la biblioteca propia"
```

---

### Task 2: La capa editable sobre el catálogo

**Files:**
- Modify: `frontend/src/lib/exerciseLibrary.ts`
- Test: `frontend/src/lib/exerciseLibrary.test.ts`

**Interfaces:**
- Consumes: `LibraryUserEntry` de Task 1 (solo la forma; esta tarea no lee el disco).
- Produces:
  - `function mergeLibrary(userEntries: LibraryUserEntry[]): LibraryEntry[]` — **puro y sin estado**: parte de `searchExercises()` (el paquete), fusiona por slug y añade las propias.
  - `function instructionsFor(userEntries: LibraryUserEntry[]): Map<string, ExerciseInstructions>` — pasos de las entradas propias indexados por slug, para que `getInstructions` los encuentre.
  - `searchLibrary(query = "", userEntries: LibraryUserEntry[] = []): LibraryEntry[]` — el segundo parámetro es opcional, así que **los tests y los consumidores actuales siguen funcionando sin cambios**.
  - `filterLibrary(filters: LibraryFilters = {}, userEntries: LibraryUserEntry[] = [])`
  - `filterLibraryByLocalMuscle(localId, filters, userEntries)`
  - `libraryEntry(slug, userEntries)` — devuelve la propia si existe, si no la del paquete.
  - `getInstructions(slug, userEntries)` — primero las propias, si no las del paquete.
  - `LIBRARY_EQUIPMENT` y `LIBRARY_MUSCLES` **dejan de ser constantes calculadas al importar**: pasan a ser funciones `libraryEquipment(userEntries)` y `libraryMuscles(userEntries)`, porque dependen de lo que haya en el fichero del vault. Actualiza los tres consumidores (`Library.tsx` y su test).

**Nota sobre los frames:** `frames` y `frame1` de una entrada propia van **vacíos** (`[]` y `null`). No hay imágenes de las entradas propias.

- [ ] **Step 1: Escribe los tests que fallan**

En `exerciseLibrary.test.ts`. **El test existente `expect(filterLibrary({}).length).toBe(302)` sigue valiendo** cuando no hay entradas propias: no lo cambies.

```ts
const mia = (over: Partial<LibraryUserEntry> = {}): LibraryUserEntry => ({
  slug: "mia-1", name: "Mi press", equipment: "Barra",
  muscles: { primary: ["pectoral"], secondary: [] }, how_to: "Paso 1", ...over,
});

it("sin entradas propias, el catálogo son 302", () => {
  expect(searchLibrary("", []).length).toBe(302);
});

it("una entrada propia aparece junto al catálogo", () => {
  expect(searchLibrary("", [mia()]).length).toBe(303);
  expect(searchLibrary("mi press", [mia()])[0]!.slug).toBe("mia-1");
});

it("una entrada propia no tiene imágenes", () => {
  const e = searchLibrary("", [mia()]).find((x) => x.slug === "mia-1")!;
  expect(e.frames).toEqual([]);
  expect(e.frame1).toBeNull();
});

it("un campo propio relleno gana al del catálogo", () => {
  // Edita bench-press: cambia el nombre. Sus frames y su guía siguen siendo los
  // del paquete, porque lo propio no los pisa.
  const rows = searchLibrary("", [mia({ slug: "bench-press", name: "Press banca", how_to: "Mío" })]);
  const e = rows.find((x) => x.slug === "bench-press")!;
  expect(rows.length).toBe(302);           // editó, no añadió
  expect(e.name).toBe("Press banca");
  expect(e.how_toPropia).toBe("Mío");
  expect(e.frame1).toContain("bench-press");  // la imagen es la del paquete
});

it("un campo propio vacío deja el del catálogo", () => {
  const base = searchLibrary("", [])!.find((x) => x.slug === "bench-press")!;
  const e = searchLibrary("", [mia({ slug: "bench-press", name: "Press banca", how_to: "" })])
    .find((x) => x.slug === "bench-press")!;
  expect(e.guidePrimary).toBe(base.guidePrimary);
  expect(e.localPrimary).toEqual(base.localPrimary);
  expect(e.how_toPropia).toBe("");   // vacío significa "déjalo como estaba"
});

it("las instrucciones propias se encuentran por slug", () => {
  const ins = getInstructions("mia-1", [mia({ how_to: "1. Baja\n2. Empuja" })])!;
  expect(ins.steps_es).toEqual(["1. Baja", "2. Empuja"]);
});

it("sin entrada propia, las instrucciones del paquete siguen ahí", () => {
  expect(getInstructions("bench-press")!.source).toBe("propia");
});

it("una entrada propia sin músculos aparece en el filtro de equipo", () => {
  // Review Focus 2: sin músculos debe listarse, no desaparecer.
  const e = searchLibrary("", [mia({ equipment: "", muscles: { primary: [], secondary: [] } })])
    .find((x) => x.slug === "mia-1")!;
  expect(e.localPrimary).toEqual([]);
  expect(searchLibrary("", [mia({ equipment: "" })]).length).toBe(303);
});
```

`how_toPropia` es un campo **nuevo y opcional** de `LibraryEntry`: los pasos propios en crudo, que el `Detail` sabe pintar. Añádelo a la interfaz con la nota de que solo lo rellenan las entradas propias.

- [ ] **Step 2: Ejecuta y mira cómo falla**

Run: `npx vitest run src/lib/exerciseLibrary.test.ts`
Expected: FAIL — `searchLibrary` no acepta el segundo argumento y `how_toPropia` no existe.

- [ ] **Step 3: Implementa**

`mergeLibrary(userEntries)`: indexa las propias por `slug` en un `Map`; itera `searchExercises().map(toEntry)` y para cada `slug` presente en el mapa devuelve una entrada fusionada; al final concatena las propias cuyo `slug` no estaba en el paquete.

La fusión, campo a campo:

```ts
/** Un campo propio manda solo si tiene algo; vacío significa "déjalo". */
const propio = (mio: string, suyo: string) => (mio.trim() ? mio : suyo);
```

Aplica a `name` y `equipment`. `localPrimary`/`localSecondary`: si las propias traen alguna, mandan; si no, las del catálogo. `guidePrimary` de una propia = `muscles.primary.join(", ")`; `guideSecondary` = `[]`. `frames`/`frame1`: **siempre los del catálogo**, nunca los propios. `how_toPropia`: el valor propio tal cual, `""` si no hay entrada propia para ese slug.

`getInstructions(slug, userEntries)`: si la entrada propia tiene `how_to` con contenido, devuelve `{ slug, source: "mia", steps_es: how_to.split("\n") }`; si no, cae a `instructionsBySlug` como hoy.

`filterLibrary` y `filterLibraryByLocalMuscle`: llama a `mergeLibrary(userEntries)` **antes** de filtrar, para que una entrada propia se pueda encontrar por cualquiera de los dos filtros. `libraryEquipment`/`libraryMuscles` derivan de la lista ya mezclada, no del paquete.

- [ ] **Step 4: Ejecuta y mira cómo pasa**

Run: `npx vitest run src/lib/exerciseLibrary.test.ts`
Expected: PASS, incluidos los tests antiguos de los 302.

- [ ] **Step 5: Actualiza los consumidores de `LIBRARY_EQUIPMENT` y `LIBRARY_MUSCLES`**

En `Library.tsx`: los dos desplegables pasan de constante a llamada `libraryEquipment(userEntries)` / `libraryMuscles(userEntries)`. Para esta tarea puede pasar `[]` siempre; Task 5 los conecta de verdad.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/exerciseLibrary.ts frontend/src/lib/exerciseLibrary.test.ts frontend/src/components/exercise/Library.tsx
git commit -m "feat(ejercicio): la biblioteca es una capa editable sobre el catalogo"
```

---

### Task 3: Guardar nunca duplica

**Files:**
- Modify: `frontend/src/api/modules/exercise.ts`
- Modify: `frontend/src/lib/bridge.ts`
- Test: `frontend/src/api/modules/exercise.test.ts`

**Interfaces:**
- Consumes: `LibraryStore` y `LibraryUserEntry` de Task 1.
- Produces:
  - `function normalizeLibraryName(name: string): string` — `trim()`, minúsculas, y colapsa toda serie de espacios internos a uno solo.
  - `ex_library_list(): LibraryUserEntry[]`
  - `ex_library_save(fields: { name: string; equipment?: string; muscles?: unknown; how_to?: string }): { entry: LibraryUserEntry; created: boolean; updatedFrom?: string }` — `created` dice si es nueva; `updatedFrom` es el slug del catálogo o entrada que se editó, para que la interfaz pueda avisar.
  - `ex_library_remove(slug: string): boolean`

- [ ] **Step 1: Escribe los tests que fallan**

En `exercise.test.ts`, usando el `api` y `tmpDir` que ya monta el `describe`:

```ts
it("guardar un nombre nuevo crea la entrada", () => {
  const r = api.ex_library_save({ name: "Press banca", how_to: "Baja", muscles: { primary: ["pectoral"] } });
  expect(r.created).toBe(true);
  expect(r.entry.slug.startsWith("mia-")).toBe(true);
  expect(api.ex_library_list()).toHaveLength(1);
});

it("guardar un nombre del catálogo edita, no añade", () => {
  const before = api.ex_library_list().length;
  const r = api.ex_library_save({ name: "Bench Press", how_to: "Mío" });
  expect(r.created).toBe(false);
  expect(r.updatedFrom).toBe("bench-press");
  expect(api.ex_library_list().length).toBe(before + 1);   // una sola entrada propia
});

it("guardar dos veces el mismo nombre no crea un duplicado", () => {
  api.ex_library_save({ name: "Mi press" });
  api.ex_library_save({ name: "Mi press", how_to: "otro" });
  expect(api.ex_library_list()).toHaveLength(1);
  expect(api.ex_library_list()[0]!.how_to).toBe("otro");
});

it("solo difiere en mayúsculas y espacios: edita, no duplica", () => {
  // Review Focus 3.
  api.ex_library_save({ name: "Mi press" });
  api.ex_library_save({ name: "  MI   PRESS  " });
  expect(api.ex_library_list()).toHaveLength(1);
});

it("un nombre vacío no crea una entrada fantasma", () => {
  // Review Focus 1.
  expect(() => api.ex_library_save({ name: "   " })).toThrow(ApiError);
  expect(api.ex_library_list()).toEqual([]);
});

it("borrar solo quita entradas propias", () => {
  const r = api.ex_library_save({ name: "Mío" });
  expect(api.ex_library_remove(r.entry.slug)).toBe(true);
  expect(api.ex_library_list()).toEqual([]);
  expect(api.ex_library_remove("bench-press")).toBe(false);  // el catálogo no se toca
});

it("los nombres del catálogo se reconocen ignorando acentos", () => {
  expect(api.ex_library_save({ name: "bench press" }).updatedFrom).toBe("bench-press");
});
```

- [ ] **Step 2: Ejecuta y mira cómo falla**

Run: `npx vitest run src/api/modules/exercise.test.ts`
Expected: FAIL — `api.ex_library_save is not a function`.

- [ ] **Step 3: Implementa en `api/modules/exercise.ts`**

Sube el `LibraryStore` por el mismo camino que el `ExerciseManager` (`mgr()` usa `app.vaultRoot`). Los métodos usan `oneLine` y `normalizeMuscles` **ya importados** en ese fichero: `name` con `oneLine(f.name, 120)`, `how_to` con `String(f.how_to || "").slice(0, 4000)`, `equipment` con `oneLine(f.equipment, 60)`, `muscles` con `normalizeMuscles(f.muscles)`.

`ex_library_save`:
1. `name = oneLine(f.name, 120)`; si queda vacía → `throw new ApiError("El ejercicio necesita un nombre.")`.
2. `key = normalizeLibraryName(name)`.
3. ¿Alguna entrada propia ya tiene ese `key`? → edítala y guarda.
4. ¿Alguna entrada **del paquete** tiene ese `key`? → crea una entrada propia con **ese mismo slug** y guarda; `updatedFrom` = ese slug. Esto es lo que hace que editar el catálogo no produzca dos entradas con el mismo nombre.
5. Si no → slug nuevo `mia-` + un id corto, `created: true`.

En los pasos 3 y 4, guarda **solo los campos que llegan con contenido**; los que llegan vacíos se dejan como estaban en la entrada existente. Esa es la regla del spec: un campo vacío significa «déjalo como estaba». Si la entrada es nueva, vacíos se guardan vacíos.

`ex_library_remove(slug)`: si el slug no empieza por `mia-`, devuelve `false` sin tocar nada.

- [ ] **Step 4: Añade los tres métodos al puente**

En `bridge.ts`, junto a `exSave`:

```ts
exLibraryList: () => call<LibraryUserEntry[]>("ex_library_list"),
exLibrarySave: (fields: {...}) => call<{ entry: LibraryUserEntry; created: boolean; updatedFrom?: string }>("ex_library_save", fields),
exLibraryRemove: (slug: string) => call<boolean>("ex_library_remove", slug),
```

- [ ] **Step 5: Ejecuta y mira cómo pasa**

Run: `npx vitest run src/api/modules/exercise.test.ts`
Expected: PASS, incluidos los 8 tests anteriores.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/modules/exercise.ts frontend/src/api/modules/exercise.test.ts frontend/src/lib/bridge.ts frontend/src/lib/types.ts
git commit -m "feat(ejercicio): guardar en la biblioteca nunca duplica"
```

---

### Task 4: La copia recuerda de dónde salió

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/api/modules/exercise.ts` (`exDict`, `exFields`)
- Modify: `frontend/src/components/exercise/Library.tsx` (al copiar)
- Modify: `frontend/src/components/exercise/Routine.tsx` (el picker)
- Test: `frontend/src/api/modules/exercise.test.ts`, `frontend/src/components/exercise/Library.test.tsx`

**Interfaces:**
- Produces, en `Exercise`:
  - `source?: string` — slug de la entrada de la que se copió. Vacío o ausente si se escribió a mano.
  - `sourceFp?: string` — huella de los campos que se copiaron. Ver abajo.
- Produces: `function libraryFingerprint(e: { slug: string; name: string; how_toPropia?: string; localPrimary: string[]; localSecondary: string[] }): string`

**La huella, y por qué esta forma:** no hay contador de revisiones. La huella es un hash corto de **exactamente los tres campos que vienen de la Biblioteca** (`name`, `how_to`, músculos). Una copia está desfasada cuando la huella guardada no coincide con la actual. Esto no tiene reloj ni contador que se desincronice, y si editas el catálogo y luego lo dejas como estaba, deja de marcarse como desfasado — que es lo correcto.

El hash no necesita ser criptográfico: con `slug + name + how_to + músculos` basta un entero de 32 bits en base 36. Que sea determinista y corto.

- [ ] **Step 1: Escribe los tests que fallan**

```ts
// exercise.test.ts
it("ex_dict expone el origen de la copia", () => {
  const e = api.ex_save("", { day: "lunes", name: "Press", source: "bench-press", sourceFp: "abc" });
  expect((api.ex_list().find((x) => x.id === e.id) as any).source).toBe("bench-press");
});

it("un ejercicio escrito a mano no tiene origen", () => {
  const e = api.ex_save("", { day: "lunes", name: "A mano" });
  expect((api.ex_list().find((x) => x.id === e.id) as any).source).toBeFalsy();
});

it("source e sourceFp sobreviven a una edición posterior", () => {
  const e = api.ex_save("", { day: "lunes", name: "Press", source: "bench-press", sourceFp: "abc" });
  api.ex_save(e.id, { series_reps: "4×8" });   // editar no debe perder el origen
  const got = api.ex_list().find((x) => x.id === e.id) as any;
  expect(got.source).toBe("bench-press");
  expect(got.sourceFp).toBe("abc");
});
```

```ts
// Library.test.tsx
it("copiar de la biblioteca guarda el origen y su huella", async () => {
  // Monta <Library embedded />, pulsa [data-library-add] del primer ejercicio y
  // comprueba en el mock que exSave recibió source igual a un slug real del catálogo
  // y sourceFp no vacío.
});

it("el aviso de duplicado del picker usa source, no comparar nombres", async () => {
  // Con un ejercicio en el programa cuyo source es "bench-press", el candidato
  // slug="bench-press" sale marcado. Con un source vacío y OTRO nombre, no.
});
```

- [ ] **Step 2: Ejecuta y mira cómo falla**

Run: `npx vitest run src/api/modules/exercise.test.ts src/components/exercise/Library.test.tsx`
Expected: FAIL — `source` no existe en el tipo ni en `ex_dict`.

- [ ] **Step 3: Implementa**

`types.ts`: añade `source?: string` y `sourceFp?: string` a `Exercise`, y `interface LibraryUserEntry { slug: string; name: string; equipment: string; muscles: { primary: string[]; secondary: string[] }; how_to: string }` **si Task 1 no la puso** (no la dupliques: reutiliza la de `core/libraryStore`).

`exercise.ts`: `exDict` añade `source: e.source || ""` y `sourceFp: e.sourceFp || ""`. `exFields` los acepta con `oneLine(f.source, 120)` y `oneLine(f.sourceFp, 40)`, y —importante— **una edición que no los_envíe los conserva**, no los borra. Como `exFields` hoy devuelve el objeto completo, ensure de que el merge con el registro existente no lose esos dos campos; si hace falta, léelo del registro actual y propágalo.

`libraryFingerprint` en `exerciseLibrary.ts`, exportada, determinista y de 32 bits en base 36 sobre los campos **`slug`, `name`, `how_toPropia`, `localPrimary` y `localSecondary`** de una `LibraryEntry`, unidos con `"\u0000"` y con los músculos **ordenados** antes de unirlos (si no, el mismo ejercicio daría dos huellas según el orden en que se guardó). Toma una `LibraryEntry`, no un `LibraryUserEntry`: quien la llama tiene siempre la entrada ya mezclada.

`Library.tsx`, en `add()`: al crear, `source: found.slug` y `sourceFp: libraryFingerprint(found)`. En el guardado posterior del detalle, **no los cambies**: solo `series_reps` y `rest`, que son de la persona.

`Routine.tsx`: el `LibraryPicker` deja de recibir `routineNames: Set<string>` y pasa a recibir `usedSlugs: Set<string>`. La condición `already` pasa a ser `usedSlugs.has(r.slug)` — **datos, no comparación de nombres**. `Routine` construye el `Set` con `list.filter((e) => e.source).map((e) => e.source)`.

- [ ] **Step 4: Ejecuta y mira cómo pasa**

Run: `npx vitest run src/api/modules/exercise.test.ts src/components/exercise/Library.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/exerciseLibrary.ts frontend/src/api/modules/exercise.ts frontend/src/components/exercise/Library.tsx frontend/src/components/exercise/Routine.tsx frontend/src/components/exercise/Library.test.tsx
git commit -m "feat(ejercicio): cada copia recuerda de que entrada salio"
```

---

### Task 5: Los dos botones

**Files:**
- Modify: `frontend/src/components/exercise/Routine.tsx` (`ExerciseForm`)
- Test: `frontend/src/components/exercise/Library.test.tsx`

**Interfaces:**
- Consumes: `api.exLibrarySave` de Task 3, `usedSlugs` de Task 4.
- Produces: `ExerciseForm` gana props `onSaveToLibrary: () => Promise<void>` y `libraryExists: boolean`. El botón lleva `data-library-save`; el de programa conserva su etiqueta «Guardar ejercicio».

- [ ] **Step 1: Escribe los tests que fallan**

```ts
it("el formulario ofrece los dos botones, con nombres distintos", async () => {
  // Monta el programa y comprueba que existen [data-library-save] y el botón
  // de guardar programa, y que sus textos son distintos.
});

it("guardar en la biblioteca no escribe en el programa", async () => {
  // Pulsa data-library-save. En el mock: ex_library_save llamado, ex_save NO llamado.
});

it("si el nombre ya existe en el catálogo, el botón avisa antes de escribir", async () => {
  // Con el formulario rellenado con "Bench Press" y ese slug ya en la biblioteca,
  // data-library-save dice "Actualizar en la Biblioteca" y pulsar pide confirmar:
  // sin confirmar, ex_library_save NO se llama.
});

it("el botón de la biblioteca no requiere día", async () => {
  // La biblioteca no guarda día. ex_library_save se llama sin day.
});
```

- [ ] **Step 2: Ejecuta y mira cómo falla**

Run: `npx vitest run src/components/exercise/Library.test.tsx -t "botones"`
Expected: FAIL — no existe `[data-library-save]`.

- [ ] **Step 3: Implementa**

En `ExerciseForm`, debajo del botón de programa, un `GhostButton data-library-save`:

- Etiqueta: `libraryExists ? "Actualizar en la Biblioteca" : "Guardar en la Biblioteca"`.
- Si `libraryExists`, al pulsar pide confirmación con `confirmAction` (ya importado de `../ui`, con `danger: false`) diciendo qué campos van a cambiar; **sin confirmar, no escribe**.
- Al escribir, llama a `onSaveToLibrary` y **no toca `f`, ni el día, ni el programa**.
- Estado propio: `libStatus` para el mensaje de éxito o error, **separado** de `status`, que es el del programa. Un fallo al guardar en la biblioteca **no debe** decir «Ejercicio añadido ✓».

`Routine` pasa `libraryExists` mirando si el nombre normalizado del formulario ya está en la biblioteca, y `onSaveToLibrary` llama a `api.exLibrarySave` con `name`, `equipment` (vacío), `muscles` y `how_to` del formulario.

- [ ] **Step 4: Ejecuta y mira cómo pasa**

Run: `npx vitest run src/components/exercise/Library.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/exercise/Routine.tsx frontend/src/components/exercise/Library.test.tsx
git commit -m "feat(ejercicio): anadir al programa y guardar en la biblioteca, por separado"
```

---

### Task 6: El aviso de copias desfasadas

**Files:**
- Modify: `frontend/src/components/exercise/Routine.tsx`
- Modify: `frontend/src/lib/exerciseLibrary.ts` (helper de detección, si lo necesitas)
- Test: `frontend/src/components/exercise/Library.test.tsx`

**Interfaces:**
- Consumes: `libraryFingerprint` y `sourceFp` de Task 4, `api.exLibrarySave` de Task 3.
- Produces: `function staleCopies(list: Exercise[], userEntries: LibraryUserEntry[]): Exercise[]` — los ejercicios cuyo `source` está en la biblioteca y cuya `sourceFp` ya no coincide. El botón lleva `data-stale-update`.

- [ ] **Step 1: Escribe los tests que fallan**

```ts
it("avisa cuando una copia quedó desfasada", async () => {
  // Programa con un ejercicio source="mia-1", sourceFp="antiguo", y la
  // biblioteca con esa entrada ya cambiada. Debe aparecer [data-stale-banner].
});

it("no avisa si nada cambió", async () => {
  // Mismo montaje pero sourceFp coincide con la huella actual. Sin banner.
});

it("no avisa si el origen ya no está en la biblioteca", async () => {
  // Review Focus 5: source apunta a un slug borrado. Sin banner, sin romper.
});

it("actualizar solo toca los campos de la biblioteca", async () => {
  // El más importante del spec. Programa: name="Vieja copia", how_to="Viejo",
  // muscles={pectoral}, series_reps="4×8", rest="90 s", video_path="C:\\v.mp4",
  // day="martes", source="mia-1", sourceFp="antiguo".
  // Tras [data-stale-update], en el mock de exSave:
  //   name, how_to y muscles vienen de la biblioteca;
  //   series_reps sigue "4×8", rest sigue "90 s", video_path sigue "C:\\v.mp4",
  //   day sigue "martes"; y sourceFp pasa a la huella nueva.
});

it("se puede descartar el aviso sin cambiar nada", async () => {
  // [data-stale-dismiss] oculta el banner; exSave no se llama.
});
```

- [ ] **Step 2: Ejecuta y mira cómo falla**

Run: `npx vitest run src/components/exercise/Library.test.tsx -t "desfasad"`
Expected: FAIL — no existe `[data-stale-banner]`.

- [ ] **Step 3: Implementa**

`staleCopies(list, userEntries)` en `exerciseLibrary.ts`: para cada ejercicio con `source`, busca en `userEntries` la entrada con ese slug; si **no está**, se ignora (Review Focus 5). Si está, pasa esa entrada por **`libraryEntry(e.source, userEntries)`** —que devuelve una `LibraryEntry` ya mezclada, el mismo tipo que la firma de `libraryFingerprint` exige— y compara su huella con `e.sourceFp`. Si difieren, el ejercicio está desfasado.

Es el orden correcto: primero se localiza la entrada en las propias, y solo después se calcula la huella sobre la forma mezclada. Al revés, compararías una `LibraryUserEntry` contra una `LibraryEntry` y la huella nunca quadraría.

En `Routine`, con `stale` calculado: banner arriba de la lista, con el texto

> «‹nombre› cambió en la Biblioteca. Lo usas en ‹n› ‹día/días›.» 〔Actualizar〕 〔Ahora no〕

Al actualizar: por cada ejercicio desfasado, `api.exSave(id, { name, how_to, muscles, sourceFp: <nueva huella> })` — **y nada más**. No mandes `series_reps`, `rest`, `video_path` ni `day` en ese `exSave`. Como `exFields` de Task 4 conserva los campos ausentes, basta con no mandarlos. La `huella` nueva es `libraryFingerprint(libraryEntry(e.source, userEntries))`.

- [ ] **Step 4: Ejecuta y mira cómo pasa**

Run: `npx vitest run src/components/exercise/Library.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/exercise/Routine.tsx frontend/src/components/exercise/Library.test.tsx frontend/src/lib/exerciseLibrary.ts
git commit -m "feat(ejercicio): avisar de las copias desfasadas, sin tocar tus series"
```

---

### Task 7: Un ejercicio tuyo sin imágenes, y el e2e

**Files:**
- Modify: `frontend/src/components/exercise/LibraryDetail.tsx`
- Test: `frontend/src/components/exercise/Library.test.tsx`, `frontend/e2e/exercise.spec.ts`

**Interfaces:**
- Consumes: `LibraryEntry` de Task 2, donde `frames: []` y `frame1: null` en las propias.

- [ ] **Step 1: Escribe el test que falla**

```ts
it("una entrada propia muestra «Sin imágenes» en vez de recuadros vacíos", async () => {
  // Con una entrada propia en la biblioteca y seleccionada, el detalle no debe
  // tener <img> y sí tener el texto "Sin imágenes".
});
```

- [ ] **Step 2: Ejecuta y mira cómo falla**

Run: `npx vitest run src/components/exercise/Library.test.tsx -t "Sin imágenes"`
Expected: FAIL.

- [ ] **Step 3: Implementa**

En `LibraryDetail.tsx`: la tira de frames se pinta solo si `entry.frames.length > 0`. Si no, una línea `text-[12px] text-faint` con «Sin imágenes». El resto del detalle —equipo, músculos, instrucciones— se pinta igual.

- [ ] **Step 4: Ejecuta y mira cómo pasa**

Run: `npx vitest run src/components/exercise/Library.test.tsx`
Expected: PASS.

- [ ] **Step 5: Escribe el e2e**

En `frontend/e2e/exercise.spec.ts`, siguiendo el patrón de `addExerciseForDay` que ya existe:

```ts
test("NV-X-012 un ejercicio propio se guarda en la biblioteca y avisa al cambiarlo", async () => {
  // 1. En Ejercicios → Tu programa, escribe un nombre en el formulario y pulsa
  //    [data-library-save]. Debe aparecer el aviso de guardado.
  // 2. Ve a la pestaña Biblioteca: el ejercicio propio aparece en la lista.
  // 3. Añádelo al programa: [data-library-add]. Se marca Añadido ✓.
  // 4. Vuelve al programa y cambia sus pasos con [data-library-save].
  // 5. Aparece [data-stale-banner]. Púlsalo.
  // 6. El aviso desaparece y el ejercicio del programa tiene los pasos nuevos,
  //    con su series_reps intacto.
});
```

- [ ] **Step 6: Ejecuta y mira cómo pasa**

Run: `npx playwright test e2e/exercise.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: La suite entera**

Run: `npx tsc -b` y después `npx vitest run` y `npx playwright test`.
Expected: exit 0 en las tres. Este es el paso que dice si el cambio entero aguanta, no solo la tarea.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/exercise/LibraryDetail.tsx frontend/src/components/exercise/Library.test.tsx frontend/e2e/exercise.spec.ts
git commit -m "feat(ejercicio): una entrada propia sin imagenes, y su e2e"
```
