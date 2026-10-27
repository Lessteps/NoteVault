import { ArrowLeft, ArrowRight, Bookmark, ExternalLink, Globe, LayoutDashboard, Loader2, PanelRight, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type BrowserState } from "../../lib/bridge";
import { newId } from "../../lib/canvas";
import { useApp } from "../../store/app";
import { useCanvas } from "../../store/canvas";
import { IconButton } from "../ui";
import { useModuleVisible } from "../ModuleHost";
import { toggleFace } from "../../lib/panelFaces";
import { useWebPages } from "../../store/webPages";

export function BrowserPanel({
  url,
  onPageState,
}: {
  /** The page the rail selected: changing it navigates the browser there. */
  url?: string;
  /** Lets the rail keep the page's title, address and icon up to date. */
  onPageState?: (state: BrowserState) => void;
}) {
  const initialUrl = url;
  const toast = useApp((s) => s.toast);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const attached = useRef(false);

  const [state, setState] = useState<BrowserState>({
    url: initialUrl || "",
    title: "",
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
  });

  const [inputUrl, setInputUrl] = useState(initialUrl || "");
  const visible = useModuleVisible();
  const [isBookmarked, setIsBookmarked] = useState(false);
  const pagesOpen = useWebPages((s) => s.open);

  // Sync input text when the active page navigates
  useEffect(() => {
    if (state.url && state.url !== "about:blank") {
      setInputUrl(state.url);
    }
  }, [state.url]);

  // Check if current URL is bookmarked
  useEffect(() => {
    if (!state.url || state.url.startsWith("data:") || state.url.startsWith("about:")) {
      setIsBookmarked(false);
      return;
    }
    let live = true;
    api.webOverview().then((res) => {
      if (!live) return;
      const found = res.bookmarks?.some((b: { url: string }) => b.url === state.url);
      setIsBookmarked(Boolean(found));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [state.url]);

  const updateBounds = useCallback(() => {
    if (!surfaceRef.current) return;
    const r = surfaceRef.current.getBoundingClientRect();
    const bounds = {
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };

    if (bounds.width > 0 && bounds.height > 0) {
      if (!attached.current) {
        attached.current = true;
        api.browserAttach(bounds, initialUrl).then((s) => {
          if (s) {
            setState(s);
            if (s.url && s.url !== "about:blank") setInputUrl(s.url);
          }
        }).catch(() => undefined);
      } else {
        void api.browserSetBounds(bounds);
      }
    } else if (attached.current) {
      // The pane has no room: the functionality was switched away and this view
      // is hidden. A native view lives *outside* the DOM, so `hidden` does not
      // hide it — it has to be detached here and re-attached when it comes back
      // (the observer reports the new size then).
      attached.current = false;
      void api.browserDetach().catch(() => undefined);
    }
  }, [initialUrl]);

  // Another functionality took the screen: the native view has to go away with
  // it, and come back attached to the same page.
  useEffect(() => {
    if (visible) {
      updateBounds();
      return;
    }
    if (attached.current) {
      attached.current = false;
      void api.browserDetach().catch(() => undefined);
    }
  }, [visible, updateBounds]);

  useEffect(() => {
    updateBounds();
    const el = surfaceRef.current;
    let ro: ResizeObserver | null = null;
    if (el) {
      ro = new ResizeObserver(() => updateBounds());
      ro.observe(el);
    }
    window.addEventListener("resize", updateBounds);

    const unsubState = api.onBrowserState((newState) => {
      setState(newState);
      onPageState?.(newState);
      if (newState.url && newState.url !== "about:blank") {
        setInputUrl(newState.url);
      }
    });

    // Initial state query
    api.browserState().then((s) => {
      if (s && s.url && s.url !== "about:blank") {
        setState(s);
        setInputUrl(s.url);
      }
    }).catch(() => undefined);

    return () => {
      unsubState();
      if (ro) ro.disconnect();
      window.removeEventListener("resize", updateBounds);
      attached.current = false;
      void api.browserDetach();
    };
  }, [updateBounds]);

  // The rail picked another page: the one native view navigates to it.
  useEffect(() => {
    if (!url || !attached.current) return;
    if (url === state.url) return;
    api.browserNavigate(url).then((s) => {
      if (s) {
        setState(s);
        onPageState?.(s);
      }
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const handleNavigate = (e?: React.FormEvent) => {
    e?.preventDefault();
    const target = inputUrl.trim();
    if (!target) return;
    setState((s) => ({ ...s, isLoading: true }));
    api.browserNavigate(target).then((s) => {
      if (s) setState(s);
    }).catch((err) => {
      toast("error", (err as Error).message);
      setState((s) => ({ ...s, isLoading: false }));
    });
  };

  const handleAction = (action: "back" | "forward" | "reload" | "stop") => {
    api.browserAction(action).then((s) => {
      if (s) setState(s);
    }).catch(() => undefined);
  };

  const toggleBookmark = async () => {
    if (!state.url || state.url.startsWith("data:") || state.url.startsWith("about:")) return;
    try {
      if (isBookmarked) {
        await api.webBookmarkRemove(state.url);
        setIsBookmarked(false);
        toast("info", "Marcador eliminado");
      } else {
        await api.webBookmarkAdd(state.title || state.url, state.url);
        setIsBookmarked(true);
        toast("info", "Marcador guardado");
      }
    } catch (err) {
      toast("error", (err as Error).message);
    }
  };

  const toCanvas = () => {
    const c = useCanvas.getState();
    if (!c.path) {
      toast("info", "Abre un canvas en Notas para añadirle la página.");
      return;
    }
    const d = c.doc;
    const b = d.nodes.reduce((m, n) => Math.max(m, n.y + n.height), 0);
    c.commit({
      ...d,
      nodes: [
        ...d.nodes,
        {
          id: newId(),
          type: "link",
          x: 40,
          y: b + 40,
          width: 320,
          height: 100,
          url: state.url,
          label: state.title || state.url,
        },
      ],
    });
    toast("info", "Enlace añadido al canvas.");
  };

  const isElectron = typeof window !== "undefined" && Boolean(window.nv);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-panel">
      {/* Navigation bar */}
      <div className="flex h-10 flex-none items-center gap-1 border-b border-line bg-surface px-2">
        <IconButton
          title="Atrás"
          disabled={!state.canGoBack}
          onClick={() => handleAction("back")}
        >
          <ArrowLeft size={14} />
        </IconButton>
        <IconButton
          title="Adelante"
          disabled={!state.canGoForward}
          onClick={() => handleAction("forward")}
        >
          <ArrowRight size={14} />
        </IconButton>
        <IconButton
          title={state.isLoading ? "Detener" : "Recargar"}
          onClick={() => handleAction(state.isLoading ? "stop" : "reload")}
        >
          {state.isLoading ? <Loader2 size={14} className="animate-spin text-accent-text" /> : <RotateCw size={14} />}
        </IconButton>

        {/* Address bar */}
        <form onSubmit={handleNavigate} className="flex min-w-0 flex-1 items-center gap-1">
          <div className="relative flex min-w-0 flex-1 items-center">
            <Globe size={13} className="pointer-events-none absolute left-2 text-faint" />
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Buscar o ingresar URL (ej. youtube.com, wikipedia.org)..."
              className="h-7 w-full rounded-md border border-line bg-panel pl-7 pr-2 font-mono text-[11.5px] text-text outline-none transition-colors focus:border-accent"
            />
          </div>
        </form>

        <IconButton
          title={isBookmarked ? "Quitar de marcadores" : "Guardar en marcadores"}
          onClick={toggleBookmark}
          active={isBookmarked}
        >
          <Bookmark size={14} fill={isBookmarked ? "currentColor" : "none"} />
        </IconButton>

        <IconButton
          title="Añadir a canvas activo"
          onClick={toCanvas}
        >
          <LayoutDashboard size={14} />
        </IconButton>

        <IconButton
          title="Abrir en navegador externo"
          onClick={() => void api.openExternal(state.url)}
        >
          <ExternalLink size={14} />
        </IconButton>

        <IconButton
          title={pagesOpen ? "Ocultar pestañas del navegador" : "Mostrar pestañas del navegador"}
          onClick={() => toggleFace("pages")}
          active={pagesOpen}
        >
          <PanelRight size={14} />
        </IconButton>
      </div>

      {/* Embedded browser surface or web fallback */}
      <div ref={surfaceRef} className="relative min-h-0 flex-1 w-full bg-surface">
        {!isElectron && (
          <iframe
            src={state.url}
            title={state.title || "Navegador web"}
            className="h-full w-full border-none"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
        )}
      </div>
    </div>
  );
}
