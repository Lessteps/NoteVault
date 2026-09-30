# PLAN NOTAS V4 — NoteVault Notes Module

**Ejecutor**: DeepSeek / Antigravity  
**Rama**: master  
**Root del proyecto**: `C:\PROGRAMMING\PROJECTS\NoteVault\frontend`  
**Build**: `cd frontend && npm run electron:build`

---

## CONTEXTO TÉCNICO IMPRESCINDIBLE

- App: Electron + Vite + React + TypeScript
- Arquitectura: IPC → `electron/ipc.ts` → `src/api/registry.ts` → módulos en `src/api/modules/`
- Componentes notas: `src/components/notes/` y `src/components/study/`
- Core: `src/core/` (notesService.ts, fileKinds.ts, etc.)
- Estilos: Tailwind + CSS variables (sin CSS modules)
- El renderer (React) habla con el main process vía `api.*` (bridge en `src/lib/bridge.ts`)
- El AI chat está en `src/api/modules/conversations.ts` + `src/components/notes/AssistantPanel.tsx`

---

## FASE 1 — BUGS CRÍTICOS (hacer primero, en orden)

### BUG-1: Lag/crash al abrir notas de carpeta (ResumenView)

**Causa**: `ResumenView` llama `api.studyTopicDashboard()` en mount. Esa función llama `vaultScan()` → `scanVault()` que lee TODOS los archivos `.md` del vault síncronamente en el main process, bloqueando el renderer hasta 30s en un vault grande. El cache dura 30s pero en la primera llamada del día es bloqueante.

**Archivos a tocar**:
- `src/components/study/ResumenView.tsx`
- `src/api/modules/study.ts`

**Qué hacer**:

1. En `src/api/modules/study.ts`, dentro de `study_topic_dashboard`, ANTES de llamar `vaultScan(app)`, verificar si el warm cache ya está listo. Si `vaultScan` no tiene hit en caché, encolar la operación como micro-batch y devolver un resultado vacío provisional con un campo `loading: true`:

```typescript
// Al inicio de study_topic_dashboard (línea ~920):
study_topic_dashboard: async (subjectFilter?: string) => {
  const cacheKey = `${app.root}::${subjectFilter ?? ""}`;
  const cachedDashboard = _dashboardCache.get(cacheKey) as ...;
  if (cachedDashboard && Date.now() - cachedDashboard.timestamp < SNAPSHOT_CACHE_TTL_MS) {
    return cachedDashboard.data;
  }
  // NUEVO: si el scan cache tampoco existe, devolver skeleton rápido
  const scanHit = _scanCache.get(app.root);
  if (!scanHit) {
    // Devolver payload vacío para que la UI no bloquee; el warm index lo llenará
    return { subjects: [], areas: [], topics: [], loading: true };
  }
  // ... resto igual
```

2. En `src/components/study/ResumenView.tsx`, dentro de `refresh()`:
   - Cuando `data?.loading === true`, mostrar skeleton de carga y hacer un retry con `setTimeout(refresh, 2000)` (hasta 3 reintentos).
   - Añadir un estado `retries` para contar.

```typescript
// En refresh():
const result = await api.studyTopicDashboard(subject || undefined);
if ((result as any).loading) {
  setLoading(true);
  if (retryCount < 3) {
    setRetryCount(c => c + 1);
    setTimeout(() => void refresh(), 2000);
  }
  return;
}
setData(result);
setLoading(false);
```

3. Añadir `const [retryCount, setRetryCount] = useState(0);` al componente.

**Commit**: `fix(study): non-blocking ResumenView load — return skeleton when vault scan cache is cold`

---

### BUG-2: Vista Editar debe verse igual que Vista Lectura

**Causa actual**: Modo `edit` muestra CodeMirror con `livePreview` (un plugin que oculta marcas Markdown pero no renderiza HTML). Modo `read` muestra `ReadView` (HTML renderizado completo con estilos de tipografía). El usuario quiere que **ambos modos se vean como lectura**: HTML renderizado y estilizado. La diferencia solo debe ser que en edit se puede modificar el contenido.

**Solución**: En modo `edit`, renderizar el contenido con `ReadView` y superponer un overlay de edición inline básico. La ruta más rápida para esto es:

