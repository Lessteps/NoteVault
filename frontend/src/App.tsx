import { useEffect } from "react";
import { api } from "./lib/bridge";
import { flushAll, useApp } from "./store/app";
import { ComingSoon, IconRail, StatusBar, Toasts, TopBar } from "./components/Shell";
import { DialogHost, MenuHost } from "./components/ui";
import { NotesModule } from "./components/notes/NotesModule";
import { QuickSwitcher } from "./components/notes/QuickSwitcher";

/**
 * The window must never navigate: a remote page loaded in it would get the
 * Python bridge. Every link click is caught here; web links open in the
 * system browser, everything else is handled by the view that owns it.
 */
function useNavigationGuard() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href) return;
      e.preventDefault();
      if (/^(https?:|mailto:)/i.test(href)) {
        api.openExternal(href).catch((err: Error) => useApp.getState().toast("error", err.message));
      }
    };
    const stop = (e: DragEvent) => {
      // Dropping a file must not open it in place of the app.
      if (!(e.target as Element | null)?.closest?.("[data-dropzone]")) e.preventDefault();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const s = useApp.getState();
      const key = e.key.toLowerCase();
      if (key === "p" || key === "o") {
        e.preventDefault();
        s.setSwitcher(true);
      } else if (key === "s") {
        e.preventDefault();
        if (s.active) void s.save(s.active, { force: true });
      } else if (key === "e") {
        e.preventDefault();
        s.setMode(s.mode === "read" ? "edit" : "read");
      } else if (key === "w" && s.active) {
        e.preventDefault();
        void s.closeTab(s.active);
      } else if (key === "\\") {
        e.preventDefault();
        s.toggleExplorer();
      }
    };
    window.addEventListener("keydown", onKey);
    const onUnload = () => void flushAll();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);
}

export function App() {
  const init = useApp((s) => s.init);
  const module = useApp((s) => s.module);
  useNavigationGuard();
  useShortcuts();
  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <IconRail />
        {module === "notas" ? <NotesModule /> : <ComingSoon module={module} />}
      </div>
      <StatusBar />
      <QuickSwitcher />
      <DialogHost />
      <MenuHost />
      <Toasts />
    </div>
  );
}
