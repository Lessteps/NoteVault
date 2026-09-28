# Asistente: panel de chat con agente IA

Spec de referencia (adaptada al stack real de NoteVault: **Electron + React +
TypeScript**, no PySide6 — el núcleo Python se borró en el cutover `f78e8be`).
El chat se renderiza en el renderer React; el proceso main habla con el proveedor
y emite los tokens por IPC (`nv-ai-stream`).

Entregado por fases. **No se avanza a la siguiente hasta que la anterior
funcione en la app empaquetada.** Estado por fase: `PROGRESS.md`.

## 1. Layout

- Panel lateral derecho redimensionable (ancho mín 320px), tema oscuro, fondo
  ligeramente distinto al editor, bordes 1px muy sutiles, sin sombras.
- Estructura vertical: [Header] / [Lista de mensajes con scroll] / [Composer fijo abajo].
- Tipografía: sans-serif del sistema, 13px; código en monospace 12px.
- Header (~36px, iconos 16px grises, hover más claro): título de la conversación
  actual (truncado) y a la derecha: Nueva conversación (+), Historial (reloj),
  Cambios (icono diff, con badge del nº de archivos modificados), Menú ⋯
  (Personalizar, Exportar).

## 2. Mensajes

- Usuario: burbuja gris oscuro, radio 12px, padding 10-12px, ancho máx 100%.
  Con contexto adjunto, los chips van encima del texto.
- Agente: SIN burbuja, texto directo sobre el fondo, markdown completo (listas,
  tablas, código con botón copiar, negritas, links).
- Bloque de "pensamiento/trabajo" colapsable sobre la respuesta: texto gris
  pequeño "Worked for 5s ›". Colapsado por defecto; al expandir, los pasos.
- Referencias a archivos en la respuesta: chip inline (icono + nombre). Click
  abre el archivo en el editor; con rango, salta a esas líneas.
- Barra de acciones bajo cada respuesta del agente (visible al final o en
  hover): copiar, 👍, 👎.
- Streaming token a token con scroll automático, que se detiene si el usuario sube.
- Estado "escribiendo/trabajando" con indicador sutil y botón Detener.

## 3. Composer (input)

- Caja redondeada (radio 12px), fondo un tono más claro que el panel, borde sutil
  que se resalta al enfocar. Textarea que crece hasta ~8 líneas. Enter envía,
  Shift+Enter salto.
- Fila de chips de contexto ARRIBA del textarea, cada uno con "x".
  Formato del chip de selección: `nombre-archivo.md#L14-20`.
- Fila inferior: botón "+" a la izquierda, selector de modelo (nombre + chevron)
  al lado, y a la derecha micrófono (opcional, puede quedar deshabilitado) y
  botón enviar circular azul con flecha (gris/deshabilitado si el input está vacío).
- Botón "+" abre un popover "Add Context" con: Media (imágenes), Mentions
  (@archivo, @nota), Actions (comandos rápidos). Escribir "@" en el textarea abre
  el mismo buscador de menciones con autocompletado de notas del vault.

## 4. Funcionalidad clave: enviar selección al agente

- Al seleccionar texto en el editor aparece un botón flotante o atajo (Ctrl+L)
  "Añadir al chat".
- Se crea un chip de contexto con: ruta del archivo, línea inicio/fin y el texto
  exacto seleccionado.
- Al enviar, el payload incluye cada contexto como
  `{ path, start_line, end_line, text }` y el agente usa ese fragmento como
  contexto prioritario ("selección del usuario").
- Click en el chip abre el archivo y resalta el rango.
- Varias selecciones = varios chips.

## 5. Conversaciones

- Persistencia local (JSON por conversación): id, título, created_at, updated_at,
  mensajes, contextos, modelo usado.
- Historial: lista con búsqueda, agrupada por fecha (Hoy, Ayer, Semana pasada,
  Anteriores), abrir / renombrar / eliminar. Título autogenerado por el agente
  tras el primer mensaje.
- Nueva conversación: limpia el chat, conserva la anterior en el historial.

## 6. Panel de cambios (Changes) — con comentarios del agente

- Antes de que el agente modifique un archivo, snapshot del contenido original
  vinculado al turno que originó el cambio.
- Vista "Cambios": ruta, +líneas / -líneas, estado (modificado/creado/eliminado).
- Al abrir un archivo: diff verde/rojo, números de línea, unificado y lado a lado.
- DEBAJO del diff de cada archivo: comentario breve (1-3 frases) del agente
  explicando QUÉ cambió y POR QUÉ, generado en el mismo turno de la edición.
- Acciones por archivo: Aceptar, Revertir (restaura el snapshot), Abrir.
  Globales: Aceptar todo / Revertir todo.
- Exportar cambios a .md: por archivo, ruta, diff en bloque ```diff y comentario.

## 7. Exportar / Personalizar

- Exportar conversación: Markdown (por defecto) y JSON, con contextos y cambios.
- Personalizar: modelo por defecto, instrucciones del sistema, tamaño de fuente,
  densidad, tema.

## 8. Fuera de alcance

Terminal integrada, navegador integrado, voz real.

## 9. Criterios de aceptación

1. Selecciono texto en una nota, lo añado al chat, y el agente responde citando
   solo ese fragmento.
2. Cierro la app, la abro, y mi conversación sigue en el historial.
3. Le pido editar una nota: aparece en Cambios con diff correcto y comentario.
4. Revierto el cambio y el archivo vuelve exactamente a su estado original.
5. Exporto los cambios a .md y el archivo contiene diff + comentario por archivo.

## 10. Orden de implementación

- **Fase 1**: layout + mensajes + composer + streaming.
- **Fase 2**: persistencia, historial, nueva conversación.
- **Fase 3**: selección → contexto (chips + payload estructurado).
- **Fase 4**: snapshots + panel de cambios + comentarios + revertir.
- **Fase 5**: exportar, personalizar, menciones y "+".

## Notas de adaptación al stack real

- Proveedor por defecto: **DeepSeek** (`https://api.deepseek.com/v1`,
  `deepseek-flash`); los modelos se leen de `GET /models` de la cuenta y hay una
  lista curada de respaldo por proveedor (`ProviderInfo.default_models`).
- Streaming: SSE en el proceso main (`core/aiClient.streamChat`) → evento IPC
  `nv-ai-stream` → `window.nv.onAiStream` → store del panel. Cancelar =
  `ai_chat_cancel(streamId)`, que aborta el fetch y devuelve el texto parcial.
- El bloque "pensamiento/trabajo" se alimenta del `reasoning_content` que
  devuelve DeepSeek; cuando la fase de razonamiento es lo único que hay (puede
  durar decenas de segundos), se muestra abierto y con contador en vivo.