**Archivos a tocar**:
- `src/components/notes/EditorArea.tsx`
- `src/components/notes/SourceEditor.tsx` (actualizar tema visual)

**Qué hacer**:

En `src/components/notes/EditorArea.tsx`, en la sección donde se renderiza el editor (líneas ~312-316):

```tsx
// ANTES:
{mode !== "read" && (
  <div className={cn("min-h-0 min-w-0", mode === "split" ? "w-1/2 border-r border-line" : "flex-1")}>
    <Editor note={note} />
  </div>
)}

// DESPUÉS: en modo edit normal (no split), rodear el editor con el mismo
// contenedor de estilos que ReadView usa (clase nv-prose, max-w, padding)
{mode !== "read" && (
  <div className={cn("min-h-0 min-w-0", mode === "split" ? "w-1/2 border-r border-line" : "flex-1")}>
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto max-w-[820px]">
        <Editor note={note} />
      </div>
    </div>
  </div>
)}
```

En `src/components/notes/SourceEditor.tsx`, actualizar el CodeMirror theme para que las fuentes y tamaños coincidan con `ReadView`:
- El `font-size` en `.cm-content` debe ser `16px` (igual que nv-prose).
- El `line-height` debe ser `1.8`.
- Los headings H1-H3 deben tener el mismo tamaño visual que en lectura (agregar reglas CSS al theme de CodeMirror para los tokens de heading).

Agregar estas reglas al `EditorView.theme({...})` existente en SourceEditor:
```typescript
".cm-line .tok-heading1": { fontSize: "1.875rem", fontWeight: "700", lineHeight: "1.3" },
".cm-line .tok-heading2": { fontSize: "1.5rem", fontWeight: "600", lineHeight: "1.35" },
".cm-line .tok-heading3": { fontSize: "1.25rem", fontWeight: "600" },
".cm-content": { maxWidth: "none", fontSize: "16px", lineHeight: "1.8" },
```

**Commit**: `feat(notes): unify edit/read visual style — prose layout and heading sizes in editor`

---

### BUG-3: Temas en nota de carpeta aparecen en desorden

**Causa**: En `src/lib/areaOverview.ts`, la función `groupTopics()` (líneas ~181, 186) ordena los temas por `a.manifest.title.localeCompare(b.manifest.title)` — orden alfabético, no numérico. Los temas con prefijo numérico como "1.1 Números naturales", "1.10 Potenciación", "1.2 Suma" quedan desordenados porque "1.10" < "1.2" en orden alfabético.

**Archivos a tocar**:
- `src/lib/areaOverview.ts`

**Qué hacer**:

1. Importar `compareNumeric` desde `core/notesService`:
```typescript
import { compareNumeric } from "../core/notesService";
```

2. Reemplazar TODAS las llamadas `.localeCompare()` dentro de `groupTopics` (líneas 181 y 186) por `compareNumeric`:
```typescript
// línea 181 (orden de topics dentro de un grupo):
topics: [...items].sort((a, b) => compareNumeric(a.manifest.title, b.manifest.title)),

// línea 186 (orden de grupos):
.sort((a, b) => compareNumeric(a.title, b.title))
```

3. También verificar y corregir en `topicRows.sort()` (línea 116 aproximada) si tiene topics.

**Commit**: `fix(study): sort ResumenView topics by natural numeric order (1.2 before 1.10)`

---

### BUG-5: Explorer debe mostrar TODOS los archivos (no solo md/canvas/código conocido)

**Causa**: En `src/core/notesService.ts`, `childrenOf()` filtra archivos con `kindFor(full)` que retorna `""` (falsy) para extensiones desconocidas como `.json`, `.yaml`, `.txt`, `.env`. Esos archivos quedan invisibles en el explorador.

**Archivos a tocar**:
- `src/core/fileKinds.ts`

**Qué hacer**:

Añadir al objeto `CODE_EXTS` en `src/core/fileKinds.ts` las extensiones más comunes que el usuario puede tener:

