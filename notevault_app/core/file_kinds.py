"""
What the notes explorer shows, and how each kind of file is labelled.

Markdown files are notes. Source files in any language are listed too, with
their own icon, and open in a plain code view rather than the rich editor,
which would reformat them.
"""

from pathlib import Path

NOTE_EXTS = {".md"}

# extension -> (badge text, badge colour); colours follow each language's
# usual brand colour so a file is recognisable at a glance.
CODE_EXTS = {
    ".py": ("PY", "#3776ab"), ".pyw": ("PY", "#3776ab"),
    ".js": ("JS", "#d4b106"), ".mjs": ("JS", "#d4b106"), ".cjs": ("JS", "#d4b106"),
    ".jsx": ("JSX", "#1f9fc2"), ".ts": ("TS", "#3178c6"), ".tsx": ("TSX", "#3178c6"),
    ".java": ("JV", "#b07219"), ".kt": ("KT", "#a97bff"), ".kts": ("KT", "#a97bff"),
    ".go": ("GO", "#00add8"), ".rs": ("RS", "#b7410e"),
    ".c": ("C", "#5c6bc0"), ".h": ("H", "#5c6bc0"),
    ".cpp": ("C++", "#f34b7d"), ".cc": ("C++", "#f34b7d"), ".hpp": ("H++", "#f34b7d"),
    ".cs": ("C#", "#178600"), ".rb": ("RB", "#cc342d"), ".php": ("PHP", "#777bb4"),
    ".swift": ("SW", "#f05138"), ".dart": ("DT", "#00b4ab"), ".lua": ("LUA", "#000080"),
    ".r": ("R", "#198ce7"), ".scala": ("SC", "#c22d40"), ".pl": ("PL", "#0298c3"),
    ".sh": ("SH", "#4eaa25"), ".bash": ("SH", "#4eaa25"), ".zsh": ("SH", "#4eaa25"),
    ".ps1": ("PS", "#2671be"), ".bat": ("BAT", "#6b6b74"), ".cmd": ("CMD", "#6b6b74"),
    ".sql": ("SQL", "#e38c00"), ".vb": ("VB", "#945db7"),
}


def kind_for(path) -> str:
    """'note', 'code' or '' for files the explorer does not list."""
    ext = Path(str(path)).suffix.lower()
    if ext in NOTE_EXTS:
        return "note"
    if ext in CODE_EXTS:
        return "code"
    return ""


def badge_for(path):
    return CODE_EXTS.get(Path(str(path)).suffix.lower(), ("TXT", "#6b6b74"))
