# Plan — Backlinks navegables + Canvas estilo Obsidian (mejorado)

> **Documento de traspaso.** Si la sesión no alcanza a terminar, otro agente
> (Antigravity u otro) debe poder continuar leyendo SOLO este archivo. Por eso
> incluye estado actual con rutas y líneas exactas, el formato de datos, y
> criterios de aceptación por fase.

## Reglas permanentes del proyecto (NO negociables)

1. **Nunca modificar `FULLSTACK_FACTORY`.**
2. **Tras CADA cambio de código** hay que reconstruir el ejecutable y copiarlo a
   la raíz del repo, porque el usuario abre la app por el `.exe`, no por CLI:
   ```bash
   pyinstaller NoteVault.spec --noconfirm
   cp dist/NoteVault.exe .
   ```
   Si el `.exe` está bloqueado (app abierta), avisar al usuario y pedir que la
   cierre; no fallar en silencio.
3. **Paridad con Obsidian**: el módulo de notas debe replicar la experiencia de
   Obsidian. El Canvas debe sentirse como el de Obsidian y además superarlo con
   las mejoras de este plan.
4. **Explorador solo-notas**: en el árbol solo aparecen notas, scripts de código
   (iconos distintos) y ahora también los archivos `.canvas` (icono propio),
   ordenados por numeración natural. Las carpetas de datos de módulos y los
   adjuntos nunca aparecen.
5. **Toda la data de módulos vive bajo una sola carpeta**: `.notevault/`
   (`DATA_DIR` en `vault_format.py`). PERO los `.canvas` son archivos de usuario
   y van en la vault como archivos normales (igual que en Obsidian), NO bajo
   `.notevault/`. Los adjuntos multimedia del canvas se guardan en la carpeta de
   adjuntos existente (`attachments`).
6. Cada cambio de formato de vault que aplique, debe pensarse también para la app
   móvil (aunque aquí implementemos primero escritorio).
7. Tests: correr `python -m pytest -q` y mantener todo en verde. Añadir tests por
   fase.

---

## PARTE A — Backlinks

### Estado actual (investigado)

- El backlinks real que ve el usuario es `_MentionsFooter`, un pie de página
  dentro del editor de notas:
  `notevault_app/ui/components/notes/markdown_editor.py:1939`.
  - Muestra "Linked mentions" y "Unlinked mentions".
  - Cada fila es un `QPushButton` (`_row`, línea ~2090) que **sí** hace
    `self.open_requested.emit(Path(p))`.
  - `open_requested` → `self.open_note_requested.emit` (línea 224) →
    en `main_window.py:274` se conecta `open_note_requested` → `open_note`.
  - Los datos vienen de `NotesService.mentions()`
    (`notevault_app/core/notes_service.py:438`), que devuelve `Mention` con
    `path` (Path absoluto), `title`, `line_no`, `line`, `linked`.
- Existe además `PropertiesPanel` con una pestaña "Backlinks"
  (`notevault_app/ui/components/properties_panel.py:149`) que emite
  `note_link_clicked(str)` — pero **esta clase NUNCA se instancia** en la app
  (no aparece conectada en `main_window.py`). Es código muerto respecto a la UI
  activa.
- Refresco: `refresh_mentions` (`markdown_editor.py:1856`) solo se dispara al
  abrir una nota y cuando cambian marcadores (`main_window.py:271`). **No** se
  refresca cuando se edita/guarda/crea/borra/mueve otra nota.

### Problema 1 — "no se les puede dar click y que te lleven al archivo"

Hipótesis a verificar EN LA APP (paso obligatorio, ver memoria de verificación
visual): abrir una nota que tenga backlinks y hacer click. Causas probables a
descartar en orden:

1. El footer podría estar colapsado o con altura insuficiente para clickar
   cómodamente (`setMaximumHeight(230)`), revisar que el `QPushButton` reciba el
   click y no lo intercepte el `QScrollArea`.
2. Verificar que `open_note` acepte un `Path` absoluto tal cual sale de
   `Mention.path`. Si `open_note` espera vault-relativo o un `Note`, ahí está el
   bug → normalizar en el slot.
3. Confirmar que `open_requested`→`open_note_requested`→`open_note` no se rompe
   por el tipo de firma (Signal(Path) vs Signal(object)).

**Entregable**: al hacer click en cualquier fila de backlink/mención, la app
abre esa nota y salta a la línea (`line_no`) del match. Si hoy no salta a la
línea, añadir esa capacidad (abrir + posicionar cursor/scroll en `line_no`).

### Problema 2 — "los backlinks deben actualizarse automáticamente"

Hacer que las menciones se recalculen cuando el contenido de la vault cambia, no
solo al abrir la nota:

