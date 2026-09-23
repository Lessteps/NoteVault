# Plan — Canvas anidados + Auditoría del sistema de notas

> **Documento de traspaso y reparto de trabajo.** Este archivo divide el trabajo
> entre **Claude** (núcleo/lógica/tests) y **Antigravity** (UI/cableado/pulido).
> Cada tarea trae rutas y líneas exactas, formato de datos, y criterios de
> aceptación. Si una sesión se corta, el otro agente continúa leyendo SOLO este
> archivo más el `PLAN_CANVAS_Y_BACKLINKS.md`.

## Reglas permanentes (NO negociables)

1. **Nunca modificar `FULLSTACK_FACTORY`.**
2. **Tras CADA cambio de código**, reconstruir y copiar el `.exe`:
   ```bash
   pyinstaller NoteVault.spec --noconfirm
   cp dist/NoteVault.exe .
   ```
   Si está bloqueado (app abierta), avisar al usuario; no fallar en silencio.
3. **Paridad con Obsidian**: el canvas debe sentirse como el de Obsidian y superarlo.
4. **Los `.canvas` son archivos de usuario** (viven en la vault, no bajo `.notevault/`).
   Sus adjuntos van en la carpeta `attachments` existente.
5. Todo cambio de formato de vault debe pensarse también para la app móvil.
6. Tests: `python -m pytest -q` en verde. Añadir tests por tarea.

---

# PARTE 1 — Canvas dentro de canvas (nodo canvas embebido)

## Objetivo

Insertar un `.canvas` dentro de otro `.canvas` y verlo renderizado como una
mini-vista. **Fase 1 = solo lectura** (preview + botón para abrir). Fase 2
(posterior) = edición embebida en vivo.

## Estado actual (investigado)

- Formato: `notevault_app/core/canvas_format.py`. Nodos `file` guardan una ruta
  vault-relativa en `node.file`. Tipos estándar: `text|file|link|group`; extras
  NoteVault: `nv-shape|nv-drawing`.
- Despacho de nodos: `CanvasView._add_item_for`
  (`notevault_app/ui/components/notes/canvas/view.py:282`). Un nodo `file` hoy va
  a `MediaNodeItem` (si es imagen/audio/video) o a `NoteNodeItem` (todo lo demás).
  **Un `.canvas` embebido hoy caería en `NoteNodeItem` y mostraría el JSON crudo
  como markdown — roto.**
- Drop de archivos: `CanvasView.dropEvent` (`view.py:626`) solo maneja `.md` y
  extensiones de `_MEDIA_EXTS` (`view.py:38`). No acepta `.canvas`.
- Toolbar: `_build_toolbar` (`view.py:88`). Hay `＋ Nota`, `＋ Media`, etc., pero
  no `＋ Canvas`.
- Ya existe una técnica de render de escena a `QImage` en
  `CanvasView.export_to_png` (`view.py:535`) — reutilizable para el preview.

## Diseño (Fase 1, solo lectura)

Nueva clase `CanvasEmbedItem(BaseNodeItem)` en
`notevault_app/ui/components/notes/canvas/items.py`:

- Backing: un nodo `type="file"` cuyo `file` apunta a un `.canvas`, marcado con
  `nv={"embed": "canvas"}` para despacho inequívoco (Obsidian ignora `nv`).
- Render: carga el `.canvas` destino con `cf.load(...)`, construye una
  **`QGraphicsScene` desechable** con los items reutilizando el despacho, y la
  renderiza a un `QPixmap` una sola vez (cacheado). Se repinta en `paint_content`
  escalado al tamaño del nodo (KeepAspectRatio), con una barra de título arriba
  (nombre del `.canvas`) igual que `NoteNodeItem` (`HEADER_H`).
- Interacción: doble-clic en la cabecera → `open_requested.emit(abs_path)`
  (abre el `.canvas` en su propia pestaña). El cuerpo es solo lectura en Fase 1.
- **Guarda de recursión**: al renderizar el preview, llevar un `depth` y un set
  de rutas visitadas; si un canvas se contiene a sí mismo (directa o
  cíclicamente), NO renderizar recursivamente el nivel interno — pintar un
  placeholder ("⧉ canvas anidado"). Límite de profundidad = 1 en Fase 1 (el
  preview muestra los nodos del hijo, pero un nieto-canvas se dibuja como caja
  placeholder). Copiar el patrón de `expand_transclusions`
  (`qt_markdown.py:154`, `depth`/`_seen`).
- Reload: método `reload()` que invalida el pixmap cacheado y re-renderiza
  (para cuando el `.canvas` hijo cambie en disco).

Detección de formato: helper en `canvas_format.py`:
```python
def is_canvas_file(path) -> bool:
    return str(path).lower().endswith(CANVAS_EXT)
```

## Reparto Parte 1

### Claude (núcleo + lógica de render + tests)
- **C1.1** `canvas_format.is_canvas_file()` helper.
- **C1.2** `CanvasEmbedItem` en `items.py`: carga, render a pixmap cacheado,
  guarda de recursión, `reload()`, `title()`, `open_requested`.
