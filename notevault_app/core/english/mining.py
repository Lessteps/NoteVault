"""Sentence mining: turn a subtitle line into an English practice note (§5.1)."""

import re
import unicodedata
from datetime import datetime
from pathlib import Path

from .media_links import format_timestamp, media_link

MINING_FOLDER = ("Inglés", "Minería")
MINING_MODES = ("translate", "cloze")
CEFR_LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2")
BLANK = "_____"


class MiningError(ValueError):
    pass


def slugify(text: str, limit: int = 40) -> str:
    plain = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")
    return slug[:limit].strip("-") or "media"


def _quoted(value: str) -> str:
    return '"' + " ".join(str(value).split()).replace('"', "'") + '"'


def blank_out(sentence: str, target: str) -> str:
    target = " ".join((target or "").split())
    if not target:
        raise MiningError("Escribe la palabra o expresión que quieres ocultar.")
    pattern = re.compile(r"(?<!\w)" + re.escape(target).replace(r"\ ", r"\s+") + r"(?!\w)", re.I)
    blanked, count = pattern.subn(BLANK, sentence, count=1)
    if not count:
        raise MiningError(f"«{target}» no aparece en la frase.")
    return blanked


def mined_note_id(media_rel: str, seconds: float) -> str:
    return f"en.mining.{slugify(Path(media_rel).stem)}.{int(round(seconds * 1000))}"


def build_mined_note(sentence: str, *, media_rel: str, seconds: float, mode: str = "translate",
                     target: str = "", level: str = "B1", reference_es: str = "") -> str:
    sentence = " ".join((sentence or "").split())
    if not sentence:
        raise MiningError("La frase está vacía.")
    mode = mode if mode in MINING_MODES else "translate"
    level = level.upper() if level and level.upper() in CEFR_LEVELS else "B1"
    link = media_link(media_rel, seconds)
    source = Path(media_rel).name
    title = sentence if len(sentence) <= 70 else sentence[:67].rstrip() + "…"
    stamp = format_timestamp(seconds)

    front = [
        "---",
        f"id: {mined_note_id(media_rel, seconds)}",
        f"title: {_quoted(title)}",
        "subject: english",
        "type: exercise",
        "discipline: english_vocabulary",
        f"mode: {mode}",
        f"level: {level}",
        "difficulty: 2",
        "assistance: helper",
        f"source: {_quoted(media_rel)}",
        f"timestamp: {_quoted(stamp)}",
        "status: draft",
        f"created: {datetime.now().strftime('%Y-%m-%d')}",
        "---",
        "",
        f"# {title}",
        "",
        "## Enunciado",
        f"Frase escuchada en {link} de *{source}*.",
        "",
    ]
    if mode == "cloze":
        blanked = blank_out(sentence, target)
        front += [
            f"> {blanked}",
            "",
            "Escribe la palabra o expresión que falta, tal como se dice en el video. "
            "Después explica en una frase qué significa en este contexto.",
        ]
        hints = [
            f"Vuelve a escuchar el fragmento: {link}",
            f"Empieza por «{target.strip()[0]}» y tiene {len(target.strip())} caracteres.",
        ]
        solution = [f"**{target.strip()}** — {sentence}"]
        rubric = [
            "Escribe exactamente la palabra o expresión que falta (ortografía incluida).",
            "La forma encaja en la frase (tiempo verbal, número, partícula).",
            "Explica el significado en este contexto, no solo una traducción de diccionario.",
        ]
    else:
        front += [
            f"> {sentence}",
            "",
            "Tradúcela al español con naturalidad, como lo diría alguien en esa situación. "
            "Después di qué palabra o estructura te costó entender al oírla.",
        ]
        hints = [
            f"Vuelve a escuchar el fragmento: {link}",
            "Traduce el sentido de la frase completa, no palabra por palabra.",
        ]
        solution = [f"**Frase original:** {sentence}"]
        rubric = [
            "Conserva el significado completo de la frase original.",
            "Suena natural en español (sin calcos del inglés).",
            "Respeta el registro y el tono de la escena.",
        ]
    if reference_es:
        solution += ["", f"**Subtítulo en español (referencia):** {' '.join(reference_es.split())}"]
    solution += ["", "**Traducción:** "]

    lines = front + ["", "## Pistas"]
    lines += [f"- {h}" for h in hints]
    lines += ["", "## Solución"] + solution
    lines += ["", "## Rúbrica"] + [f"- [ ] (1) {r}" for r in rubric]
    lines += [
        "", "## Errores típicos",
        "- **vocabulary:** traducir palabra por palabra y perder el sentido idiomático.",
        "- **listening:** confundir palabras que suenan parecido en habla rápida.",
        "",
    ]
    return "\n".join(lines)


def mining_folder(vault_root: Path) -> Path:
    return Path(vault_root).joinpath(*MINING_FOLDER)


def mined_note_path(vault_root: Path, sentence: str, seconds: float) -> Path:
    folder = mining_folder(vault_root)
    words = re.sub(r'[\\/:*?"<>|\n\r\t]+', " ", " ".join(sentence.split()[:7])).strip(" .")
    base = f"EN-MIN {format_timestamp(seconds).replace(':', '-')} {words}".strip()[:90].rstrip(" .")
    path = folder / f"{base}.md"
    n = 2
    while path.exists():
        path = folder / f"{base} ({n}).md"
        n += 1
    return path


def write_mined_note(vault_root: Path, sentence: str, **kwargs) -> Path:
    text = build_mined_note(sentence, **kwargs)
    path = mined_note_path(vault_root, sentence, kwargs.get("seconds", 0.0))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path
