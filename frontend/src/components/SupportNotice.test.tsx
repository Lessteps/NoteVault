// @vitest-environment jsdom

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const openExternal = vi.fn(async (_url: string) => ({ ok: true }));
vi.mock("../lib/bridge", () => ({ api: { openExternal: (u: string) => openExternal(u) } }));

import { SupportNotice } from "./SupportNotice";
import { SUPPORT_KEY, PAYPAL_URL, SUPPORT_URL } from "../lib/supportNotice";
import { useApp } from "../store/app";

let container: HTMLDivElement;
let root: Root;

const info = (sandbox = false) =>
  ({ api_version: 1, vault_name: "v", vault_path: "/v", theme: "dark", sandbox }) as never;

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<SupportNotice />));
}

const notice = () => container.querySelector("[data-testid=support-notice]");
const wait = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));
const button = (text: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  openExternal.mockClear();
  useApp.setState({ info: info() });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("SupportNotice", () => {
  it("sale unos segundos después de abrir, sin bloquear, y recuerda que ya salió", async () => {
    mount();
    expect(notice()).toBeNull();
    await wait(4100);
    expect(notice()).not.toBeNull();
    expect(container.textContent).toContain("Somos estudiantes");
    expect(JSON.parse(localStorage.getItem(SUPPORT_KEY)!).lastShown).toBeTypeOf("number");
  });

  it("no sale si ya salió hace poco", async () => {
    localStorage.setItem(SUPPORT_KEY, JSON.stringify({ lastShown: Date.now() }));
    mount();
    await wait(5000);
    expect(notice()).toBeNull();
  });

  it("no sale con HOME aislado (pruebas y capturas)", async () => {
    useApp.setState({ info: info(true) });
    mount();
    await wait(5000);
    expect(notice()).toBeNull();
  });

  it("«Apoyar con PayPal» y «Otras formas» abren el enlace y cierran el aviso", async () => {
    mount();
    await wait(4100);
    await act(async () => button("Apoyar con PayPal").click());
    expect(openExternal).toHaveBeenCalledWith(PAYPAL_URL);
    expect(notice()).toBeNull();
  });

  it("«Otras formas» lleva a la página de apoyo", async () => {
    mount();
    await wait(4100);
    await act(async () => button("Otras formas").click());
    expect(openExternal).toHaveBeenCalledWith(SUPPORT_URL);
  });

  it("la × cierra sin apagarlo y «No volver a mostrar» lo apaga", async () => {
    mount();
    await wait(4100);
    await act(async () => (container.querySelector("button[aria-label=Cerrar]") as HTMLButtonElement).click());
    expect(notice()).toBeNull();
    expect(JSON.parse(localStorage.getItem(SUPPORT_KEY)!).never).toBeUndefined();

    act(() => root.unmount());
    container.remove();
    localStorage.setItem(SUPPORT_KEY, JSON.stringify({ lastShown: 0 }));
    mount();
    await wait(4100);
    await act(async () => button("No volver a mostrar").click());
    expect(JSON.parse(localStorage.getItem(SUPPORT_KEY)!).never).toBe(true);
  });
});