- Conectar `note_saved` (autosave dispara cada ~1.2 s) a un **refresh
  desacoplado y con debounce** de las menciones de la nota activa. OJO: no hacer
  un rebuild del índice completo en cada autosave (congela la UI). En su lugar:
  - Actualizar el `VaultIndex` de forma incremental para el archivo que se
    guardó (invalidar/reinsertar solo esa entrada).
  - Disparar `refresh_mentions()` con un `QTimer` debounced (~800 ms) tras el
    último guardado.
- También refrescar menciones tras crear/borrar/mover notas (ya existen señales
  `note_moved`, `bookmarks_changed`; añadir `note_created` / `note_deleted` si
  hace falta).
- Verificar `VaultIndex` (`notevault_app/core/vault_index.py`): añadir un método
  `update_note(path)` / `invalidate(path)` si no existe, para refresco
  incremental barato.

**Entregable**: si la nota A menciona a B y edito A, al mirar los backlinks de B
(sin reabrirla) la mención aparece/desaparece sola en < ~1 s.

### Tests Parte A (`tests/test_backlinks.py`)

- `mentions()` detecta enlace `[[Título]]` y mención suelta.
- Refresco incremental: tras `update_note`, `mentions()` refleja el cambio sin
  rebuild total.
- (UI, offscreen) click en fila emite `open_note_requested` con el Path correcto.

---

## PARTE B — Canvas estilo Obsidian (mejorado)

### Modelo de integración

Igual que Obsidian: **el canvas es un tipo de archivo** (`.canvas`) que vive en
la vault y se abre dentro del área de trabajo de Notas (no es un modo global
nuevo). Al abrir un `.canvas` desde el explorador, el centro de notas muestra el
editor de canvas en vez del editor markdown.

- Modos actuales: `main_window.py:55` (`MODE_*`) con stacks apilados. El centro
  de notas es `self._notas_center` (index 2 del `_center_stack`).
- Enrutado por extensión: cuando el archivo abierto termina en `.canvas`,
  `_notas_center` debe enrutar a `CanvasView` en lugar de `MarkdownEditor`.
  Opciones (elegir en implementación):
  - (Preferida) Añadir soporte de "pestaña canvas" dentro del contenedor de
    notas, para poder tener notas y canvases abiertos a la vez.
  - (Mínima) Un `QStackedWidget` interno notas/canvas conmutado por extensión.

### Formato de archivo `.canvas` (JSON, compatible con Obsidian + extensiones)

Base Obsidian (mantener compatibilidad de lectura/escritura):

```json
{
  "nodes": [
    {
      "id": "a1b2",
      "type": "file|text|link|group",
      "x": 0, "y": 0, "width": 400, "height": 300,
      "color": "1",
      "file": "ruta/relativa/nota.md",     // type=file
      "text": "contenido markdown",         // type=text
      "url": "https://…",                   // type=link
      "label": "Título del grupo"           // type=group
    }
  ],
  "edges": [
    {
      "id": "e1",
      "fromNode": "a1b2", "fromSide": "right",
      "toNode": "c3d4",   "toSide": "left",
      "color": "3", "label": "sí",
      "toEnd": "arrow", "fromEnd": "none"
    }
  ]
}
```

**Extensiones propias** (namespaced bajo `"nv"` para no romper Obsidian, que
ignora claves desconocidas):

- Nodos multimedia: `type="file"` apuntando a imagen/audio/video (reusar
  `attachments`), con `"nv": {"media": "image|audio|video"}`.
- Nodos de dibujo a mano alzada: `type="nv-drawing"` con
  `"nv": {"strokes": [{"points": [[x,y]…], "color": "...", "width": n}]}`.
- Nodos de forma (diagramas de flujo): `type="nv-shape"` con
  `"nv": {"shape": "start_end|process|decision|io|connector|predefined|
  database|manual_input|display|comment", "text": "..."}`.
- Estilo de arista extendido: `"nv": {"style": "solid|dashed|dotted",
  "routing": "straight|orthogonal|bezier"}`.

> Al guardar, si el canvas solo usa nodos/edges estándar, el archivo debe seguir
> siendo válido para Obsidian. Los tipos `nv-*` son la mejora.

### Arquitectura técnica

- **Framework**: `QGraphicsView` + `QGraphicsScene` (no existe todavía ninguno en
  el proyecto; es la herramienta correcta para zoom/pan/ítems arrastrables).