```typescript
// Añadir después de ".vb":
".json": ["JSON", "#d4b106"],
".yaml": ["YAML", "#cc342d"],
".yml": ["YAML", "#cc342d"],
".toml": ["TOML", "#9b59b6"],
".xml": ["XML", "#e67e22"],
".txt": ["TXT", "#6b6b74"],
".csv": ["CSV", "#27ae60"],
".env": ["ENV", "#e74c3c"],
".md": ["MD", "#6b6b74"],   // ya manejado por NOTE_EXTS, pero no hace daño
".ini": ["INI", "#95a5a6"],
".cfg": ["CFG", "#95a5a6"],
".dockerfile": ["DC", "#2496ed"],
".makefile": ["MK", "#427819"],
```

Cambiar también la función `kindFor` para que archivos sin extensión reconocida devuelvan `"code"` en lugar de `""`, así CUALQUIER archivo aparece en el explorador:

```typescript
export function kindFor(filePath: string): FileKind {
  const ext = path.extname(String(filePath)).toLowerCase();
  if (NOTE_EXTS.has(ext)) return "note";
  if (CANVAS_EXTS.has(ext)) return "canvas";
  if (ext in CODE_EXTS) return "code";
  // Mostrar cualquier archivo con extensión desconocida como código genérico
  if (ext && ext !== ".") return "code";
  return "";
}
```

**Nota**: Los archivos sin extensión (como `Makefile`, `Dockerfile`) seguirán ocultos porque el filtro `!entry.name.startsWith('.')` ya cubre los dotfiles. Si el usuario quiere verlos también, se puede quitar el filtro de startsWith en un paso posterior.

**Commit**: `feat(explorer): show all file types — unknown extensions appear as generic code files`

---

## FASE 2 — SISTEMA DE SKILLS Y PRÁCTICA

### TASK-2A: Carpeta de templates/skills visible en el explorador dentro de la materia

**Propósito**: Crear dentro de `Matemáticas/` (o de cualquier materia) una carpeta `_skills/` con archivos plantilla que la IA usa como contexto cuando genera nuevos temas. Esta carpeta sí debe aparecer en el explorador.

**Archivos a tocar**:
- `src/core/notesService.ts` (función `isIgnoredDir` o `isReserved`)
- Crear archivos físicos de templates en el vault

**Qué hacer**:

1. Verificar en `src/core/notesService.ts` la función `isIgnoredDir` para asegurarse que carpetas que comienzan con `_` no están excluidas. Si están excluidas, cambiar la regla para que solo se excluyan las que comienzan con `.` (dotfolders).

2. Crear los siguientes archivos en el vault real en `C:\PROGRAMMING\Matemáticas\_skills\`:
   - `canvas_skill.md` — plantilla de cómo armar un canvas de metodología
   - `resumen_teorico_skill.md` — plantilla de nota `.md` teórica  
   - `practica_skill.md` — plantilla de nota `.practica.md`

Contenido mínimo de `canvas_skill.md`:
```markdown
---
type: skill_template
skill: canvas_creation
---
# Cómo crear un Canvas de metodología FULLSTACK

Cada micro-paso lleva: encabezado → nota "How to" → ejemplo.
Toda flecha lleva etiqueta que explica la conexión.

## Estructura de nodos obligatoria
1. Nodo CONCEPTO (centro)
2. Nodos ÁREA (conectados al centro)
3. Nodos TEMA por área
4. Nodos EJERCICIO por tema (tipo y dificultad)
```

Contenido mínimo de `resumen_teorico_skill.md`:
```markdown
---
type: skill_template
skill: teoria_creation
---
# Plantilla de nota teórica

## Frontmatter obligatorio
```yaml
---
type: teorica
subject: Matemáticas
area: 1 Aritmética elemental y operativa
topic: 1.1 Números naturales
tags: [matemáticas, aritmética]
---
```

## Estructura
1. Definición formal
2. Ejemplos trabajados
3. Propiedades clave
4. Errores comunes
```

Contenido de `practica_skill.md`:
```markdown
---
type: skill_template
skill: practica_creation
---
# Plantilla de archivo .practica.md

Un archivo .practica.md contiene ejercicios estructurados.
Cada ejercicio tiene: enunciado, espacio de trabajo, solución oculta.

