import { WebContentsView, BrowserWindow, net, shell } from "electron";
import { blockedPageHtml, hostOf, normalizeUrl, UsageMeter, WebStore } from "../src/core/webStore.js";
import { getAppState } from "../src/api/registry.js";

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

export class BrowserManager {
  private view: WebContentsView | null = null;
  private win: BrowserWindow | null = null;
  private attached = false;
  private currentUrl = "https://www.google.com";
  private currentTitle = "";
  private isLoading = false;
  private currentFavicon = "";
  private meterTimer: NodeJS.Timeout | null = null;

  setWindow(win: BrowserWindow) {
    this.win = win;
  }

  private ensureView(): WebContentsView {
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

    const wc = this.view.webContents;

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
      this.currentUrl = url;
      this.currentTitle = wc.getTitle();
      this.recordHistory(url, this.currentTitle);
      this.notifyState();
    });

    wc.on("did-navigate-in-page", (_e, url) => {
      this.currentUrl = url;
      this.notifyState();
    });

    wc.on("page-title-updated", (_e, title) => {
      this.currentTitle = title;
      this.notifyState();
    });

    // The renderer cannot load remote images, so the icon is fetched here and
    // handed over as a data URL; the rail falls back to a monogram without it.
    wc.on("page-favicon-updated", (_e, favicons) => {
      const icon = favicons[0];
      if (icon) void this.loadFavicon(icon);
    });

    wc.setWindowOpenHandler(({ url }) => {
      // Content rules check
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
      const state = getAppState();
      if (!state) return;
      const store = new WebStore(state.root);
      const meter = new UsageMeter(store);
      const [allowed, reason] = store.restrictions().check(url, meter.today());
      if (!allowed) {
        e.preventDefault();
        void wc.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(blockedPageHtml(url, reason))}`);
      }
    };

    wc.on("will-navigate", (e, url) => checkNavigation(e, url));
    wc.on("will-redirect", (e, url) => checkNavigation(e, url));

    // Meter tick every second
    this.meterTimer = setInterval(() => {
      if (!this.attached || !this.view) return;
      const url = this.view.webContents.getURL();
      if (url.startsWith("http://") || url.startsWith("https://")) {
        const state = getAppState();
        if (state) {
          const store = new WebStore(state.root);
          const meter = new UsageMeter(store);
          meter.tick(hostOf(url), 1);
        }
      }
    }, 1000);

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
    const wc = this.view?.webContents;
    return {
      url: wc?.getURL() || this.currentUrl,
      title: wc?.getTitle() || this.currentTitle,
      canGoBack: wc?.canGoBack() ?? false,
      canGoForward: wc?.canGoForward() ?? false,
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
    const view = this.ensureView();
    if (!this.attached) {
      try {
        this.win.contentView.addChildView(view);
      } catch {
        // Ignore if already child
      }
      this.attached = true;
    }
    view.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(0, Math.round(bounds.width)),
      height: Math.max(0, Math.round(bounds.height)),
    });
    view.setVisible(true);

    const currentWcUrl = view.webContents.getURL();
    // If the webContents has never loaded a page (or is blank), navigate to initial URL
    if (!currentWcUrl || currentWcUrl === "about:blank") {
      void this.navigate(url || this.currentUrl || "https://www.google.com");
    } else if (url && url !== currentWcUrl && url !== "https://www.google.com" && url !== this.currentUrl) {
      // Explicit new target requested (e.g. user clicked bookmark or search)
      void this.navigate(url);
    }
    return this.getState();
  }

  detach(): void {
    if (!this.win || !this.view || !this.attached) return;
    try {
      this.view.setVisible(false);
      this.view.setBounds({ x: -10000, y: -10000, width: 0, height: 0 });
      this.win.contentView.removeChildView(this.view);
    } catch {
      // Ignore
    }
    this.attached = false;
  }

  setBounds(bounds: BrowserBounds): void {
    if (!this.view || !this.attached) return;
    this.view.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(0, Math.round(bounds.width)),
      height: Math.max(0, Math.round(bounds.height)),
    });
  }

  async navigate(rawUrl: string): Promise<BrowserState> {
    const view = this.ensureView();
    const url = normalizeUrl(rawUrl);
    const state = getAppState();
    if (state) {
      const store = new WebStore(state.root);
      const meter = new UsageMeter(store);
      const [allowed, reason] = store.restrictions().check(url, meter.today());
      if (!allowed) {
        await view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(blockedPageHtml(url, reason))}`);
        return this.getState();
      }
    }
    await view.webContents.loadURL(url);
    return this.getState();
  }

  action(act: "back" | "forward" | "reload" | "stop"): BrowserState {
    const wc = this.view?.webContents;
    if (wc) {
      if (act === "back" && wc.canGoBack()) wc.goBack();
      else if (act === "forward" && wc.canGoForward()) wc.goForward();
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
