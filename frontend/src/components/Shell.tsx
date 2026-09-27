// App chrome: top bar, icon rail, status bar, toasts.

import {
  Calendar, CircleCheck, Dumbbell, Flag, Globe, House, Kanban, Moon, PenLine, Search,
  SquareCheck, Sun, Wallet, X, Gem, Cloud, CloudUpload, CircleAlert, Settings,
} from "lucide-react";
import type { ComponentType } from "react";
import { useApp, type ModuleId } from "../store/app";
import { cn, Kbd } from "./ui";
import { useVaultDialog } from "./VaultDialog";
import { useSettingsDialog } from "./settings/SettingsDialog";

export function TopBar() {
  const info = useApp((s) => s.info);
  const setSwitcher = useApp((s) => s.setSwitcher);
  return (
    <header className="flex h-11 flex-none items-center gap-3 border-b border-line bg-bg px-4">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-accent text-white">
          <Gem size={14} strokeWidth={2.2} />
        </span>
        <span className="text-[13px] font-semibold tracking-tight text-text">NoteVault</span>
      </div>
      <span className="text-faint">—</span>
      <button type="button" title="Cambiar de vault" onClick={() => useVaultDialog.getState().set(true)}
        className="rounded-md px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-dim hover:bg-hover hover:text-text">
        Vault: {info?.vault_name ?? "…"}
      </button>

      <button
        type="button"
        onClick={() => setSwitcher(true)}
        className="mx-auto flex h-7 w-[440px] max-w-[40vw] items-center gap-2 rounded-lg border border-line bg-panel px-3 text-[12px] text-faint transition-colors hover:border-line-strong hover:text-dim"
      >
        <Search size={13} />
        <span>Buscar notas, abrir o crear…</span>
        <span className="ml-auto">
          <Kbd>Ctrl P</Kbd>
        </span>
      </button>

      <button
        type="button"
        title="Navegador Web"
        onClick={() => {
          if (useApp.getState().module === "notas") {
            const s = useApp.getState();
            if (!s.inspectorOpen) s.toggleInspector();
            localStorage.setItem("nv.inspector.tab", "browser");
            window.dispatchEvent(new CustomEvent("nv-set-inspector-tab", { detail: "browser" }));
          } else {
            useApp.getState().setModule("web");
          }
        }}
        className="flex h-7 items-center gap-1.5 rounded-lg border border-line bg-panel px-2 text-[12px] text-dim transition-colors hover:border-line-strong hover:text-text"
      >
        <Globe size={13} className="text-accent-text" />
        <span className="hidden sm:inline">Navegador</span>
      </button>

      <SyncState />
    </header>
  );
}

function SyncState() {
  const pending = useApp((s) => Object.values(s.notes).filter((n) => n.dirty || n.saving).length);
  const conflicts = useApp((s) => Object.values(s.notes).filter((n) => n.conflict).length);
  if (conflicts) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-warn">
        <CircleAlert size={13} /> Conflicto
      </span>
    );
  }
  return pending ? (
    <span className="flex items-center gap-1.5 text-[11px] text-dim">
      <CloudUpload size={13} /> Guardando…
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-[11px] text-mint">
      <Cloud size={13} /> Guardado
    </span>
  );
}

export const MODULES: Array<{ id: ModuleId; label: string; Icon: ComponentType<{ size?: number; strokeWidth?: number }> }> = [
  { id: "home", label: "Vista General", Icon: House },
  { id: "calendario", label: "Calendario", Icon: Calendar },
  { id: "habits", label: "Hábitos", Icon: CircleCheck },
  { id: "ejercicio", label: "Ejercicio", Icon: Dumbbell },
  { id: "proyectos", label: "Proyectos", Icon: Kanban },
  { id: "metas", label: "Metas", Icon: Flag },
  { id: "finanzas", label: "Finanzas", Icon: Wallet },
  { id: "notas", label: "Notas", Icon: PenLine },
  { id: "tareas", label: "Tareas", Icon: SquareCheck },
  { id: "web", label: "Navegador Web", Icon: Globe },
];

