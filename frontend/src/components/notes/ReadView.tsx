import { Braces } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef } from "react";
import { api } from "../../lib/bridge";
import { parseMediaUrl } from "../../lib/player";
import { usePlayer } from "../../store/player";
import { escapeHtml, renderMarkdown, toggleTaskAt } from "../../lib/markdown";
import type { Frontmatter } from "../../lib/types";
import { bodyOf, useApp, type OpenNote } from "../../store/app";
import { confirmAction } from "../ui";

// ── Frontmatter card ─────────────────────────────────────────────────────

function valueText(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join(", ");
  if (v && typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function FrontmatterCard({ fm }: { fm: Frontmatter }) {
  const entries = Object.entries(fm).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && !v.length));
  if (!entries.length) return null;
  return (
    <section className="mx-auto mb-8 max-w-[820px] rounded-xl border border-line bg-card px-5 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Braces size={14} className="text-accent-text" />
        <span className="font-mono text-[12px] font-semibold text-text">frontmatter :: metadata</span>
        <span className="ml-auto font-mono text-[10.5px] text-faint">YAML Block</span>
      </div>
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-8 gap-y-2">
        {entries.slice(0, 12).map(([k, v]) => (
          <div key={k} className="flex min-w-0 items-baseline gap-3">
            <dt className="flex-none font-mono text-[11.5px] text-faint">{k}:</dt>
            <dd className="min-w-0 truncate text-[12.5px]">
              {k.toLowerCase() === "status" ? (
                <span className="rounded border border-mint/40 bg-mint-soft px-2 py-px font-mono text-[11px] font-semibold text-mint">
                  {valueText(v)}
                </span>
              ) : k.toLowerCase() === "tags" ? (
                <span className="font-mono text-[11.5px] text-accent-text">
                  {(Array.isArray(v) ? v : String(v).split(/[,\s]+/)).filter(Boolean)
                    .map((t) => `#${String(t).replace(/^#/, "")}`).join("  ")}
                </span>
              ) : (
                <span className="text-text">{valueText(v)}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ── Link / embed helpers ─────────────────────────────────────────────────

export async function followWikilink(target: string): Promise<void> {
  const s = useApp.getState();
  try {
    const { path } = await api.resolveLink(target);
    if (path) {
      await s.openNote(path);
      return;
    }
    const name = target.split("#")[0]!.split("/").pop()!.trim();
    const create = await confirmAction(
      "La nota no existe",
      `No hay ninguna nota llamada «${name}». ¿Crearla ahora?`,
      "Crear nota",
    );
    if (!create) return;
    const created = await api.createNote(name, "");
    s.refreshTree();
    await s.openNote(created.path);
  } catch (e) {
    s.toast("error", (e as Error).message);
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function resolveRelative(notePath: string, href: string): string {
  const base = notePath.split("/").slice(0, -1);
  for (const part of decodeURI(href.split("#")[0]!).split("/")) {
    if (part === "..") base.pop();
    else if (part && part !== ".") base.push(part);
  }
  return base.join("/");
}

/** Fill <img data-embed> and ![[note]] embeds once the HTML is in place. */
function hydrate(root: HTMLElement, notePath: string, depth: number) {
  root.querySelectorAll<HTMLImageElement>("img[data-embed]").forEach((img) => {
    const name = img.dataset.embed!;
    img.removeAttribute("data-embed");
    api.readAttachment(notePath, name)
      .then(({ data_url }) => {
        img.src = data_url;
      })
      .catch(() => {
        const miss = document.createElement("span");
        miss.className = "embed-missing";
        miss.textContent = `Imagen no encontrada: ${name}`;
        img.replaceWith(miss);
      });
  });
  root.querySelectorAll<HTMLElement>("[data-note-embed]").forEach((box) => {
    const target = box.dataset.noteEmbed!;
    box.removeAttribute("data-note-embed");
    if (depth >= 1) {
      box.innerHTML = `<a class="wikilink" data-target="${escapeHtml(target)}">↳ ${escapeHtml(target)}</a>`;
      return;
    }
    box.className = "callout";
    box.setAttribute("data-callout", "quote");
    api.resolveLink(target)
      .then(({ path }) => (path ? api.readNote(path) : Promise.reject(new Error("missing"))))
      .then((n) => {
        box.innerHTML =
          `<div class="callout-title"><span>${escapeHtml(n.title)}</span></div>` +
          `<div class="callout-body">${renderMarkdown(n.body)}</div>`;
        hydrate(box, n.path, depth + 1);
      })
      .catch(() => {
        box.className = "embed-missing";
        box.textContent = `Nota incrustada no encontrada: ${target}`;
      });
  });
}

// ── Reading view ─────────────────────────────────────────────────────────

export function ReadView({ note }: { note: OpenNote }) {
  const body = bodyOf(note.raw);
  // Rendering a long note (markdown-it plus one KaTeX pass per formula) takes long
  // enough to be felt on open and on every keystroke in split mode. The deferred
  // value renders the same HTML, just without holding up what is being typed.
  const deferred = useDeferredValue(note);
  const html = useMemo(
    () => (deferred.kind === "code"
      ? renderMarkdown("```" + (deferred.path.split(".").pop() ?? "") + "\n" + deferred.raw + "\n```")
      : renderMarkdown(bodyOf(deferred.raw))),
    [deferred.kind, deferred.path, deferred.raw],
  );
  const ref = useRef<HTMLElement>(null);
  const editRaw = useApp((s) => s.editRaw);
  const clearReveal = useApp((s) => s.clearReveal);

  useEffect(() => {
    if (ref.current) hydrate(ref.current, note.path, 0);
  }, [html, note.path]);

  // Scroll to a line asked for by search / backlinks (1-based raw line).
  useEffect(() => {
    if (note.revealLine === undefined || !ref.current) return;
    const fmLines = note.raw.slice(0, note.raw.length - body.length).split("\n").length - 1;
    const target = note.revealLine - 1 - fmLines;
    let best: Element | null = null;
    ref.current.querySelectorAll("[data-src-line]").forEach((el) => {
      if (Number(el.getAttribute("data-src-line")) <= target) best = el;
    });
    (best as Element | null)?.scrollIntoView({ block: "center" });
    if (best) {
      (best as HTMLElement).animate(
        [{ backgroundColor: "var(--nv-accent-soft)" }, { backgroundColor: "transparent" }],
        { duration: 1600 },
      );
    }
    clearReveal(note.path);
  }, [note.revealLine, note.path, note.raw, body, clearReveal]);

  const onClick = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    const box = el.closest<HTMLInputElement>("input.task-box");
    if (box) {
      e.preventDefault();
      const line = Number(box.dataset.line);
      const nextBody = toggleTaskAt(body, line);
      if (nextBody !== body) editRaw(note.path, note.raw.slice(0, note.raw.length - body.length) + nextBody);
      return;
    }
    const copy = el.closest<HTMLButtonElement>("button[data-copy]");
    if (copy) {
      const code = copy.closest(".code-block")?.querySelector("pre")?.textContent ?? "";
      void copyText(code).then((ok) => {
        copy.textContent = ok ? "Copiado" : "Error";
        setTimeout(() => (copy.textContent = "Copiar"), 1400);
      });
      return;
    }
    const wiki = el.closest<HTMLElement>("a.wikilink");
    if (wiki?.dataset.target) {
      e.preventDefault();
      void followWikilink(wiki.dataset.target);
      return;
    }
    const a = el.closest("a");
    const href = a?.getAttribute("href");
    const media = href ? parseMediaUrl(href) : null;
    if (media) {
      // [mm:ss](nv://media?file=…&t=…): that moment in the English player.
      e.preventDefault();
      void usePlayer.getState().open(media[0], media[1]);
      return;
    }
    if (href && !/^(https?:|mailto:|#|nv:)/i.test(href)) {
      // [text](other-note.md): a link to another file in the vault.
      e.preventDefault();
      const rel = resolveRelative(note.path, href);
      void useApp.getState().openNote(rel.endsWith(".md") ? rel : `${rel}.md`);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-10 pb-24 pt-8">
        {note.kind === "note" && <FrontmatterCard fm={note.frontmatter} />}
        <article
          ref={ref}
          className="nv-prose"
          onClick={onClick}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
