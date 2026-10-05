// Historial de conversaciones: búsqueda y agrupación por fecha. Es la vista compartida por el historial
// del asistente (datos de `useAssistant`) y el del Mentor (datos de `useMentor`); cada uno le pasa
// sus conversaciones y sus acciones.

import { ArrowLeft, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { groupByDate, matchesQuery, whenLabel } from "../../lib/conversationDates";
import { useApp } from "../../store/app";
import { askText, cn, confirmAction, IconButton } from "../ui";

export interface HistoryItem {
  id: string;
  title: string;
  updated_at: string;
  count: number;
  model?: string;
}

export function ConversationHistory({
  title = "Historial",
  ariaLabel = "Historial de conversaciones",
  items,
  currentId,
  query,
  onQuery,
  onOpen,
  onRename,
  onDelete,
  onNew,
  onClose,
  emptyText = "Aún no hay conversaciones guardadas. Pregunta algo en el chat y aparecerá aquí.",
}: {
  title?: string;
  ariaLabel?: string;
  items: HistoryItem[];
  currentId: string | null;
  query: string;
  onQuery: (q: string) => void;
  onOpen: (id: string) => void | Promise<void>;
  onRename: (id: string, title: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onNew: () => void;
  onClose: () => void;
  emptyText?: string;
}) {
  const [error, setError] = useState("");
  const toast = useApp((s) => s.toast);
  const groups = useMemo(() => groupByDate(items.filter((h) => matchesQuery(h.title, query))), [items, query]);

  const rename = async (item: HistoryItem) => {
    const next = await askText("Renombrar conversación", item.title, "Guardar");
    if (next === null || next.trim() === item.title) return;
    try {
      await onRename(item.id, next.trim());
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  const remove = async (item: HistoryItem) => {
    const ok = await confirmAction(
      "Eliminar conversación",
      `Se borrará «${item.title}» de este equipo. No se puede deshacer.`,
      "Eliminar",
      true,
    );
    if (!ok) return;
    try {
      await onDelete(item.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-panel" aria-label={ariaLabel}>
      <div className="flex h-9 flex-none items-center gap-0.5 border-b border-line px-2">
        <IconButton title="Volver al chat" onClick={onClose}>
          <ArrowLeft size={15} />
        </IconButton>
        <span className="min-w-0 flex-1 truncate pl-1 text-[12.5px] font-medium text-text">{title}</span>
        <IconButton title="Nueva conversación" onClick={onNew}>
          <Plus size={15} />
        </IconButton>
        <IconButton title="Cerrar" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>
      <div className="flex-none px-2.5 pt-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-2 focus-within:border-accent">
          <Search size={12} className="flex-none text-faint" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            aria-label="Buscar conversación"
            placeholder="Buscar conversación…"
            className="w-full bg-transparent py-1.5 text-[12.5px] text-text outline-none placeholder:text-faint"
          />
          {query && (
            <button type="button" title="Limpiar" onClick={() => onQuery("")} className="text-faint hover:text-text">
              <X size={12} />
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {error && <p className="px-1 pt-2 text-[11.5px] text-danger">⚠ {error}</p>}
        {!groups.length && (
          <p className="px-1 py-4 text-[12px] leading-relaxed text-faint">
            {items.length ? "Ninguna conversación coincide con la búsqueda." : emptyText}
          </p>
        )}
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-1 pb-1 pt-2.5 font-mono text-[10px] uppercase tracking-wider text-faint">{group.label}</div>
            {group.items.map((item) => (
              <div
                key={item.id}
                className={cn("group flex items-center gap-0.5 rounded-lg px-2 py-1.5", item.id === currentId ? "bg-accent-soft" : "hover:bg-hover")}
              >
                <button type="button" onClick={() => void onOpen(item.id)} title={item.title} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-[12.5px] text-text">{item.title}</div>
                  <div className="truncate text-[11px] text-faint">
                    {whenLabel(item.updated_at)} · {item.count} mensaje{item.count === 1 ? "" : "s"}
                    {item.model ? ` · ${item.model}` : ""}
                  </div>
                </button>
                <IconButton title="Renombrar" className="opacity-0 group-hover:opacity-100" onClick={() => void rename(item)}>
                  <Pencil size={12} />
                </IconButton>
                <IconButton title="Eliminar" className="opacity-0 group-hover:opacity-100" onClick={() => void remove(item)}>
                  <Trash2 size={12} />
                </IconButton>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