- **C1.3** Función interna reutilizable `render_canvas_to_pixmap(doc, size, depth)`
  que construye escena desechable y devuelve `QPixmap` (extraída de la lógica de
  `export_to_png` para no duplicar). Sin dependencia de una `CanvasView` viva.
- **C1.4** Despacho en `CanvasView._add_item_for`: si el nodo es `file` y
  `is_canvas_file(node.file)` (o `nv.embed == "canvas"`) → `CanvasEmbedItem` y
  conectar `open_requested` → `open_note_requested`.
- **C1.5** Tests `tests/test_canvas_embed.py`: insertar un `.canvas` dentro de
  otro produce `CanvasEmbedItem`; persiste como nodo `file` con `nv.embed`;
  `open_requested` emite la ruta correcta; guarda de recursión no cuelga con un
  canvas auto-referente.

### Antigravity (UI/cableado)
- **A1.1** Toolbar: botón `＋ Canvas` en `_build_toolbar` (`view.py:88`) que
  abre un selector de `.canvas` de la vault (similar a `_pick_and_add_note`,
  `view.py:224`) y llama `add_canvas_node(path, center)`.
- **A1.2** `CanvasView.add_canvas_node(canvas_path, scene_pos)` (paralelo a
  `add_note_node`, `view.py:409`): crea nodo `file` con `nv={"embed":"canvas"}`,
  tamaño por defecto 360×260.
- **A1.3** `dropEvent` (`view.py:626`): aceptar `.canvas` → `add_canvas_node`.
  Añadir `.canvas` a un set de extensiones aceptadas.
- **A1.4** Menú contextual: entrada `＋ Canvas` en `contextMenuEvent`
  (`view.py:889`, rama `else`).
- **A1.5** Icono `.canvas` en el explorador si aún no existe
  (`file_icons.py`), para arrastrarlos al canvas.

**APIs que Claude entrega a Antigravity:** `CanvasEmbedItem(node, abs_path,
service)`, `is_canvas_file(path)`, y el despacho ya resuelto en `_add_item_for`
(Antigravity solo crea el nodo con `nv.embed="canvas"` y el resto funciona).

**Criterios de aceptación Parte 1:**
- Arrastrar/insertar un `.canvas` en otro muestra una mini-vista con los nodos
  del hijo (no JSON crudo).
- Doble-clic en la cabecera abre el `.canvas` hijo en su pestaña.
- Un `.canvas` que se referencia a sí mismo no cuelga la app.
- El archivo padre sigue abriendo en Obsidian (el nodo es `file` estándar +
  `nv` ignorado).

---

# PARTE 2 — Auditoría del sistema de notas

Hallazgos de la revisión de `core/` y `ui/components/notes/`. Ordenados por
severidad. Cada uno indica dueño.

## 2A. Backlinks duplicados e inconsistentes  ⚠ ALTA

**Problema:** existen DOS implementaciones de backlinks:
1. `NotesService.mentions()` (`notes_service.py:438`) — la que ve el usuario en el
   pie de menciones. Ya corregida para equivalencia espacio↔guion bajo.
2. `VaultManager.get_backlinks()` + `rebuild_backlinks()`
   (`vault_manager.py:434-459`) — usada solo por `PropertiesPanel`
   (`properties_panel.py:149`), que **es código muerto** (nunca se instancia en
   `main_window.py`; confirmado en `PLAN_CANVAS_Y_BACKLINKS.md`).

La #2 NO tiene la normalización espacio/guion bajo, así que si algún día se
reactiva, reintroduce exactamente el bug que el usuario reportó en FULLSTACK.

- **Dueño: Claude.** Unificar: hacer que `VaultManager.get_backlinks` delegue en
  `NotesService.mentions` (o extraer la lógica de matching a una sola función
  compartida en `notes_service`), y eliminar/deprecar `rebuild_backlinks` +
  `_backlink_index`. Si el `PropertiesPanel` sigue muerto, marcarlo o borrarlo.
  Tests que garanticen una sola fuente de verdad.

## 2B. Rendimiento de `get_backlinks`  ⚠ ALTA (si se reactiva)

`get_backlinks` llama `rebuild_backlinks()` en CADA invocación
(`vault_manager.py:446`), y `rebuild_backlinks` recorre `all_notes()`
(`vault_manager.py:307`) construyendo objetos `Note` que leen cada archivo de
disco vía `.raw` — **O(N) lecturas de disco por consulta**, en el hilo de UI.
El `VaultIndex` (`vault_index.py`) existe precisamente para evitar esto pero no
se usa aquí.

- **Dueño: Claude.** Al unificar (2A), el camino queda sobre `VaultIndex`
  (memoria, validado por mtime) como ya hace `mentions()`.

## 2C. Sin soporte de aliases ni `title:` de frontmatter  ⚠ ALTA (raíz del bug FULLSTACK)