## Tipos de skill disponibles
- IMPLEMENT: resolver problema desde cero
- DEBUG: encontrar y corregir errores
- REFACTOR: mejorar código/demostración existente
- TRUE_FALSE: clasificar afirmaciones (Verdadero/Falso con justificación)
- PROCEDURE: aplicar un procedimiento paso a paso
- PROOF: demostrar una propiedad matemática
```

**Commit**: `feat(skills): add _skills/ template folder with canvas, theory, and practice templates`

---

### TASK-2B: El chat de IA puede crear archivos .md y .practica directamente

**Propósito**: El panel de asistente (AssistantPanel) actualmente es solo chat. Hay que añadir un botón/comando que le permita a la IA crear archivos en el vault usando los resultados del chat.

**Enfoque**: Añadir un botón "Guardar como nota" en los mensajes del asistente cuando la respuesta contiene markdown estructurado. El botón abre un diálogo para elegir carpeta y nombre, y crea el archivo.

**Archivos a tocar**:
- `src/components/notes/AssistantPanel.tsx`
- `src/lib/bridge.ts` (verificar que `api.createNote` y `api.writeNote` están expuestos)

**Qué hacer**:

1. En `AssistantPanel.tsx`, después del componente `<ChatBubble>` (donde se renderiza cada mensaje del asistente), añadir un botón "Crear nota" que aparece al hacer hover sobre mensajes del asistente:

```tsx
// En el componente que renderiza mensajes del asistente (buscar donde role === "assistant"):
{msg.role === "assistant" && (
  <button
    type="button"
    className="mt-2 rounded-md border border-line px-2 py-0.5 text-[11px] text-dim hover:bg-hover hover:text-text"
    onClick={() => void handleSaveAsNote(msg.content)}
  >
    Crear nota con este contenido
  </button>
)}
```

2. Implementar `handleSaveAsNote(content: string)`:
```typescript
const handleSaveAsNote = async (content: string) => {
  const title = await askText("Nombre de la nota", "", "Crear");
  if (!title) return;
  const folder = active ? active.split("/").slice(0, -1).join("/") : "";
  try {
    const { path } = await api.createNote(title, folder);
    await api.writeNote(path, content);
    void openNote(path);
    toast("info", `Nota creada: ${title}`);
  } catch (e) {
    toast("error", (e as Error).message);
  }
};
```

3. Importar `askText` desde `../ui` y `openNote` desde el store.

**Commit**: `feat(assistant): add "crear nota" button to save AI response as a .md file in vault`

---

### TASK-2C: Script de selección de skills por IA para un tema

**Propósito**: Cuando el usuario está en un tema (TopicFileView / practica tab), puede pulsar un botón que:
1. Lee el `_tema.md` del tema (tipo: teorico/practico, subject, área)
2. Lee los templates de `_skills/`
3. Manda prompt a la IA: "Dado este tema [X] de tipo [teorico/practico], ¿cuáles skills de esta lista son más relevantes? Responde con JSON: `{skills: ["skill1", ...], quantities: {skill1: N}, difficulties: {skill1: "Intermediate"}}`"
4. Crea los ejercicios en el archivo `.practica.md`

**Archivos a tocar**:
- `src/components/study/TopicFileView.tsx` (añadir botón "Generar práctica con IA")
- `src/api/modules/study.ts` (nuevo handler `study_generate_practice`)
- `src/core/aiClient.ts` (usar función `chat()` existente)

**Qué hacer**:

En `src/components/study/TopicFileView.tsx`, añadir un botón en la barra de acciones del tema:
```tsx
<button
  type="button"
  className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-strong"
  onClick={() => void handleGeneratePractice()}
  disabled={generatingPractice}
>
  {generatingPractice ? "Generando…" : "✦ Generar práctica con IA"}
