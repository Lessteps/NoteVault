// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BodyProfile } from "./BodyProfile";
import { useExercise } from "../../store/exercise";

function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return {
    host,
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

describe("BodyProfile component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useExercise.setState({
      profile: {
        goal: "hipertrofia",
        goal_note: "Enfocado en volumen muscular",
        weight_history: [
          { date: "2026-05-01", weight: 75.0 },
          { date: "2026-05-15", weight: 76.2 },
        ],
      },
    });
  });

  it("renderiza el objetivo activo y la nota", () => {
    const { host, cleanup } = mount(<BodyProfile />);
    try {
      expect(host.textContent).toContain("Para qué estás entrenando");
      expect(host.textContent).toContain("Hipertrofia");
      expect(host.textContent).toContain("Enfocado en volumen muscular");
    } finally {
      cleanup();
    }
  });

  it("renderiza el peso actual y la variación", () => {
    const { host, cleanup } = mount(<BodyProfile />);
    try {
      expect(host.textContent).toContain("Peso actual");
      expect(host.textContent).toContain("76.2 kg");
      expect(host.textContent).toContain("+1.2 kg");
      expect(host.textContent).toContain("Historial (2)");
    } finally {
      cleanup();
    }
  });

  it("permite seleccionar otro objetivo", async () => {
    const saveSpy = vi.fn().mockResolvedValue(undefined);
    useExercise.setState({ saveProfile: saveSpy as any });

    const { host, cleanup } = mount(<BodyProfile />);
    try {
      const fuerzaBtn = [...host.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Fuerza / Potencia"),
      );
      expect(fuerzaBtn).toBeDefined();

      await act(async () => {
        fuerzaBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });

      expect(saveSpy).toHaveBeenCalledWith({ goal: "fuerza" });
    } finally {
      cleanup();
    }
  });
});