export function moduleLabel(id: ModuleId): string {
  return MODULES.find((m) => m.id === id)?.label ?? (id === "web" ? "Navegador Web" : id === "player" ? "Reproductor de inglés" : id);
}

export function IconRail() {
  const current = useApp((s) => s.module);
  const setModule = useApp((s) => s.setModule);
  const theme = useApp((s) => s.theme);
  const toggleTheme = useApp((s) => s.toggleTheme);
  return (
    <nav aria-label="Módulos" className="flex w-12 flex-none flex-col items-center gap-1.5 border-r border-line bg-bg py-3">
      {MODULES.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          title={label}
          aria-label={label}
          onClick={() => setModule(id)}
          className={cn(
            "grid h-9 w-9 place-items-center rounded-lg transition-colors",
            current === id
              ? "bg-accent text-white shadow-[0_0_0_1px_var(--nv-accent)]"
              : "text-faint hover:bg-hover hover:text-text",
          )}
        >
          <Icon size={18} strokeWidth={1.8} />
        </button>
      ))}
      <div className="flex-1" />
      <button
        type="button"
        title="Configuración"
        aria-label="Configuración"
        onClick={() => useSettingsDialog.getState().set(true)}
        className="grid h-9 w-9 place-items-center rounded-lg text-faint hover:bg-hover hover:text-text"
      >
        <Settings size={17} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        title="Cambiar tema"
        aria-label="Cambiar tema"
        onClick={toggleTheme}
        className="grid h-9 w-9 place-items-center rounded-lg text-faint hover:bg-hover hover:text-text"
      >
        {theme === "dark" ? <Moon size={17} strokeWidth={1.8} /> : <Sun size={17} strokeWidth={1.8} />}
      </button>
    </nav>
  );
}

export function StatusBar() {
  const note = useApp((s) => (s.active ? s.notes[s.active] : undefined));
  const cursor = useApp((s) => s.cursor);
  const mode = useApp((s) => s.mode);
  const info = useApp((s) => s.info);
  const words = note ? (note.raw.match(/\S+/g)?.length ?? 0) : 0;
  return (
    <footer className="flex h-7 flex-none items-center gap-3 border-t border-line bg-bg px-3 font-mono text-[10.5px] text-faint">
      <span className="flex items-center gap-1.5 text-mint">
        <Cloud size={12} /> {info?.vault_name ?? "vault"}
      </span>
      {note && (
        <>
          <Sep />
          <span>UTF-8 · {note.eol === "\r\n" ? "CRLF" : "LF"}</span>
          <Sep />
          <span>
            {mode !== "read" && cursor ? `Ln ${cursor.line}, Col ${cursor.col} · ` : ""}
            {words.toLocaleString("es")} palabras
          </span>
        </>
      )}
      <span className="ml-auto">{note ? note.path : "Sin nota abierta"}</span>
    </footer>
  );
}

function Sep() {
  return <span className="text-line-strong">|</span>;
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed bottom-10 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex max-w-[380px] items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px] shadow-xl",
            t.kind === "error"
              ? "border-danger/40 bg-card text-text"
              : "border-line-strong bg-card text-text",
          )}
        >
          {t.kind === "error" && <CircleAlert size={15} className="mt-px flex-none text-danger" />}
          <span className="flex-1">{t.text}</span>
          <button type="button" onClick={() => dismiss(t.id)} className="text-faint hover:text-text">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function ComingSoon({ module }: { module: ModuleId }) {
  return (
    <div className="grid flex-1 place-items-center bg-surface">
      <div className="max-w-md text-center">
        <div className="text-[15px] font-semibold text-text">{moduleLabel(module)}</div>
        <p className="mt-2 text-[13px] leading-relaxed text-dim">
          Este módulo todavía vive en la app clásica. Se migra a la nueva interfaz en las
          próximas fases; mientras tanto ábrelo con <span className="font-mono text-accent-text">python run_app.py</span>.
        </p>
      </div>
    </div>
  );
}
