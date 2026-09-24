"""
NoteVault AI client.

Two families of providers:

  Conectados  - the app talks to a model over HTTP.
                · LM Studio / Ollama / any OpenAI-compatible local server:
                  no API key, nothing leaves the machine.
                · OpenAI or Anthropic proper, when an API key is supplied.

  Puente      - no API at all. The app builds the full prompt (question plus
                the note in context), copies it to the clipboard and opens
                Claude, ChatGPT or Antigravity. The answer is pasted back and
                inserted into the note. Slower, but needs no key and no server.

Requests use only the standard library so the frozen .exe stays dependency
free, and always run on a worker thread so the UI never blocks.
"""

import json
import urllib.error
import urllib.request
from dataclasses import dataclass, field


# ── Provider catalogue ─────────────────────────────────────────────────────

LM_STUDIO = "lmstudio"
OLLAMA    = "ollama"
OPENAI_COMPATIBLE = "openai_compatible"
OPENAI    = "openai"
ANTHROPIC = "anthropic"
BRIDGE_CLAUDE      = "bridge_claude"
BRIDGE_CHATGPT     = "bridge_chatgpt"
BRIDGE_ANTIGRAVITY = "bridge_antigravity"

BRIDGE_PROVIDERS = {BRIDGE_CLAUDE, BRIDGE_CHATGPT, BRIDGE_ANTIGRAVITY}

BRIDGE_URLS = {
    BRIDGE_CLAUDE: "https://claude.ai/new",
    BRIDGE_CHATGPT: "https://chatgpt.com/",
    BRIDGE_ANTIGRAVITY: "https://antigravity.google/",
}


@dataclass
class ProviderInfo:
    key: str
    label: str
    hint: str
    needs_key: bool = False
    needs_url: bool = False
    default_url: str = ""
    default_model: str = ""
    bridge: bool = False


PROVIDERS = [
    ProviderInfo(
        LM_STUDIO, "LM Studio (local)",
        "Servidor local de LM Studio. Sin API key: arranca el servidor en "
        "LM Studio (pestaña Developer → Start Server).",
        needs_url=True, default_url="http://localhost:1234/v1",
        default_model="local-model",
    ),
    ProviderInfo(
        OLLAMA, "Ollama (local)",
        "Servidor local de Ollama. Sin API key: ejecuta `ollama serve`.",
        needs_url=True, default_url="http://localhost:11434/v1",
        default_model="llama3.1",
    ),
    ProviderInfo(
        OPENAI_COMPATIBLE, "Otro servidor compatible",
        "Cualquier endpoint que hable el formato OpenAI "
        "(jan.ai, llama.cpp, vLLM, LiteLLM...).",
        needs_url=True, default_url="http://localhost:8000/v1",
        default_model="local-model",
    ),
    ProviderInfo(
        OPENAI, "OpenAI (API key)",
        "API oficial de OpenAI. Requiere una clave que empieza por sk-...",
        needs_key=True, needs_url=True, default_url="https://api.openai.com/v1",
        default_model="gpt-4o-mini",
    ),
    ProviderInfo(
        ANTHROPIC, "Claude (API key)",
        "API oficial de Anthropic. Requiere una clave sk-ant-...",
        needs_key=True, needs_url=True,
        default_url="https://api.anthropic.com/v1",
        default_model="claude-sonnet-4-6",
    ),
    ProviderInfo(
        BRIDGE_CLAUDE, "Claude web (sin API)",
        "Copia la pregunta con el contexto de la nota y abre claude.ai. "
        "Pega la respuesta de vuelta en el panel.",
        bridge=True,
    ),
    ProviderInfo(
        BRIDGE_CHATGPT, "ChatGPT web (sin API)",
        "Copia la pregunta con el contexto de la nota y abre chatgpt.com. "
        "Pega la respuesta de vuelta en el panel.",
        bridge=True,
    ),
    ProviderInfo(
        BRIDGE_ANTIGRAVITY, "Antigravity (sin API)",
        "Copia la pregunta con el contexto de la nota y abre Antigravity. "
        "Pega la respuesta de vuelta en el panel.",
        bridge=True,
    ),
]

PROVIDER_BY_KEY = {p.key: p for p in PROVIDERS}

SYSTEM_PROMPT = (
    "Eres el asistente de estudio y aprendizaje de NoteVault, una app de notas en "
    "markdown. Respondes en español salvo que te pidan otro idioma. "
    "Cuando generes contenido para una nota devuelve markdown limpio: "
    "títulos con #, listas con -, negrita con **. No expliques lo que vas "
    "a hacer, entrega directamente el contenido."
)

AI_MODES = {
    "tutor": "Modo Tutor: Explica con claridad pedagógica y sin jerga innecesaria. Prioriza la comprensión profunda.",
    "socratic": "Modo Socrático: No des la respuesta directa inmediatamente. Guía mediante preguntas reflexivas y pistas progresivas para que el estudiante descubra la solución.",
    "examiner": "Modo Examinador: Evalúa el conocimiento formulando preguntas rigurosas, desafiando supuestos y calificando la precisión de las respuestas.",
    "evaluator": "Modo Evaluador: Analiza detalladamente el trabajo o respuesta entregada. Clasifica errores, evalúa criterios y proporciona retroalimentación constructiva.",
    "generator": "Modo Generador: Crea ejercicios y problemas estructurados con restricciones estrictas de nivel, tema y objetivos formativos.",
    "debugger": "Modo Depurador: Analiza fallos de código o razonamiento paso a paso, ayudando a aislar la causa raíz y verificar la corrección.",
}


