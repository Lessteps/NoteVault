// @vitest-environment jsdom
// Abrir una carpeta/tema es de SOLO LECTURA: si falta su vista se pregunta; sin permiso no se escribe nada.

import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/bridge";
import { useApp } from "../../store/app";
import { viewWithConsent } from "./ensureView";

const MISSING = { ok: false, kind: "practica" as const, missing: true, path: "M/1/1.1 X/1.1 X.practica.md", created: [], errors: [] };
afterEach(() => vi.restoreAllMocks());

describe("viewWithConsent", () => {
  it("una vista que existe se abre sin preguntar ni crear nada", async () => {
    const ensure = vi.spyOn(api, "studyViewEnsure").mockResolvedValue({ ...MISSING, ok: true, missing: false } as never);
    const confirm = vi.spyOn(window, "confirm");
    expect((await viewWithConsent("M/1/1.1 X"))?.path).toBe(MISSING.path);
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(ensure).toHaveBeenCalledWith("M/1/1.1 X");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("si falta y la persona dice que no, NO se crea nada", async () => {
    const ensure = vi.spyOn(api, "studyViewEnsure").mockResolvedValue(MISSING as never);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    expect(await viewWithConsent("M/1/1.1 X")).toBeNull();
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(ensure).not.toHaveBeenCalledWith(expect.anything(), true);
  });

  it("sin permiso para preguntar (clic en una carpeta) tampoco crea ni pregunta", async () => {
    const ensure = vi.spyOn(api, "studyViewEnsure").mockResolvedValue(MISSING as never);
    const confirm = vi.spyOn(window, "confirm");
    expect(await viewWithConsent("M/1/1.1 X", false)).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
    expect(ensure).toHaveBeenCalledTimes(1);
  });

  it("si la persona acepta, crea con create=true y avisa de cuántos archivos se crearon", async () => {
    const ensure = vi.spyOn(api, "studyViewEnsure").mockResolvedValueOnce(MISSING as never).mockResolvedValueOnce({ ...MISSING, ok: true, missing: false, created: [MISSING.path] } as never);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const toast = vi.spyOn(useApp.getState(), "toast").mockImplementation(() => undefined);
    expect((await viewWithConsent("M/1/1.1 X"))?.ok).toBe(true);
    expect(ensure).toHaveBeenLastCalledWith("M/1/1.1 X", true);
    expect(toast).toHaveBeenCalledWith("info", expect.stringContaining("creó 1 archivo"));
  });
});
