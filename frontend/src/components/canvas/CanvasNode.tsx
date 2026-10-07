// One card of the canvas: text, vault file (note, image, canvas), web link,
// group, flowchart shape or freehand drawing.

import { FileQuestion, Globe, LayoutDashboard } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { api } from "../../lib/bridge";
import { colorOf, shapePath, type CNode, type Side } from "../../lib/canvas";
import { renderMarkdown } from "../../lib/markdown";
import { SourceEditor } from "../notes/SourceEditor";
import { cn } from "../ui";

type FileInfo = { exists: boolean; kind?: string; title?: string; path?: string; text?: string; src?: string };
const infoCache = new Map<string, Promise<FileInfo>>();

/** File cards ask Python once per path (per canvas session). */
export function fileInfo(path: string): Promise<FileInfo> {
  let p = infoCache.get(path);
  if (!p) {
    p = api.canvasFileInfo(path).then(async (info) => {
      if (info.exists && info.kind === "image") {
        try {
          return { ...info, src: (await api.canvasMedia(path)).data_url };
        } catch {
          return info;
        }
      }
      return info;
    }).catch(() => ({ exists: false }));
    infoCache.set(path, p);
  }
  return p;
}
export function forgetFileInfo() {
  infoCache.clear();
}

const stripFrontmatter = (t: string) => t.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");

function FileBody({ node }: { node: CNode }) {
  const [info, setInfo] = useState<FileInfo | null>(null);
  useEffect(() => {
    let live = true;
    void fileInfo(node.file ?? "").then((i) => live && setInfo(i));
    return () => {
      live = false;
    };
  }, [node.file]);
  if (!info) return <div className="p-3 text-[12px] text-faint">…</div>;
  if (!info.exists) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-3 text-center text-[12px] text-faint">
        <FileQuestion size={18} />
        <span className="break-all">{node.file}</span>
        <span>no existe</span>
      </div>
    );
  }
  if (info.kind === "image") {
    return info.src
      ? <img src={info.src} alt={info.title} draggable={false} className="h-full w-full object-contain" />
      : <div className="p-3 text-[12px] text-faint">{info.title}</div>;
  }
  if (info.kind === "canvas") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 text-[13px] text-dim">
        <LayoutDashboard size={22} className="text-warn" />
        <span className="font-semibold text-text">{info.title}</span>
        <span className="text-[11px] text-faint">doble clic para abrir</span>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex-none truncate border-b border-line px-3 py-1.5 text-[12px] font-semibold text-accent-text">
        {info.title}
      </div>
      {info.kind === "note" ? (
        <div
          className="nv-prose min-h-0 flex-1 px-3 py-2 text-[12.5px]"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(stripFrontmatter(info.text ?? "")) }}
        />
      ) : (
        <pre className="min-h-0 flex-1 overflow-hidden px-3 py-2 font-mono text-[11px] text-dim">{info.text}</pre>
      )}
    </div>
  );
}

function TextEditor({ value, onDone, className }: { value: string; onDone: (v: string | null) => void; className?: string }) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const t = ref.current;
    if (t) {
      t.focus();
      t.setSelectionRange(t.value.length, t.value.length);
    }
  }, []);
  return (
    <textarea
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onDone(draft)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onDone(draft);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn("h-full w-full resize-none bg-transparent p-3 text-[13.5px] leading-relaxed text-text outline-none", className)}
    />
  );
}

/**
 * The editor of a text card: the same live-preview editor as a note (headings, bold and lists are drawn as you type, the
 * Markdown markers hidden away from the cursor), never the raw source in a plain box.
 */
function CardEditor({ value, onDone }: { value: string; onDone: (v: string | null) => void }) {
  const draft = useRef(value);
  return (
    <div
      data-card-editor
      className="nv-card-editor h-full min-h-0 overflow-hidden px-2.5 py-1.5 [&_.cm-content]:!max-w-none [&_.cm-scroller]:!p-0 [&_.cm-scroller]:!pb-2"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onDone(draft.current); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onDone(draft.current);
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <SourceEditor value={value} eol={"\n"} code={false} onChange={(raw) => { draft.current = raw; }} />
    </div>
  );
}

