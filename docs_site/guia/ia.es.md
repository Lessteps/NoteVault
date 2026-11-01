# IA

NoteVault funciona sin IA. Si la activas, tú eliges de dónde viene. Se configura en **Ajustes**.

## Proveedores

| Tipo | Opciones | Necesita |
| :--- | :--- | :--- |
| API | DeepSeek, OpenAI, Google Gemini, Claude | Tu propia clave de API. |
| Local | LM Studio, Ollama, otro servidor compatible con el formato OpenAI (jan.ai, llama.cpp, vLLM, LiteLLM…) | Un servidor corriendo en tu equipo. Sin clave. |
| Sin API | Claude Code (tu suscripción), Claude web, ChatGPT web, Antigravity | Nada en la app: NoteVault te prepara un **prompt** que pegas tú. |

El modo «sin API» sirve para usar la IA que ya pagas sin dar claves a NoteVault: la app genera el prompt y guarda lo que devuelves.

## Modos del asistente

El asistente puede trabajar en modo Socrático (guía con preguntas), Examinador, Evaluador, Generador de ejercicios y Depurador.

## Privacidad

- NoteVault **no tiene servidores propios** ni envía telemetría.
- Solo se envía texto a un proveedor cuando tú lo pides, y solo al proveedor que elegiste. Con un modelo local, nada sale de tu equipo.
- Las claves de API se guardan en `~/.notevault/settings.json`, **fuera de la bóveda**, en texto plano. Protege esa carpeta como protegerías cualquier archivo con credenciales y no la subas a un repositorio.
