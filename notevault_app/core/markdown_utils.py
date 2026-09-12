"""
NoteVault Markdown Utilities
Render markdown to HTML for the preview pane using QTextBrowser.
"""

import re


def to_html(markdown: str, vault_manager=None) -> str:
    """Convert markdown to HTML string for QTextBrowser display."""
    lines = markdown.split("\n")
    html_parts = []
    in_code_block = False
    code_lines = []
    in_table = False
    table_lines = []
    list_buffer = []
    list_type = None  # 'ul' or 'ol'

    def flush_list():
        nonlocal list_buffer, list_type
        if list_buffer:
            tag = list_type or "ul"
            html_parts.append(f"<{tag}>")
            for item in list_buffer:
                html_parts.append(item)
            html_parts.append(f"</{tag}>")
            list_buffer = []
            list_type = None

    def flush_table():
        nonlocal table_lines, in_table
        if table_lines:
            html_parts.append("<table>")
            header_done = False
            for row in table_lines:
                if re.match(r"^\|[-: |]+\|$", row):
                    continue
                cells = [c.strip() for c in row.strip("|").split("|")]
                if not header_done:
                    html_parts.append("<thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in cells) + "</tr></thead><tbody>")
                    header_done = True
                else:
                    html_parts.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in cells) + "</tr>")
            if header_done:
                html_parts.append("</tbody>")
            html_parts.append("</table>")
        table_lines = []
        in_table = False

    for line in lines:
        # Code blocks
        if line.startswith("```"):
            if in_code_block:
                html_parts.append("<pre><code>" + "\n".join(
                    l.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                    for l in code_lines
                ) + "</code></pre>")
                code_lines = []
                in_code_block = False
            else:
                flush_list()
                flush_table()
                in_code_block = True
            continue

        if in_code_block:
            code_lines.append(line)
            continue

        # Tables
        if line.startswith("|"):
            flush_list()
            in_table = True
            table_lines.append(line)
            continue
        elif in_table:
            flush_table()

        # Blank line
        if not line.strip():
            flush_list()
            html_parts.append("<br>")
            continue

        # Headings
        hm = re.match(r"^(#{1,6})\s+(.+)", line)
        if hm:
            flush_list()
            level = len(hm.group(1))
            text = inline(hm.group(2))
            anchor = re.sub(r"[^\w-]", "", hm.group(2).lower().replace(" ", "-"))
            html_parts.append(f'<h{level} id="{anchor}">{text}</h{level}>')
            continue

        # Blockquote
        if line.startswith("> "):
            flush_list()
            html_parts.append(f"<blockquote>{inline(line[2:])}</blockquote>")
            continue

        # HR
        if re.match(r"^[-*_]{3,}$", line.strip()):
            flush_list()
            html_parts.append("<hr>")
            continue

        # Checkbox list item
        cm = re.match(r"^(\s*)- \[(x| )\] (.+)", line, re.IGNORECASE)
        if cm:
            checked = cm.group(2).lower() == "x"
            icon = "&#9989;" if checked else "&#9744;"
            style = "text-decoration: line-through; color: #666672;" if checked else ""
            list_buffer.append(f'<li style="{style}">{icon} {inline(cm.group(3))}</li>')
            list_type = "ul"
            continue

        # Unordered list
        um = re.match(r"^(\s*)[-*+] (.+)", line)
        if um:
            list_buffer.append(f"<li>{inline(um.group(2))}</li>")
            list_type = "ul"
            continue

        # Ordered list
        om = re.match(r"^(\s*)\d+\. (.+)", line)
        if om:
            list_buffer.append(f"<li>{inline(om.group(2))}</li>")
            list_type = "ol"
            continue

        # Paragraph
        flush_list()
        html_parts.append(f"<p>{inline(line)}</p>")

    flush_list()
    flush_table()

    return "\n".join(html_parts)


def inline(text: str) -> str:
    """Apply inline markdown formatting."""
    # Escape HTML
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    # Bold + italic
    text = re.sub(r"\*\*\*(.+?)\*\*\*", r"<strong><em>\1</em></strong>", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"__(.+?)__", r"<strong>\1</strong>", text)
    text = re.sub(r"\*(.+?)\*", r"<em>\1</em>", text)
    text = re.sub(r"_(.+?)_", r"<em>\1</em>", text)

    # Strikethrough
    text = re.sub(r"~~(.+?)~~", r"<del>\1</del>", text)

    # Inline code
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)

    # Wikilinks [[Title]] or [[Title|Alias]]
    def wikilink(m):
        target = m.group(1)
        alias = m.group(2) or target
        return f'<a href="nv://note/{target}" style="color:#7c5af0;">{alias}</a>'

    text = re.sub(r"\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]", wikilink, text)

    # External links
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)

    # Highlight ==text==
    text = re.sub(r"==(.+?)==", r'<mark style="background:#7c5af030;">\1</mark>', text)

    # Inline tags #tag
    text = re.sub(
        r'(?<!\S)#([\w/-]+)',
        r'<span style="color:#58a6ff;font-size:0.9em;">#\1</span>',
        text
    )

    return text


def extract_headings(markdown: str) -> list[dict]:
    """Return list of {level, text, anchor} dicts for the outline."""
    headings = []
    in_code = False
    for line in markdown.split("\n"):
        if line.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        m = re.match(r"^(#{1,6})\s+(.+)", line)
        if m:
            level = len(m.group(1))
            text = m.group(2).strip()
            anchor = re.sub(r"[^\w-]", "", text.lower().replace(" ", "-"))
            headings.append({"level": level, "text": text, "anchor": anchor})
    return headings


def count_words(markdown: str) -> int:
    text = re.sub(r"```[\s\S]*?```", "", markdown)
    text = re.sub(r"`[^`]+`", "", text)
    text = re.sub(r"#+\s", "", text)
    text = re.sub(r"[*_~\[\]#|`>]", "", text)
    return len(text.split()) if text.strip() else 0