`Note.title` = `path.stem` (`vault_manager.py:27`). Ignora el `title:` y los
`aliases:` del frontmatter. Obsidian resuelve `[[Alias]]` y `[[Título]]` contra
esos campos. Esta es probablemente la causa de fondo de que FULLSTACK no
encuentre backlinks que Obsidian sí encuentra (además del espacio/guion bajo ya
corregido).

- **Dueño: Claude.** En `mentions()` (y en `resolve_link`), expandir el conjunto
  de identificadores del nodo objetivo con: `title:` del frontmatter y cada
  entrada de `aliases:` (leídos vía `frontmatter_utils.parse_frontmatter` sobre
  el texto ya cacheado en `VaultIndex`, sin lecturas extra de disco). Extender el
  early-exit para no descartar notas que solo mencionan el alias. Tests con notas
  que enlazan por alias y por título.

## 2D. `resolve_link` impreciso y lento  ⚠ MEDIA

`resolve_link` (`vault_manager.py:463`) hace fallback por subcadena
`target_stem in note.title.lower()` (`:480`) → `[[Plan]]` puede resolver a
"Planning_Doc". Además itera `all_notes()` (disco) dos veces por llamada.

- **Dueño: Claude.** Priorizar match exacto (stem/name/rel, con normalización
  espacio↔guion bajo y aliases), y usar el fallback por subcadena solo si no hay
  match exacto y es único. Operar sobre `VaultIndex`. Tests de precisión.

## 2E. Refresco de menciones incompleto  ⚠ MEDIA

Las menciones solo se recargan al abrir una nota y al cambiar marcadores
(`markdown_editor.py`, ver `PLAN_CANVAS_Y_BACKLINKS.md:58`). No se refrescan al
guardar/crear/borrar/mover OTRA nota, así que un backlink recién creado no
aparece hasta reabrir.

- **Dueño: Antigravity.** Conectar `note_saved`/creación/borrado/movimiento →
  un refresco (con debounce) del `_MentionsFooter` de la nota activa. El scan ya
  corre en worker thread (`markdown_editor.py:1989`), así que es cablear señales.
  Reusar el `_generation` existente para descartar resultados obsoletos.

## 2F. Convertir mención no enlazada → enlazada  ✦ FEATURE (paridad Obsidian)

Obsidian ofrece "Link" en cada mención no enlazada para convertirla en
`[[wikilink]]`. Hoy no existe.

- **Dueño: Antigravity.** Botón/acción por fila en la sección "Unlinked" del
  `_MentionsFooter` que inserte `[[Título]]` en la posición de la mención y
  guarde. Claude expone un helper en `NotesService` si hace falta
  (`linkify_mention(path, line_no, title)`); pedirlo si se necesita.

## 2G. Otros (menores)  ▽ BAJA

- `search()` (`vault_manager.py:486`) también recorre `all_notes()` leyendo disco;
  podría ir sobre `VaultIndex`. **Dueño: Claude** (oportunista al tocar 2A/2D).
- `NoteNodeItem`/`MediaNodeItem` en canvas no se refrescan si el `.md`/media
  cambia en disco mientras el canvas está abierto; hay `reload()` en
  `NoteNodeItem` pero no está cableado a un watcher. **Dueño: Antigravity**
  (conectar a `file_watcher` si aplica; opcional).

## Reparto resumido Parte 2

| Ítem | Dueño | Tipo |
|------|-------|------|
| 2A unificar backlinks | Claude | core + tests |
| 2B perf sobre VaultIndex | Claude | core |
| 2C aliases + title frontmatter | Claude | core + tests |
| 2D resolve_link preciso | Claude | core + tests |
| 2E refresco de menciones | Antigravity | UI señales |
| 2F unlinked→linked | Antigravity | UI (+helper Claude si pide) |
| 2G search sobre índice / reload watcher | Claude / Antigravity | opcional |

---

## Orden de ejecución sugerido

1. **Claude 2C + 2A + 2B + 2D** (núcleo de backlinks: aliases, unificación,
   rendimiento, precisión) — es la causa raíz del dolor FULLSTACK y desbloquea
   todo lo demás. Con tests.
2. **Claude Parte 1 (C1.x)** — `CanvasEmbedItem` + despacho + tests.
3. **Antigravity Parte 1 (A1.x)** — toolbar/drop/menú/icono sobre las APIs de Claude.
4. **Antigravity 2E + 2F** — refresco y unlinked→linked.
5. Rebuild del `.exe` tras cada bloque y `pytest -q` en verde.

## Contrato entre agentes

- Claude define y estabiliza las APIs de núcleo (firmas de `mentions`,
  `CanvasEmbedItem`, helpers). Antigravity construye UI SOBRE esas firmas sin
  cambiar la lógica de matching ni el formato de datos.
- Ninguno toca `FULLSTACK_FACTORY`.
- Cada agente añade tests de su parte; nadie deja el suite en rojo.