</button>
```

Implementar `handleGeneratePractice` que llama a `api.studyGeneratePractice(note.path)`.

En `src/api/modules/study.ts`, añadir el handler `study_generate_practice`:

```typescript
async study_generate_practice(rel: string) {
  // 1. Leer _tema.md del folder
  const abs = app.resolve(rel, { allowRoot: true });
  const folderAbs = fs.statSync(abs).isDirectory() ? abs : path.dirname(abs);
  const manifestPath = path.join(folderAbs, "_tema.md");
  if (!fs.existsSync(manifestPath)) throw new ApiError("No hay _tema.md en esta carpeta.");
  const manifest = fs.readFileSync(manifestPath, "utf-8");
  
  // 2. Leer templates de _skills/
  const vaultRoot = app.root;
  const skillsDir = path.join(vaultRoot, "_skills"); // o buscar recursivamente
  let skillsContext = "";
  if (fs.existsSync(skillsDir)) {
    const skillFiles = fs.readdirSync(skillsDir).filter(f => f.endsWith(".md"));
    for (const sf of skillFiles) {
      skillsContext += fs.readFileSync(path.join(skillsDir, sf), "utf-8") + "\n\n";
    }
  }
  
  // 3. Llamar a la IA
  const cfg = loadAiConfig(vaultRoot);
  if (!cfg || cfg.provider === "none") throw new ApiError("Configura primero un proveedor de IA en el panel.");
  
  const prompt = `Eres un experto en diseño de ejercicios pedagógicos.
  
TEMA:
${manifest}

SKILLS DISPONIBLES:
${skillsContext}

Decide cuáles skills son más relevantes para este tema según si es teórico o práctico.
Responde SOLO con JSON válido, sin comentarios:
{
  "skills": ["nombre_skill_1", "nombre_skill_2"],
  "quantities": {"nombre_skill_1": 5, "nombre_skill_2": 3},
  "difficulties": {"nombre_skill_1": "Intermediate", "nombre_skill_2": "Beginner"},
  "rationale": "una línea explicando la elección"
}`;

  const response = await chatOnce(cfg, prompt);
  
  // 4. Parsear JSON de respuesta
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new ApiError("La IA no devolvió JSON válido.");
  const plan = JSON.parse(jsonMatch[0]);
  
  // 5. Actualizar el .practica.md con el plan
  const topicName = path.basename(folderAbs);
  const practicaPath = path.join(folderAbs, `${topicName}.practica.md`);
  // ... appender o crear el archivo con los ejercicios del plan
  
  return { ok: true, plan, path: app.rel(practicaPath) };
}
```

**Nota para el ejecutor**: `chatOnce` es una función helper que hace una sola request al AI. Si no existe, crearla usando el cliente existente en `src/core/aiClient.ts`, usando la función `chat()` o similar.

**Commit**: `feat(study): add AI-powered practice generation from topic manifest and skill templates`

---

## FASE 3 — PANEL "REPASO" (Spaced Repetition Calendar)

### TASK-3A: Nueva pestaña "Repaso" en el panel derecho

**Propósito**: Añadir una pestaña "Repaso" en el `StudyPanel` (panel derecho) que muestre un calendario de próximos repasos SRS, qué notas hay que repasar y en qué dificultad.

**Archivos a tocar**:
- `src/components/study/StudyPanel.tsx`
- `src/api/modules/study.ts` (nuevo handler `study_srs_schedule`)

**Qué hacer**:

1. En `StudyPanel.tsx`, añadir `"repaso"` a los tabs:
```typescript
const tabs: Array<[...] = [
  ["today", ...],
  ["repaso", "Repaso"],  // NUEVO
  ...
];
```

2. Renderizar `{tab === "repaso" && <SrsCalendarView snap={snap} />}` dentro del panel.

3. Crear componente `SrsCalendarView` en el mismo archivo o en `src/components/study/SrsCalendarView.tsx`:
```tsx
function SrsCalendarView({ snap }: { snap: StudySnapshot }) {
  // snap.queue.items ya tiene los ejercicios con next_review_at
  // Agrupar por fecha
  const byDate = new Map<string, typeof snap.queue.items>();
  for (const item of snap.queue.items) {
    if (!item.exercise?.next_review_at) continue;
    const date = new Date(item.exercise.next_review_at * 1000).toLocaleDateString("es", {
      weekday: "short", day: "numeric", month: "short"
    });
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(item);
  }
  
  if (byDate.size === 0) {
    return <div className="p-4 text-[12px] text-faint">No hay repasos pendientes programados.</div>;
  }
  
  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-4">
      {[...byDate.entries()].map(([date, items]) => (
        <div key={date}>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-dim">{date}</div>
          <div className="flex flex-col gap-1">
            {items.map((item, i) => (
              <div key={i} className="rounded-md border border-line bg-card px-3 py-2 text-[12px]">
                <span className="text-text">{item.exercise?.title ?? "Ejercicio"}</span>
                <span className={cn("ml-2 text-[10px]", KIND[item.kind]?.[1] ?? "text-dim")}>
                  {KIND[item.kind]?.[0] ?? item.kind}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Commit**: `feat(study): add SRS calendar tab "Repaso" showing upcoming review schedule`

---

## FASE 4 — GENERACIÓN DE TEMARIO CON IA

### TASK-4A: Botón "Generar temario" en el panel de asistente

**Propósito**: Dentro del `AssistantPanel`, añadir un botón especial que inicia un flujo multi-paso para que la IA genere la estructura de áreas y temas de una materia nueva.

**Archivos a tocar**:
- `src/components/notes/AssistantPanel.tsx`
- `src/api/modules/study.ts` (nuevo handler `study_generate_syllabus`)

**Flujo de 3 pasos**:
1. IA pregunta: "¿Cuáles son las áreas principales de [materia]?" → devuelve lista
2. IA pregunta: "Para cada área, ¿cuáles son sus temas?" → devuelve árbol completo
3. IA confirma y resume el temario propuesto → usuario aprueba → se crean las carpetas + archivos `.resumen.md`

**Qué hacer**:

1. En `AssistantPanel.tsx`, en el área de botones de herramientas (buscar donde están los botones de acción del chat), añadir:
```tsx
<button
  type="button"
  title="Generar temario completo de una materia con IA"
  onClick={() => void handleGenerateSyllabus()}
  className="..."
>
  <BookOpen size={14} /> Generar temario
</button>
```

2. `handleGenerateSyllabus()` abre un `askText` para pedir el nombre de la materia, luego llama a `api.studyGenerateSyllabus(materia)`.

3. En `src/api/modules/study.ts`, añadir `study_generate_syllabus`:

```typescript
async study_generate_syllabus(subject: string) {
  const cfg = loadAiConfig(app.root);
  if (!cfg) throw new ApiError("Configura un proveedor de IA primero.");
  
  // Paso 1: áreas
  const areasResponse = await chatOnce(cfg, 
    `Eres un experto en diseño curricular. Dame las 8-12 áreas principales de "${subject}" numeradas (ej: "1 Aritmética", "2 Álgebra"). Solo la lista, sin explicaciones.`
  );
  
  // Paso 2: temas por área
  const topicsResponse = await chatOnce(cfg,
    `Dadas estas áreas de ${subject}:\n${areasResponse}\n\nPara cada área, da de 6 a 12 temas numerados (ej: "1.1 Números naturales"). Formato: AREA > temas. Sin explicaciones extra.`
  );
  
  // Paso 3: confirmar y estructurar
  const structured = await chatOnce(cfg,
    `Convierte este temario en JSON. Solo JSON, sin comentarios:\n${topicsResponse}\n\n{"areas": [{"name": "1 Aritmética", "folder": "1 Aritmética elemental y operativa", "topics": [{"name": "1.1 Números naturales", "folder": "1.1 Números naturales enteros y recta numérica"}]}]}`
  );
  
  const jsonMatch = structured.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new ApiError("La IA no pudo estructurar el temario.");
  const plan = JSON.parse(jsonMatch[0]);
  
  // Crear carpetas y archivos .resumen.md
  const subjectDir = path.join(app.root, subject);
  if (!fs.existsSync(subjectDir)) fs.mkdirSync(subjectDir, { recursive: true });
  
  const created: string[] = [];
  for (const area of plan.areas ?? []) {
    const areaDir = path.join(subjectDir, area.folder);
    if (!fs.existsSync(areaDir)) fs.mkdirSync(areaDir, { recursive: true });
    
    // Crear .resumen.md del área
    const resumenPath = path.join(areaDir, `${area.folder}.resumen.md`);
    if (!fs.existsSync(resumenPath)) {
      fs.writeFileSync(resumenPath, `---\ntype: resumen\nsubject: ${subject}\nscope: ${area.folder}\ntitle: ${area.name}\n---\n\n# ${area.name}\n`, "utf-8");
      created.push(app.rel(resumenPath));
    }
    
    for (const topic of area.topics ?? []) {
      const topicDir = path.join(areaDir, topic.folder);
      if (!fs.existsSync(topicDir)) fs.mkdirSync(topicDir, { recursive: true });
    }
  }
  
  clearStudySnapshotCache();
  return { ok: true, created, plan };
}
```

4. Después de la llamada, refrescar el árbol con `s.refreshTree()` y mostrar un toast con cuántas carpetas se crearon.

**Commit**: `feat(study): AI-powered syllabus generator creates folder structure from subject name`

---

## FASE 5 — PANEL GLOBAL DE PRÁCTICA

### TASK-5A: Conectar el panel "Iniciar práctica global" con skills definidas

**Propósito**: El botón "Iniciar práctica" en el panel derecho actualmente falla porque las skills no están definidas. Hay que conectarlo al nuevo sistema de skills.

**Archivos a tocar**:
- `src/components/study/PracticePanel.tsx` (o donde esté el botón global de práctica)
- `src/components/study/StudyPanel.tsx`

**Qué hacer**:

1. Localizar el componente que tiene el botón "Iniciar práctica" (probablemente en `PanelLaunchers.tsx` o `StudyPanel.tsx`).

2. Cambiar el comportamiento: en lugar de intentar iniciar una sesión sin skills, el botón debe:
   a. Verificar si hay temas con ejercicios disponibles (`snap.queue.counts.total > 0`)
   b. Si hay ejercicios: abrir el primero de la cola directamente
   c. Si no hay ejercicios: mostrar un mensaje guía con botón "Generar práctica con IA"

```tsx
const handleStartPractice = async () => {
  if (!snap || snap.queue.counts.total === 0) {
    toast("info", "No hay ejercicios en cola. Usa 'Generar práctica con IA' en un tema primero.");
    return;
  }
  const first = snap.queue.items.find(i => i.exercise);
  if (first?.exercise) {
    await openNote(first.exercise.path);
    setMode("read");
  }
};
```

**Commit**: `fix(study): global practice button shows guidance when no exercises are queued`

---

## RESUMEN DE COMMITS Y PUSH FINAL

Orden de commits a hacer:

```
git add -p  # revisar siempre qué se incluye
git commit -m "fix(study): non-blocking ResumenView load — return skeleton when vault scan cache is cold

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git commit -m "feat(notes): unify edit/read visual style — prose layout and heading sizes in editor

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git commit -m "fix(study): sort ResumenView topics by natural numeric order (1.2 before 1.10)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git commit -m "feat(explorer): show all file types — unknown extensions appear as generic code files

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git commit -m "feat(skills): add _skills/ template folder with canvas, theory, and practice templates

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git commit -m "feat(assistant): add 'crear nota' button to save AI response as a .md file in vault

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git commit -m "feat(study): add AI-powered practice generation from topic manifest and skill templates

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git commit -m "feat(study): add SRS calendar tab 'Repaso' showing upcoming review schedule

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git commit -m "feat(study): AI-powered syllabus generator creates folder structure from subject name

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git commit -m "fix(study): global practice button shows guidance when no exercises are queued

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

## BUILD Y PUSH FINAL

```bash
# Desde C:\PROGRAMMING\PROJECTS\NoteVault\frontend
npm run build          # verificar que no hay errores de TypeScript
npm run electron:build # genera el .exe en release/

# Desde C:\PROGRAMMING\PROJECTS\NoteVault
git push origin master
```

---

## NOTAS PARA EL EJECUTOR

1. **Prioridad**: Hacer BUG-1, BUG-2, BUG-3, BUG-5 primero (son fixes). Las fases 2-5 son features.
2. **Verificar imports**: Cada archivo nuevo necesita sus imports. No asumir que algo está importado.
3. **TypeScript**: El proyecto usa TypeScript estricto. Verificar tipos antes de compilar.
4. **Tests**: Hay archivos `.test.ts` por módulo. No es necesario añadir tests para este plan, pero no romper los existentes.
5. **No tocar**: El sistema de canvas, el módulo de finanzas, el módulo de hábitos, y el módulo web. Solo tocar lo indicado.
6. **chatOnce helper**: Si no existe en `src/core/aiClient.ts`, crear una función:
   ```typescript
   export async function chatOnce(cfg: AiConfig, prompt: string): Promise<string> {
     // Usar la función chat() existente con un solo mensaje de usuario
     const messages = [{ role: "user" as const, content: prompt }];
     let result = "";
     for await (const chunk of chat(cfg, messages)) {
       result += chunk;
     }
     return result;
   }
   ```
7. **loadAiConfig**: Si no existe como función standalone, obtener la config desde `app.service` o equivalente.
