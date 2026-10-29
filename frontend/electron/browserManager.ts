import { WebContentsView, BrowserWindow, net, shell, type WebContents } from "electron";
import { blockedPageHtml, hostOf, normalizeUrl, UsageMeter, WebStore } from "../src/core/webStore.js";
import { getAppState } from "../src/api/registry.js";
import { googleSignInDataUrl, isGoogleSignIn } from "../src/core/webAuth.js";
import { cleanRequestHeaders, cleanUserAgent } from "../src/core/webUserAgent.js";
import { zoomActionFor } from "../src/core/zoomLevel.js";
import { applyZoomAction } from "./zoom.js";

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  /** The site's icon, inlined as a data URL so the renderer can show it (its CSP blocks remote images). */
  favicon: string;
  /** Whether the native view is currently attached to the window. */
  attached: boolean;
}

function errorPageHtml(url: string, errorDescription: string, errorCode: number): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Error al cargar la página</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #131317;
      color: #e6e6eb;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      max-width: 460px;
      width: 100%;
      background: #1b1b22;
      border: 1px solid #2b2b36;
      border-radius: 12px;
      padding: 24px;
    }
    h1 { margin: 0 0 8px; font-size: 16px; font-weight: 600; }
    p { margin: 0 0 12px; font-size: 13px; color: #9ca0b0; line-height: 1.5; word-break: break-all; }
    code { font-family: monospace; font-size: 11.5px; color: #cbd0df; background: #131317; padding: 3px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>No se pudo abrir esta página</h1>
    <p>Verifica la dirección escrita o tu conexión a internet e inténtalo de nuevo.</p>
    <p><code>${url}</code></p>
    <p><code>${errorDescription || "ERR_FAILED"} (${errorCode})</code></p>
  </div>
</body>
</html>`;
}

export class BrowserManager {
  private view: WebContentsView | null = null;
  private guestWc: WebContents | null = null;
  private configuredWcs = new WeakSet<WebContents>();
  private headersConfigured = false;
  private win: BrowserWindow | null = null;
  private attached = false;
  private currentUrl = "https://www.google.com";
  private currentTitle = "";
  private isLoading = false;
  private currentFavicon = "";
  private meterTimer: NodeJS.Timeout | null = null;
  private lastBounds: BrowserBounds | null = null;

  setWindow(win: BrowserWindow) {
    this.win = win;
  }

  private activeWebContents(): WebContents | null {
    if (this.guestWc && !this.guestWc.isDestroyed()) {
      return this.guestWc;
    }
    if (this.view && !this.view.webContents.isDestroyed()) {
      return this.view.webContents;
    }
    return null;
  }

  /**
   * Binds the `<webview>` guest WebContents created in the renderer so all
   * navigation, content restrictions, history, favicons and usage metering run
   * directly on the visible DOM-embedded surface.
   */
  attachGuest(wc: WebContents): void {
    this.guestWc = wc;
    this.attached = true;

    // Ensure no legacy native WebContentsView overlay stays attached
    if (this.win && !this.win.isDestroyed() && this.view) {
      try {
        this.view.setVisible(false);
        this.win.contentView.removeChildView(this.view);
      } catch {
        // Ignore
      }
    }

    this.configureWebContents(wc);

    wc.once("destroyed", () => {
      if (this.guestWc === wc) {
        this.guestWc = null;
      }
    });

    this.notifyState();
  }

  /**
   * Converts renderer CSS coordinates (from getBoundingClientRect) into window
   * Device Independent Pixels (DIPs) taking the window's zoom factor into account.
   */
  private toDipBounds(bounds: BrowserBounds): BrowserBounds {
    if (!this.win || this.win.isDestroyed()) {
      return {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.max(0, Math.round(bounds.width)),
        height: Math.max(0, Math.round(bounds.height)),
      };
    }
    const zf = this.win.webContents.getZoomFactor();
    const factor = Number.isFinite(zf) && zf > 0 ? zf : 1;
    return {
      x: Math.round(bounds.x * factor),
      y: Math.round(bounds.y * factor),
      width: Math.max(0, Math.round(bounds.width * factor)),
      height: Math.max(0, Math.round(bounds.height * factor)),
    };
  }

  /**
   * Synchronizes the embedded browser's zoom level with the application window,
   * and recalculates DIP bounds for the current layout.
   */
  syncZoom(level: number): void {
    const wc = this.activeWebContents();
    if (wc && !wc.isDestroyed()) {
      wc.setZoomLevel(level);
    }
    if (!this.guestWc && this.lastBounds && this.attached && this.view) {
      this.view.setBounds(this.toDipBounds(this.lastBounds));
    }
  }

  private configureWebContents(wc: WebContents): void {
    if (this.configuredWcs.has(wc)) return;
    this.configuredWcs.add(wc);

    // Follow the application window's zoom scale so web pages match interface sizing
    if (this.win && !this.win.isDestroyed()) {
      wc.setZoomLevel(this.win.webContents.getZoomLevel());
    }

    // Allow Ctrl + Plus / Minus / 0 zoom shortcuts inside the web view as well
    wc.on("before-input-event", (event, input) => {
      const action = zoomActionFor(input);
      if (!action) return;
      event.preventDefault();
      applyZoomAction(action);
    });

    // Present as a plain Chrome: WhatsApp Web and similar sites turn Electron away with
    // "update your browser" because of the Electron/app tokens and the "Electron" client-hint brand.
    const ua = cleanUserAgent(wc.getUserAgent());
    wc.setUserAgent(ua);
    wc.session.setUserAgent(ua);
    if (!this.headersConfigured) {
      this.headersConfigured = true;
      // Páginas web de terceros: sin cámara, micrófono, ubicación, notificaciones ni nada más salvo lo imprescindible
      const ALLOWED = new Set(["fullscreen", "clipboard-sanitized-write"]);
      wc.session.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED.has(permission)));
      wc.session.setPermissionCheckHandler((_wc, permission) => ALLOWED.has(permission));
      wc.session.webRequest.onBeforeSendHeaders((details, callback) => {
        callback({ requestHeaders: cleanRequestHeaders(details.requestHeaders) as Record<string, string> });
      });
    }

    wc.on("did-start-loading", () => {
      this.isLoading = true;
      this.currentFavicon = "";
      this.notifyState();
    });

    wc.on("did-stop-loading", () => {
      this.isLoading = false;
      this.notifyState();
    });

    wc.on("did-navigate", (_e, url) => {
      if (!url.startsWith("data:text/html")) {
        this.currentUrl = url;
        this.currentTitle = wc.getTitle();
        this.recordHistory(url, this.currentTitle);
      }
      this.notifyState();
    });

    wc.on("did-navigate-in-page", (_e, url) => {
      if (!url.startsWith("data:text/html")) {
        this.currentUrl = url;
      }
      this.notifyState();
    });

    wc.on("page-title-updated", (_e, title) => {
      this.currentTitle = title;
      this.notifyState();
    });

    wc.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return; // Ignore ERR_ABORTED (-3)
      this.isLoading = false;
      const failedUrl = validatedURL || this.currentUrl;
      void wc
        .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorPageHtml(failedUrl, errorDescription, errorCode))}`)
        .catch(() => undefined);
      this.notifyState();
    });

    // The renderer cannot load remote images, so the icon is fetched here and
    // handed over as a data URL; the rail falls back to a monogram without it.
    wc.on("page-favicon-updated", (_e, favicons) => {
      const icon = favicons[0];
      if (icon) void this.loadFavicon(icon);
    });

    wc.setWindowOpenHandler(({ url }) => {
      if (isGoogleSignIn(url)) {
        void shell.openExternal(url);
        return { action: "deny" };
      }
      const state = getAppState();
      if (state) {
        const store = new WebStore(state.root);
        const meter = new UsageMeter(store);
        const [allowed] = store.restrictions().check(url, meter.today());
        if (!allowed) {
          return { action: "deny" };
        }
      }
      if (/^https?:/i.test(url)) {
        try {
          const currentHost = hostOf(this.currentUrl || wc.getURL());
          const targetHost = hostOf(url);
          if (currentHost && targetHost && currentHost === targetHost) {
            void this.navigate(url);
          } else {
            void shell.openExternal(url);
          }
        } catch {
          void shell.openExternal(url);
        }
      }
      return { action: "deny" };
    });

    const checkNavigation = (e: Electron.Event, url: string) => {
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        if (url.startsWith("file:") || url.startsWith("chrome:")) {
          e.preventDefault();
        }
        return;
      }
      // Google no deja iniciar sesión en un navegador integrado: se abre en el del sistema y aquí se explica
      if (isGoogleSignIn(url)) {
        e.preventDefault();
        void shell.openExternal(url);
        void wc.loadURL(googleSignInDataUrl()).catch(() => undefined);
        return;
      }
      const state = getAppState();
      if (!state) return;
      const store = new WebStore(state.root);
      const meter = new UsageMeter(store);
      const [allowed, reason] = store.restrictions().check(url, meter.today());
      if (!allowed) {
        e.preventDefault();
        void wc.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(blockedPageHtml(url, reason))}`).catch(() => undefined);
      }
    };

    wc.on("will-navigate", (e, url) => checkNavigation(e, url));
    wc.on("will-redirect", (e, url) => checkNavigation(e, url));

    if (!this.meterTimer) {
      this.meterTimer = setInterval(() => {
        const active = this.activeWebContents();
        if (!this.attached || !active || active.isDestroyed()) return;
        const url = active.getURL();
        if (url.startsWith("http://") || url.startsWith("https://")) {
          const state = getAppState();
          if (state) {
            const store = new WebStore(state.root);
            const meter = new UsageMeter(store);
            meter.tick(hostOf(url), 1);
          }
        }
      }, 1000);
    }
  }

  ensureView(): WebContentsView {
    if (this.view) return this.view;

    this.view = new WebContentsView({
      webPreferences: {
        partition: "persist:nvweb",
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        plugins: true,
      },
    });

    try {
      this.view.setBackgroundColor("#ffffff");
    } catch {
      // Ignore if unsupported
    }

    this.configureWebContents(this.view.webContents);
    return this.view;
  }

  private notifyState() {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send("nv-browser-state", this.getState());
  }

  private recordHistory(url: string, title: string) {
    if (!url.startsWith("http://") && !url.startsWith("https://")) return;
    const state = getAppState();
    if (!state) return;
    const store = new WebStore(state.root);
    store.addHistory(url, title);
  }

  getState(): BrowserState {
    const wc = this.activeWebContents();
    const rawUrl = wc && !wc.isDestroyed() ? wc.getURL() : "";
    const effectiveUrl = rawUrl && !rawUrl.startsWith("data:text/html") ? rawUrl : this.currentUrl;
    const canGoBack = wc && !wc.isDestroyed()
      ? (wc.navigationHistory ? wc.navigationHistory.canGoBack() : wc.canGoBack())
      : false;
    const canGoForward = wc && !wc.isDestroyed()
      ? (wc.navigationHistory ? wc.navigationHistory.canGoForward() : wc.canGoForward())
      : false;
    return {
      url: effectiveUrl,
      title: (wc && !wc.isDestroyed() ? wc.getTitle() : "") || this.currentTitle,
      canGoBack,
      canGoForward,
      isLoading: this.isLoading,
      favicon: this.currentFavicon,
      attached: this.attached,
    };
  }

  /** Fetches the site's icon and keeps it as a small data URL. */
  private async loadFavicon(url: string): Promise<void> {
    try {
      const res = await net.fetch(url);
      if (!res.ok) return;
      const type = res.headers.get("content-type") ?? "image/png";
      if (!type.startsWith("image/")) return;
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.byteLength || buf.byteLength > 96 * 1024) return;
      this.currentFavicon = `data:${type};base64,${buf.toString("base64")}`;
      this.notifyState();
    } catch {
      // Offline or a dead icon: the rail shows the monogram instead.
    }
  }

  attach(bounds: BrowserBounds, url?: string): BrowserState {
    if (!this.win || this.win.isDestroyed()) return this.getState();
    this.lastBounds = bounds;
    this.attached = true;

    const targetUrl = normalizeUrl(url || this.currentUrl || "https://www.google.com");

    // When the renderer uses `<webview>`, `<webview src=...>` handles the initial
    // load; only trigger an explicit navigate if a different URL is requested later.
    if (this.guestWc && !this.guestWc.isDestroyed()) {
      const currentWcUrl = this.guestWc.getURL();
      if (url && currentWcUrl && currentWcUrl !== "about:blank" && targetUrl !== currentWcUrl && targetUrl !== this.currentUrl) {
        void this.navigate(targetUrl);
      }
      return this.getState();
    }

    this.currentUrl = targetUrl;
    return this.getState();
  }

  detach(): void {
    if (!this.attached) return;
    if (this.win && !this.win.isDestroyed() && this.view) {
      try {
        this.view.setVisible(false);
        this.view.setBounds({ x: -10000, y: -10000, width: 0, height: 0 });
        this.win.contentView.removeChildView(this.view);
      } catch {
        // Ignore
      }
    }
    this.attached = false;
  }

  setBounds(bounds: BrowserBounds): void {
    this.lastBounds = bounds;
    if (this.guestWc || !this.view || !this.attached) return;
    this.view.setBounds(this.toDipBounds(bounds));
  }

  async navigate(rawUrl: string): Promise<BrowserState> {
    const url = normalizeUrl(rawUrl);
    this.currentUrl = url;
    const wc = this.activeWebContents();
    if (!wc) {
      return this.getState();
    }

    const state = getAppState();
    if (state) {
      const store = new WebStore(state.root);
      const meter = new UsageMeter(store);
      const [allowed, reason] = store.restrictions().check(url, meter.today());
      if (!allowed) {
        await wc.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(blockedPageHtml(url, reason))}`).catch(() => undefined);
        return this.getState();
      }
    }
    await wc.loadURL(url).catch((err: any) => {
      if (err?.errno === -3 || String(err?.message || "").includes("ERR_ABORTED")) return;
      console.warn("[browserManager] loadURL warning:", err?.message || err);
    });
    return this.getState();
  }

  action(act: "back" | "forward" | "reload" | "stop"): BrowserState {
    const wc = this.activeWebContents();
    if (wc && !wc.isDestroyed()) {
      const canBack = wc.navigationHistory ? wc.navigationHistory.canGoBack() : wc.canGoBack();
      const canFwd = wc.navigationHistory ? wc.navigationHistory.canGoForward() : wc.canGoForward();
      if (act === "back" && canBack) wc.goBack();
      else if (act === "forward" && canFwd) wc.goForward();
      else if (act === "reload") wc.reload();
      else if (act === "stop") wc.stop();
    }
    return this.getState();
  }

  destroy() {
    if (this.meterTimer) {
      clearInterval(this.meterTimer);
      this.meterTimer = null;
    }
    this.detach();
    this.guestWc = null;
    if (this.view) {
      try {
        this.view.webContents.close();
      } catch {}
      this.view = null;
    }
    this.currentUrl = "https://www.google.com";
    this.currentTitle = "";
    this.isLoading = false;
  }
}

export const browserManager = new BrowserManager();