- Nuevos archivos:
  - `notevault_app/core/canvas_format.py` — leer/escribir/validar `.canvas`
    (dataclasses `CanvasNode`, `CanvasEdge`, `CanvasDoc`; `load`/`dump`).
  - `notevault_app/ui/components/notes/canvas/` (paquete):
    - `canvas_view.py` — `CanvasView(QGraphicsView)`: zoom (rueda+ctrl), pan
      (espacio/medio-click o arrastre de fondo), rejilla, snap, undo/redo,
      copiar/pegar, selección múltiple, orden Z, autoguardado.
    - `canvas_scene.py` — `QGraphicsScene` con fondo de rejilla.
    - `nodes.py` — items: `NoteNode`, `TextNode`, `MediaNode`, `ShapeNode`,
      `DrawingNode`, `GroupNode` (todos `QGraphicsItem` redimensionables con
      *resize handles*).
    - `edges.py` — `EdgeItem` (línea/curva con flechas y etiqueta, anclada a
      lados de nodos, se re-rutea al mover).
    - `toolbar.py` — barra de herramientas del canvas (select, mano/pan, texto,
      forma▾, dibujo, media, conectar, color).
    - `shapes.py` — dibujo de formas de diagrama de flujo (paths de cada forma).

### Fases del Canvas

Implementar y **reconstruir/copiar el `.exe` al final de cada fase**, correr
tests, y hacer verificación visual (instanciar la vista y `grab().save(...)`
comparando el resultado).

#### Fase C0 — Andamiaje
- `canvas_format.py` con load/dump/validación y round-trip (crea `.canvas`
  vacío, lo lee y compara).
- `.canvas` visible en el explorador con icono propio (extender `file_icons.py`
  y las reglas de `notes_service` para que `.canvas` cuente como archivo
  listable, tipo "canvas").
- Comando en Command Palette: "Nuevo canvas…" que crea `<nombre>.canvas` en la
  carpeta actual y lo abre.
- `CanvasView` mínimo que abre un `.canvas` (aunque esté vacío) enrutado desde el
  explorador. Autoguardado a archivo.
- **Aceptación**: crear canvas, aparece en árbol, abre vista vacía con rejilla,
  zoom y pan funcionan, guarda y reabre sin perder estado.

#### Fase C1 — Nodos de nota (el corazón)
- `NoteNode`: arrastrable, redimensionable (grande/pequeño), muestra el
  contenido de la nota renderizado. Doble-click = **editar la nota desde el
  canvas** (editor markdown embebido en el nodo, o abrir en el editor y
  reflejar). Reusar el pipeline de render/edición del `MarkdownEditor` en la
  medida de lo posible.
- Añadir notas al canvas: arrastrar desde el explorador al canvas, o comando
  "Añadir nota al canvas…".
- Persistir posición/tamaño en el `.canvas`.
- **Aceptación**: pongo una nota en el canvas, la agrando/achico, la edito desde
  ahí y el cambio se guarda en el `.md` real.

#### Fase C2 — Nodos de texto y multimedia (req. 3.2)
- `TextNode`: tarjeta de texto/markdown libre (no ligada a archivo).
- `MediaNode`: imagen (mostrar), audio y video (reproductor con
  play/pausa/seek). Reusar `attachments` para copiar el archivo a la vault.
  Añadir por: botón de la toolbar, arrastrar archivo externo al canvas, pegar.
- **Aceptación**: puedo insertar imagen, audio y video; el audio/video se
  reproduce; el archivo queda referenciado de forma relativa y persiste.

#### Fase C3 — Aristas / líneas para unir (req. 3.3)
- `EdgeItem`: arrastrar desde un puerto (lado) de un nodo a otro nodo crea una
  arista. Flechas en extremos, etiqueta editable, color, estilo
  (sólida/discontinua/punteada), ruteo (recto/ortogonal/bézier).
- Se re-rutea automáticamente al mover los nodos.
- **Aceptación**: uno dos nodos, muevo uno y la línea sigue conectada; puedo
  poner etiqueta y cambiar estilo/flechas.

#### Fase C4 — Formas de diagrama (req. 3.4)
- `ShapeNode` con las formas comunes de lógica de programación:
  - Inicio/Fin (óvalo / *terminator*)
  - Proceso (rectángulo)
  - Decisión (rombo)
  - Entrada/Salida (paralelogramo)
  - Conector (círculo pequeño)
  - Proceso predefinido/subrutina (rectángulo con doble borde)
  - Base de datos (cilindro)
  - Entrada manual (trapecio)
  - Documento/Display, y Comentario/anotación
- Cada forma con texto centrado editable, color y redimensionable, y conectable
  con aristas.
- **Aceptación**: puedo colocar cada forma, escribir dentro, cambiar color y
  unirlas para armar un flujograma.

#### Fase C5 — Dibujo a mano alzada (req. 3.1)
- Herramienta "Dibujo": lápiz a mano alzada sobre el canvas (capa de trazos),
  con grosor y color; borrador. Se guarda como `nv-drawing`.
- **Aceptación**: activo dibujo, trazo con el mouse, cambio color/grosor, borro,
  y los trazos persisten al reabrir.

