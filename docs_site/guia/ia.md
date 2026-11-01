# AI

NoteVault works without AI. If you turn it on, you choose where it comes from. It is configured in **Settings**.

## Providers

| Type | Options | Needs |
| :--- | :--- | :--- |
| API | DeepSeek, OpenAI, Google Gemini, Claude | Your own API key. |
| Local | LM Studio, Ollama, any other OpenAI-format server (jan.ai, llama.cpp, vLLM, LiteLLM…) | A server running on your computer. No key. |
| No API | Claude Code (your subscription), Claude web, ChatGPT web, Antigravity | Nothing in the app: NoteVault prepares a **prompt** that you paste yourself. |

The “no API” mode lets you use the AI you already pay for without giving keys to NoteVault: the app generates the prompt and stores what you bring back.

## Assistant modes

The assistant can work in Socratic mode (guides with questions), Examiner, Evaluator, Exercise generator and Debugger.

## Privacy

- NoteVault has **no servers of its own** and sends no telemetry.
- Text is only sent to a provider when you ask for it, and only to the provider you chose. With a local model, nothing leaves your computer.
- API keys are stored in `~/.notevault/settings.json`, **outside the vault**, in plain text. Protect that folder like any file with credentials and do not upload it to a repository.
