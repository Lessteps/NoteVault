import { WebContentsView, BrowserWindow } from "electron";
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
}

export class BrowserManager {
  private view: WebContentsView | null = null;
  private win: BrowserWindow | null = null;
  private attached = false;
  private currentUrl = "https://www.google.com";
  private currentTitle = "";
  private isLoading = false;
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

    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) {
        void this.navigate(url);
      }
      return { action: "deny" };
    });

    const checkNavigation = (e: Electron.Event, url: string) => {
      if (!url.startsWith("http://") && !url.startsWith("https://")) return;
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
    };
  }

  attach(bounds: BrowserBounds, url?: string): BrowserState {
    if (!this.win || this.win.isDestroyed()) return this.getState();
    const view = this.ensureView();
    if (!this.attached) {
      this.win.contentView.addChildView(view);
      this.attached = true;
    }
    view.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(0, Math.round(bounds.width)),
      height: Math.max(0, Math.round(bounds.height)),
    });
    if (url && url !== view.webContents.getURL()) {
      void this.navigate(url);
    } else if (!view.webContents.getURL()) {
      void this.navigate(this.currentUrl);
    }
    return this.getState();
  }

  detach(): void {
    if (!this.win || !this.view || !this.attached) return;
    try {
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
    this.view = null;
  }
}

export const browserManager = new BrowserManager();