#### Fase C6 — Pulido / funciones extra (no pedidas explícitamente, añadidas)
- Rejilla con **snap opcional**, alinear/distribuir selección.
- **Undo/redo**, copiar/pegar/duplicar, borrar, orden Z (traer al frente/enviar
  atrás), **bloquear** nodo.
- **Grupos** (`GroupNode`) que mueven su contenido juntos, con etiqueta.
- Paleta de **colores** estilo Obsidian (1–6 + custom) para nodos y aristas.
- **Nodo enlace** (`type=link`) que muestra una URL/preview.
- **Minimapa** y "ajustar a la vista" / centrar.
- **Exportar** canvas a imagen (PNG) y opción de exportar selección.
- Enlaces bidireccionales: si un `NoteNode` está en un canvas, considerar que el
  canvas cuente como backlink de esa nota (integración con Parte A).
- Búsqueda dentro del canvas (resaltar nodo por texto).

### Tests Parte B
- `tests/test_canvas_format.py`: round-trip load/dump, compatibilidad Obsidian
  (claves estándar intactas), validación de tipos `nv-*`.
- `tests/test_canvas_view.py` (offscreen): crear escena, añadir nodo, mover,
  redimensionar, conectar arista, serializar → deserializar mantiene geometría.

---

## Orden de ejecución sugerido

1. **Parte A** completa (backlinks click + auto-update) — win rápido y aislado.
   Rebuild EXE. Commit.
2. **C0 → C1 → C2 → C3 → C4 → C5 → C6**, una fase por commit, rebuild EXE y
   tests verdes en cada una.

## Estado de avance (actualizar al trabajar)

- [x] Parte A.1 — backlinks navegables (+ salto a línea). Filas del footer de
      menciones emiten `(Path, line_no)` → `_open_from_mention` → `open_note`
      con salto a línea. Textos del footer traducidos al español.
- [x] Parte A.2 — backlinks auto-actualizables. `note_saved` arranca un
      `QTimer` single-shot de 700 ms (`_mentions_refresh`) que llama
      `refresh_mentions()`; el índice ya se actualiza incrementalmente en
      `note_written`. Tests en `tests/test_backlinks.py` (4).
- [x] Parte A.3 — `[[wikilinks]]` del cuerpo se abren con click normal (sin
      Ctrl) en todos los modos de edición. El mixin `_WikilinkClicks`
      (`note_view.py`) ya no exige `ControlModifier` en `_follow_wikilink` /
      `_wikilink_cursor`; el modo lectura ya navegaba por anclas. El usuario
      confirmó que se refería a AMBOS (panel de menciones + wikilinks).
- [x] C0 — andamiaje `.canvas` + explorador + abrir/guardar. Hecho:
      `core/canvas_format.py` (modelo Obsidian+nv, load/dump/create_empty);
      `.canvas` es kind "canvas" en `file_kinds.py` y aparece en el árbol con
      icono propio (`file_icons.py`); paquete
      `ui/components/notes/canvas/` (`scene.py` rejilla, `items.py`
      BaseNodeItem movible/redimensionable + TextNodeItem editable en línea,
      `view.py` CanvasView con pan/zoom/crear-texto/borrar/autoguardado);
      `main_window` envuelve el centro de notas en un `QStackedWidget`
      (editor/canvas) y enruta por extensión (`_open_notes_path`);
      comando "Nuevo canvas…" en el Command Palette (`new_canvas` +
      `canvas_actions.create_canvas`); `flush()` en `closeEvent`.
      Tests: `test_canvas_format.py` (8), `test_canvas_view.py` (5).
      PENDIENTE menor: opción "Nuevo canvas" en el menú contextual del
      explorador (hoy solo por Command Palette).
- [x] C1 — nodos de nota (editar desde canvas). `NoteNodeItem` (items.py):
      cabecera = asa de arrastre + doble clic abre la nota completa; cuerpo =
      `QTextEdit` en proxy que guarda el `.md` en vivo (debounce 700 ms)
      preservando el frontmatter crudo. `CanvasView` recibe contexto
      (vault/service) via constructor y `set_context`; nodos `type=file` (.md)
      se renderizan como `NoteNodeItem`. Añadir notas: toolbar flotante
      ("＋ Nota" con selector, "＋ Texto") y **arrastrar desde el explorador**
      (el árbol ahora añade `text/uri-list` a su drag sin romper el move
      interno; el canvas acepta drops de `.md`). `open_requested` →
      `open_note_requested` → editor. Tests: `test_canvas_notes.py` (5).
      NOTA: nodos media (.png/.mp3/.mp4…) hoy caen a nodo de nota; se
      reemplazan en C2.
- [ ] C2 — texto + imagen/audio/video
- [ ] C3 — aristas/líneas
- [ ] C4 — formas de diagrama de flujo
- [ ] C5 — dibujo a mano alzada
- [ ] C6 — pulido y extras