@dataclass
class AIConfig:
    provider: str = LM_STUDIO
    base_url: str = "http://localhost:1234/v1"
    model: str = "local-model"
    api_key: str = ""
    temperature: float = 0.7
    max_tokens: int = 1500
    include_note: bool = True

    @property
    def info(self) -> ProviderInfo:
        return PROVIDER_BY_KEY.get(self.provider, PROVIDERS[0])

    @property
    def is_bridge(self) -> bool:
        return self.provider in BRIDGE_PROVIDERS

    def to_dict(self) -> dict:
        return {
            "provider": self.provider, "base_url": self.base_url,
            "model": self.model, "api_key": self.api_key,
            "temperature": self.temperature, "max_tokens": self.max_tokens,
            "include_note": self.include_note,
        }

    @staticmethod
    def from_dict(d: dict) -> "AIConfig":
        cfg = AIConfig()
        if not isinstance(d, dict):
            return cfg
        for k, v in d.items():
            if hasattr(cfg, k):
                setattr(cfg, k, v)
        return cfg


class AIError(Exception):
    pass


# ── Transport ──────────────────────────────────────────────────────────────

def _post_json(url: str, payload: dict, headers: dict, timeout: int = 120) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:400]
        raise AIError(f"HTTP {e.code}: {body}") from e
    except urllib.error.URLError as e:
        raise AIError(
            f"No se pudo conectar con {url}.\n{e.reason}\n\n"
            "Si usas LM Studio u Ollama, comprueba que el servidor local "
            "esté encendido."
        ) from e
    except TimeoutError as e:
        raise AIError("La petición tardó demasiado y se canceló.") from e


def _chat_openai_style(cfg: AIConfig, messages: list) -> str:
    url = cfg.base_url.rstrip("/") + "/chat/completions"
    headers = {}
    if cfg.api_key:
        headers["Authorization"] = f"Bearer {cfg.api_key}"
    payload = {
        "model": cfg.model,
        "messages": messages,
        "temperature": cfg.temperature,
        "max_tokens": cfg.max_tokens,
        "stream": False,
    }
    data = _post_json(url, payload, headers)
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise AIError(f"Respuesta inesperada del servidor:\n{str(data)[:400]}")


def _chat_anthropic(cfg: AIConfig, messages: list) -> str:
    url = cfg.base_url.rstrip("/") + "/messages"
    if not cfg.api_key:
        raise AIError("Falta la API key de Anthropic.")
    headers = {
        "x-api-key": cfg.api_key,
        "anthropic-version": "2023-06-01",
    }
    system = "\n".join(m["content"] for m in messages if m["role"] == "system")
    convo = [m for m in messages if m["role"] != "system"]
    payload = {
        "model": cfg.model,
        "system": system,
        "messages": convo,
        "max_tokens": cfg.max_tokens,
        "temperature": cfg.temperature,
    }
    data = _post_json(url, payload, headers)
    try:
        parts = data["content"]
        return "".join(p.get("text", "") for p in parts)
    except (KeyError, TypeError):
        raise AIError(f"Respuesta inesperada de Anthropic:\n{str(data)[:400]}")


def send_chat(cfg: AIConfig, messages: list) -> str:
    """Blocking call. Use AIWorker from the UI."""
    if cfg.is_bridge:
        raise AIError(
            "Este proveedor funciona en modo puente: copia el prompt y "
            "pega la respuesta manualmente."
        )
    if cfg.provider == ANTHROPIC:
        return _chat_anthropic(cfg, messages)
    return _chat_openai_style(cfg, messages)


def list_models(cfg: AIConfig) -> list:
    """Ask an OpenAI-compatible server which models it has loaded."""
    if cfg.is_bridge or cfg.provider == ANTHROPIC:
        return []
    url = cfg.base_url.rstrip("/") + "/models"
    req = urllib.request.Request(url)
    if cfg.api_key:
        req.add_header("Authorization", f"Bearer {cfg.api_key}")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception as e:
        raise AIError(str(e))
    out = []
    for item in data.get("data", []):
        mid = item.get("id")
        if mid:
            out.append(mid)
    return sorted(out)


# ── Prompt building ────────────────────────────────────────────────────────

def build_messages(cfg: AIConfig, history: list, question: str,
                   note_title: str = "", note_body: str = "",
                   selection: str = "", mode: str = "tutor",
                   workspace_prompt: str = "") -> list:
    """history is a list of {'role','content'} already exchanged."""
    sys_content = SYSTEM_PROMPT
    if workspace_prompt:
        sys_content += f"\n\nContexto de disciplina:\n{workspace_prompt}"
    if mode in AI_MODES:
        sys_content += f"\n\nDirectiva de modo activo:\n{AI_MODES[mode]}"

    messages = [{"role": "system", "content": sys_content}]

    context = ""
    if cfg.include_note and (note_title or note_body):
        body = note_body.strip()
        if len(body) > 12000:
            body = body[:12000] + "\n\n[...nota recortada...]"
        context = f"Nota abierta: «{note_title}»\n\n```markdown\n{body}\n```"
    if selection.strip():
        context += f"\n\nFragmento seleccionado:\n```\n{selection.strip()}\n```"
    if context:
        messages.append({
            "role": "system",
            "content": "Contexto de la app:\n" + context,
        })

    messages.extend(history)
    messages.append({"role": "user", "content": question})
    return messages


def build_bridge_prompt(messages: list) -> str:
    """Flatten the conversation into one block for the clipboard."""
    parts = []
    for m in messages:
        if m["role"] == "system":
            parts.append(m["content"])
        elif m["role"] == "user":
            parts.append(f"[Usuario]\n{m['content']}")
        else:
            parts.append(f"[Asistente]\n{m['content']}")
    return "\n\n---\n\n".join(parts)
