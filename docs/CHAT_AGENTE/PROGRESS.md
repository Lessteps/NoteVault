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

## Pendiente (por orden del spec)

- **Fase 2**: persistencia de conversaciones, historial con búsqueda y agrupación,
  título autogenerado, nueva conversación que conserva la anterior. Los botones
  Historial/Cambios están visibles pero deshabilitados, con aviso de fase.
- **Fase 3**: chips estructurados `{path, start_line, end_line, text}` (hoy el
  contexto viaja como el campo `selection` existente), Ctrl+L en el editor,
  click en el chip que abre el rango.
- **Fase 4**: snapshots + panel de Cambios + comentario del agente + revertir.
  Requiere dar al agente capacidad de escritura (herramientas), que hoy no tiene.
- **Fase 5**: exportar, personalizar (fuente/densidad/tema), menciones `@`, "+".

### Huecos conocidos de lo entregado

- 👍/👎 solo cambian el estado local del mensaje: no se guardan en ningún sitio.
- El título de la conversación se deriva del primer mensaje del usuario; el
  autogenerado por el agente es de Fase 2.
- El botón "+" abre el popover, pero solo "Selección del editor" hace algo; el
  resto avisa "Fase 5".
- El historial no se conserva: cerrar la app pierde la conversación (es Fase 2).
