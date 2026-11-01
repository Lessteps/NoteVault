# PROGRESS — panel de chat con agente IA

Rama `web-migration`. Los números son medidos, no estimados.

## Verificación del punto de partida (¿la API responde?)

- Key de DeepSeek localizada en `HKCU\Environment` (usuario), 35 chars, sin
  imprimirla en claro en ningún log.
- Contra `https://api.deepseek.com/v1`: `GET /models` → **200**, modelos de la
  cuenta = `deepseek-flash`, `deepseek-v4-pro`. `POST /chat/completions` → **200**
  ("OK"). `stream: true` → **200**, `content-type: text/event-stream`, deltas
  OpenAI (`choices[0].delta.content`) y además `delta.reasoning_content`.
- `~/.notevault/settings.json`: la IA estaba **sin configurar** (no existía la
  clave `ai`), así que apuntaba a LM Studio en `localhost:1234`. Se escribió el
  bloque `ai` con DeepSeek sin tocar el resto de claves.
- En la app empaquetada, con CDP: `ai_settings` → `provider: deepseek`,
  `model: deepseek-flash`, `has_key: true`, `models: [deepseek-flash,
  deepseek-v4-pro]`; `ai_test` → `{ok: true, reply: "OK"}`.

## Fase 1 — layout + mensajes + composer + streaming

Código (todo en `frontend/`):

| Archivo | Qué cambió |
|---|---|
| `src/core/aiClient.ts` | Proveedor `deepseek` (primero y por defecto), `ProviderInfo.default_models`, `streamChat()` con parser SSE (OpenAI + Anthropic) y abort que conserva el parcial |
| `src/api/modules/assistant.ts` | `ai_chat_stream(streamId, …)` que emite `nv-ai-stream`, `ai_chat_cancel(streamId)`, `models` en `ai_settings`, constructor de mensajes compartido |
| `electron/preload.ts` | `window.nv.onAiStream(cb)` |
| `src/lib/bridge.ts` | `aiChatStream`, `aiChatCancel`, `onAiStream`, tipo `AiStreamEvent` |
| `src/store/assistant.ts` | Chat con streaming: mensajes con `thinking`/`ms`/`stopped`/`error`/`contexts`, `stop()`, `vote()`, `loadModels()`, `setModel()` |
| `src/components/notes/AssistantPanel.tsx` | Panel redimensionable (mín 320), header 36px con Nueva/Historial/Cambios/⋯, mensajes (burbuja usuario, agente sin burbuja con markdown, bloque de razonamiento colapsable, acciones copiar/insertar/nota/👍/👎), composer (chips, textarea que crece a 8 líneas, "+", selector de modelo, micro deshabilitado, enviar circular / Detener) |
| `src/styles.css` | `.nv-chat-prose` (markdown a tamaño de panel) y `.nv-caret` |

Pruebas:

- `npm run typecheck` → limpio.
- `npx vitest run` → **107 archivos, 700 pasan, 1 skip**. Nuevos: 4 de streaming
  en `aiClient.test.ts` (deltas OpenAI, frame partido en dos lecturas entre
  chunks, frames Anthropic, abort que conserva lo recibido) y 3 en
  `assistant.test.ts` (DeepSeek por defecto, stream + eventos al renderer,
  cancelación con parcial + `done.stopped`).
- App empaquetada (`release/win-unpacked/NoteVault.exe`, CDP 9223), vault real
  `C:\PROGRAMMING`, ejecución final sobre app recién arrancada:
  - panel: ancho 340, header 36px, textarea, botón enviar, selector mostrando
    `deepseek-flash`, botones `Nueva conversación / Historial (Fase 2) /
    Cambios (Fase 4) / Más / Cerrar / Añadir contexto / Proveedor: DeepSeek /
    Dictado (deshabilitado) / Enviar`.
  - `ai_settings` por IPC → `provider: deepseek`, `has_key: true`, `models:
    [deepseek-flash, deepseek-v4-pro]`; `ai_test` → `{ok: true, reply: "OK"}`
    (el archivo de ajustes tenía la IA sin configurar: apuntaba a LM Studio).
  - Turno escuchando `window.nv.onAiStream`: **130 eventos**, tipos `start`,
    `thinking`, `delta`, `done`; **90 deltas** de respuesta repartidos en 428 ms
    (+38 fragmentos de razonamiento). Respuesta correcta en el panel.
  - Barra de acciones del último mensaje: `Copiar respuesta / Insertar en la
    nota / Crear nota con la respuesta / Buena respuesta / Mala respuesta`.
  - Bloque de razonamiento: se abre solo mientras es el único progreso visible
    (verificado durante el turno) y se colapsa al llegar la respuesta.
  - Detener en medio de un ensayo de 500 palabras → "Detenido por ti.", el
    parcial permanece, `done` con `stopped: true`, y vuelve el botón enviar.

Corrección derivada de la prueba real: la fase de razonamiento de DeepSeek tarda
decenas de segundos antes del primer token de respuesta (una petición medida:
55 s). El bloque de razonamiento ahora se abre solo mientras es el único progreso
visible, se auto-scrollea y muestra un contador en vivo; al llegar la respuesta
se colapsa (comportamiento del spec).

