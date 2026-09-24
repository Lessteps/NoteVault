/**
 * Markdown utilities for NoteVault: render markdown to HTML, extract headings,
 * count words. Ported from notevault_app/core/markdown_utils.py.
 */

import * as path from "node:path";

export function inline(text: string): string {
  // Escape HTML
  let out = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Bold + italic
  out = out.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__(.+?)__/g, "<strong>$1</strong>");
  out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
  out = out.replace(/_(.+?)_/g, "<em>$1</em>");

  // Strikethrough
  out = out.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Inline code
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Wikilinks [[Title]] or [[Title|Alias]]
  out = out.replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, targetRaw, aliasRaw) => {
    const target = (targetRaw ?? "").trim();
    let alias = aliasRaw;
    if (!alias) {
      const clean = target.split("#")[0]!.trim();
      alias = clean.includes("/") || clean.includes("\\") ? path.basename(clean) : clean;
    }
    return `<a href="nv://note/${target}" style="color:#7c5af0;">${alias}</a>`;
  });

  // External links [label](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Highlight ==text==
  out = out.replace(/==(.+?)==/g, '<mark style="background:#7c5af030;">$1</mark>');

  // Inline tags #tag
  out = out.replace(
    /(?<!\S)#([\w/-]+)/g,
    '<span style="color:#58a6ff;font-size:0.9em;">#$1</span>',
  );

  return out;
}

export function toHtml(markdown: string, _vaultManager?: unknown): string {
  const lines = (markdown ?? "").split("\n");
  const htmlParts: string[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let inTable = false;
  let tableLines: string[] = [];
  let listBuffer: string[] = [];
  let listType: "ul" | "ol" | null = null;

  function flushList() {
    if (listBuffer.length) {
      const tag = listType || "ul";
      htmlParts.push(`<${tag}>`);
      for (const item of listBuffer) {
        htmlParts.push(item);
      }
      htmlParts.push(`</${tag}>`);
      listBuffer = [];
      listType = null;
    }
  }

  function flushTable() {
    if (tableLines.length) {
      htmlParts.push("<table>");
      let headerDone = false;
      for (const row of tableLines) {
        if (/^\|[-: |]+\|$/.test(row)) continue;
        const cells = row
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
        if (!headerDone) {
          htmlParts.push(
            "<thead><tr>" + cells.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>",
          );
          headerDone = true;
        } else {
          htmlParts.push("<tr>" + cells.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>");
        }
      }
      if (headerDone) {
        htmlParts.push("</tbody>");
      }
      htmlParts.push("</table>");
    }
    tableLines = [];
    inTable = false;
  }

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        htmlParts.push(
          "<pre><code>" +
            codeLines
              .map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
              .join("\n") +
            "</code></pre>",
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        flushList();
        flushTable();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (line.startsWith("|")) {
      flushList();
      inTable = true;
      tableLines.push(line);
      continue;
    } else if (inTable) {
      flushTable();
    }

    if (!line.trim()) {
      flushList();
      htmlParts.push("<br>");
      continue;
    }

    // Headings
    const hm = /^(#{1,6})\s+(.+)/.exec(line);
    if (hm) {
      flushList();
      const level = hm[1]!.length;
      const text = inline(hm[2]!);
      const anchor = hm[2]!.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
      htmlParts.push(`<h${level} id="${anchor}">${text}</h${level}>`);
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      flushList();
      htmlParts.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
      continue;
    }

    // HR
    if (/^[-*_]{3,}$/.test(line.trim())) {
      flushList();
      htmlParts.push("<hr>");
      continue;
    }

    // Checkbox list item
    const cm = /^(\s*)- \[(x| )\] (.+)/i.exec(line);
    if (cm) {
      const checked = cm[2]!.toLowerCase() === "x";
      const icon = checked ? "&#9989;" : "&#9744;";
      const style = checked ? ' style="text-decoration: line-through; color: #666672;"' : "";
      listBuffer.push(`<li${style}>${icon} ${inline(cm[3]!)}</li>`);
      listType = "ul";
      continue;
    }

    // Unordered list
    const um = /^(\s*)[-*+] (.+)/.exec(line);
    if (um) {
      listBuffer.push(`<li>${inline(um[2]!)}</li>`);
      listType = "ul";
      continue;
    }

    // Ordered list
    const om = /^(\s*)\d+\. (.+)/.exec(line);
    if (om) {
      listBuffer.push(`<li>${inline(om[2]!)}</li>`);
      listType = "ol";
      continue;
    }

    // Paragraph
    flushList();
    htmlParts.push(`<p>${inline(line)}</p>`);
  }

  flushList();
  flushTable();

  return htmlParts.join("\n");
}

export interface HeadingItem {
  level: number;
  text: string;
  anchor: string;
}

export function extractHeadings(markdown: string): HeadingItem[] {
  const headings: HeadingItem[] = [];
  let inCode = false;
  for (const line of (markdown ?? "").split("\n")) {
    if (line.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;

    const m = /^(#{1,6})\s+(.+)/.exec(line);
    if (m) {
      const level = m[1]!.length;
      const text = m[2]!.trim();
      const anchor = text.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
      headings.push({ level, text, anchor });
    }
  }
  return headings;
}

export function countWords(markdown: string): number {
  let text = (markdown ?? "").replace(/```[\s\S]*?```/g, "");
  text = text.replace(/`[^`]+`/g, "");
  text = text.replace(/#+\s/g, "");
  text = text.replace(/[*_~\[\]#|`>]/g, "");
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
}