const SIDES: Side[] = ["top", "right", "bottom", "left"];
const PORT_POS: Record<Side, string> = {
  // 12 px OUTSIDE the side: at the middle of the outline they sat on top of the side resize handles and hid them.
  top: "left-1/2 top-0 -translate-x-1/2 -translate-y-[calc(50%_+_12px)]",
  right: "right-0 top-1/2 translate-x-[calc(50%_+_12px)] -translate-y-1/2",
  bottom: "left-1/2 bottom-0 -translate-x-1/2 translate-y-[calc(50%_+_12px)]",
  left: "left-0 top-1/2 -translate-x-[calc(50%_+_12px)] -translate-y-1/2",
};

export const CanvasNodeView = memo(function CanvasNodeView({
  node, selected, editing, onEditDone, boxed,
}: {
  node: CNode;
  selected: boolean;
  /** The selection came from a selection box: a drawing then shows its box as well (a click shows the stroke itself). */
  boxed?: boolean;
  editing: boolean;
  onEditDone: (id: string, text: string | null) => void;
}) {
  const col = colorOf(node.color);
  const tint = node.color ? `color-mix(in srgb, ${col} 12%, var(--nv-card))` : "var(--nv-card)";
  const borderWidth = typeof node.nv?.borderWidth === "number" ? node.nv.borderWidth : 2;
  const style: React.CSSProperties = {
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    borderWidth,
    borderStyle: "solid",
  };
  const done = (v: string | null) => onEditDone(node.id, v);

  if (node.type === "group") {
    return (
      <div
        data-node-id={node.id}
        className={cn("pointer-events-none absolute rounded-2xl", selected && "outline outline-2 outline-offset-2 outline-accent")}
        style={{ ...style, borderColor: col, background: `color-mix(in srgb, ${colorOf(node.color, "var(--nv-dim)")} 7%, transparent)` }}
      >
        <div data-group-label title="Arrastra para mover el grupo" className={cn("pointer-events-auto absolute -top-8 left-0 flex h-7 cursor-move items-center whitespace-nowrap rounded-lg px-2 text-[14px] font-semibold text-text", !editing && "max-w-full")}
          style={{ background: `color-mix(in srgb, ${colorOf(node.color, "var(--nv-dim)")} 22%, var(--nv-surface))` }}>
          {editing
            ? <input autoFocus defaultValue={node.label ?? ""} size={Math.max(8, (node.label ?? "").length + 2)}
              onInput={(e) => { e.currentTarget.size = Math.max(8, e.currentTarget.value.length + 2); }} onBlur={(e) => done(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="min-w-0 bg-transparent outline-none" />
            : <span className="truncate">{node.label || "Grupo"}</span>}
        </div>
        <Handles selected={selected} />
      </div>
    );
  }

  if (node.type === "nv-drawing") {
    const strokes = node.nv?.strokes ?? [];
    return (
      // Only the stroke itself takes the pointer (never its box): a click on the line selects it, a click beside it is the board.
      <div data-node-id={node.id} className={cn("pointer-events-none absolute", selected && boxed && "rounded outline-dashed outline-1 outline-accent")} style={{ left: node.x, top: node.y, width: node.width, height: node.height }}>
        <svg width={node.width} height={node.height} className="overflow-visible">
          {selected && strokes.map((s, i) => (
            <polyline key={"halo" + i} points={s.points.map((p) => p.join(",")).join(" ")} fill="none"
              stroke="var(--nv-accent)" strokeOpacity={0.35} strokeWidth={s.width + 6} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {strokes.map((s, i) => (
            <polyline key={i} points={s.points.map((p) => p.join(",")).join(" ")} fill="none"
              stroke={colorOf(s.color, "var(--nv-text)")} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {strokes.map((s, i) => (
            <polyline key={"hit" + i} points={s.points.map((p) => p.join(",")).join(" ")} fill="none" stroke="transparent"
              strokeWidth={Math.max(s.width, 10)} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "stroke" }} />
          ))}
        </svg>
        <Handles selected={selected} noPorts />
      </div>
    );
  }

  if (node.type === "nv-shape") {
    const stroke = colorOf(node.color, "var(--nv-accent)");
    return (
      <div data-node-id={node.id} className="absolute" style={{ left: node.x, top: node.y, width: node.width, height: node.height }}>
        <svg width={node.width} height={node.height} className="absolute inset-0 overflow-visible">
          <path d={shapePath(node.nv?.shape ?? "process", node.width, node.height)}
            fill={node.nv?.shape === "comment" ? "none" : `color-mix(in srgb, ${stroke} 14%, var(--nv-card))`}
            stroke={selected ? "var(--nv-accent)" : stroke} strokeWidth={selected ? borderWidth + 1 : borderWidth} />
        </svg>
        <div className="absolute inset-0 grid place-items-center px-4 text-center text-[13px] font-medium text-text">
          {editing ? <TextEditor value={node.text ?? ""} onDone={done} className="text-center" /> : node.text}
        </div>
        <Handles selected={selected} />
      </div>
    );
  }

  return (
    <div
      data-node-id={node.id}
      className={cn(
        "absolute flex flex-col overflow-hidden rounded-xl shadow-sm",
        selected && "ring-2 ring-accent ring-offset-1 ring-offset-surface",
      )}
      style={{ ...style, borderColor: col, background: tint }}
    >
      {node.type === "text" && (editing
        ? <CardEditor value={node.text ?? ""} onDone={done} />
        : (
          <div className="nv-prose h-full px-3 py-2 text-[13.5px]"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(node.text ?? "") }} />
        ))}
      {node.type === "file" && <FileBody node={node} />}
      {node.type === "link" && (
        <div className="flex h-full flex-col justify-center gap-1 px-3">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-accent-text"><Globe size={14} /> Enlace web</span>
          <span className="break-all text-[12px] text-dim">{node.url}</span>
          <span className="text-[10.5px] text-faint">doble clic para abrir en el navegador</span>
        </div>
      )}
      <Handles selected={selected} />
    </div>
  );
});

const RESIZE_HANDLES = [
  { pos: "top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize", handle: "nw" },
  { pos: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize", handle: "n" },
  { pos: "top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize", handle: "ne" },
  { pos: "top-1/2 right-0 translate-x-1/2 -translate-y-1/2 cursor-ew-resize", handle: "e" },
  { pos: "bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize", handle: "se" },
  { pos: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize", handle: "s" },
  { pos: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize", handle: "sw" },
  { pos: "top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize", handle: "w" },
];

/** Ports to drag connections from, and the 8 resize handles. */
function Handles({ selected, noPorts }: { selected: boolean; noPorts?: boolean }) {
  return (
    <>
      {!noPorts && SIDES.map((s) => (
        <span
          key={s}
          data-port={s}
          title="Arrastra para conectar"
          className={cn(
            "nv-port pointer-events-auto absolute z-20 h-3.5 w-3.5 cursor-pointer rounded-full border-2 border-accent bg-card",
            PORT_POS[s], selected ? "opacity-100" : "opacity-0",
          )}
        />
      ))}
      {selected && RESIZE_HANDLES.map(({ pos, handle }) => (
        <span
          key={handle}
          data-resize={handle}
          title="Cambiar tamaño"
          className={cn(
            "pointer-events-auto absolute z-10 rounded-sm border-2 border-accent bg-card",
            handle === "n" || handle === "s" ? "h-3.5 w-7" : handle === "w" || handle === "e" ? "h-7 w-3.5" : "h-3.5 w-3.5",
            pos,
          )}
        />
      ))}
    </>
  );
}