## Fase 2 — persistencia, historial, nueva conversación

Decisión tomada con el usuario: el historial es **privado**, así que vive en los
datos de la app (`~/.notevault/conversations/`), nunca dentro del vault — el vault
se sincroniza entre dispositivos con Syncthing y lo que se pregunta al tutor no
debe viajar al móvil. `AppConfig.get_conversations_dir()` es lo único que sabe
dónde está.

Código:

| Archivo | Qué añadió |
|---|---|
| `src/core/conversations.ts` | `ConversationStore`: un `.json` por conversación + `index.json` (la lista no lee los ficheros), escritura atómica vía `store.writeJson`, ids `cAAAAMMDDHHmmss-xxxxxx`, saneado de mensajes (400 mensajes, 60 k por mensaje, 8 k de razonamiento), reconstrucción del índice si falta, entradas huérfanas descartadas, fichero corrupto ignorado |
| `src/api/modules/conversations.ts` | `conversation_list/get/save/rename/delete` y `ai_title`: el título lo escribe el modelo tras el primer turno, con un presupuesto de tokens amplio y un reintento; si falla, cae a la pregunta y lo dice (`fallback: true`) |
| `src/api/appConfig.ts` | `get_conversations_dir()` |
| `src/lib/conversationDates.ts` | Agrupado puro (Hoy / Ayer / Semana pasada / Anteriores), etiqueta de hora y búsqueda sin acentos |
| `src/store/assistant.ts` | La conversación se guarda al preguntar (si cierras la app a mitad de respuesta no se pierde la pregunta) y al terminar; `newConversation`, `openConversation`, `renameConversation`, `deleteConversation`, `refreshHistory` |
| `src/components/notes/AssistantPanel.tsx` | Botón Historial activo → panel con buscador, grupos por fecha, y por fila abrir / renombrar / borrar; el header muestra el título del modelo; ⋯ añade «Renombrar conversación…» |

Pruebas: `src/core/conversations.test.ts` (11), `src/api/modules/conversations.test.ts` (11)
y `src/lib/conversationDates.test.ts` (5). Suite completa: **110 archivos, 729
tests, 1 skip**; typecheck limpio.

App empaquetada (CDP 9223), vault real:

- Pregunta real → respuesta de 1 379 chars → el modelo titula la conversación
  **«Utilidad regla de la cadena»** en **2 063 ms**; el header y la fila del
  historial lo muestran, agrupada bajo **HOY** como
  «03:34 · 2 mensajes · deepseek-flash».
- Buscador del historial: filtra por texto («cadena») y muestra «Ninguna
  conversación coincide con la búsqueda.» cuando no hay resultado.
- **Criterio 2**: app cerrada y reabierta → la conversación sigue en el historial
  (título del modelo), el chat arranca vacío como pide el spec, y al abrirla se
  restauran la pregunta del usuario y la respuesta completa (2 485 chars).
- Renombrar desde la fila (diálogo) → «Regla de la cadena (renombrada)».
- Borrar desde la fila (confirmación con el texto del aviso) → el historial queda
  en «Aún no hay conversaciones guardadas.».
- Nada se escribió dentro del vault: los ficheros están en
  `%USERPROFILE%\.notevault\conversations\`.

### Defecto encontrado y arreglado en esta fase

El título volvía vacío en la app real: DeepSeek razona antes de escribir y el
presupuesto se agotaba durante el razonamiento (`finish_reason: length`,
`content: ""`). Medido con una sonda directa contra la API para el prompt del
título: el razonamiento ocupó 243, 974 y 1 811 caracteres según la llamada, así
que **`max_tokens` 64, 300 y hasta 600 fallan de forma intermitente**. Arreglo:
presupuesto inicial de 1 500 tokens, reintento con 2 500 si vuelve vacío, entrada
recortada (1 200 chars de respuesta) y el título de la pregunta como último
recurso. Cubierto por dos tests (reintento y fallo total).

## Pendiente (por orden del spec)

- **Fase 3**: chips estructurados `{path, start_line, end_line, text}` (hoy el
  contexto de la selección viaja como el campo `selection` existente), Ctrl+L en
  el editor, click en el chip que abre el rango.
- **Fase 4**: snapshots + panel de Cambios + comentario del agente + revertir.
  Requiere dar al agente capacidad de escritura (herramientas), que hoy no tiene.
- **Fase 5**: exportar (Markdown/JSON, y cambios a `.md`), personalizar
  (fuente/densidad/tema), menciones `@`, media y acciones rápidas en el «+».

### Huecos conocidos de lo entregado

- 👍/👎 se guardan dentro de la conversación (el turno se reescribe), pero no
  alimentan ninguna métrica ni se envían a ningún sitio.
- Al abrir una conversación antigua no se reanuda el contexto de notas: el
  historial que se manda al modelo es el de mensajes, como antes.
- Borrar una conversación no la manda a ninguna papelera: el `.json` se elimina.
- El historial no se sincroniza entre equipos (a propósito).
