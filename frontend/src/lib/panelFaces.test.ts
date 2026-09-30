// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

(window as unknown as { nv: unknown }).nv = { invoke: vi.fn(async () => []) };

import { useApp } from "../store/app";
import { useAssistant } from "../store/assistant";
import { useReviewPanel } from "../components/study/ReviewPanel";
import { isFaceOpen, toggleFace } from "./panelFaces";

beforeEach(() => {
  useApp.setState({ inkDraft: null, inspectorOpen: false, active: null });
  useAssistant.setState({ open: false });
  useReviewPanel.setState({ open: false });
});

describe("panel faces", () => {
  it("opening one closes every other, drawing pad included", () => {
    toggleFace("ink");
    expect(isFaceOpen("ink")).toBe(true);
    toggleFace("review");
    expect(isFaceOpen("review")).toBe(true);
    expect(isFaceOpen("ink")).toBe(false);
    toggleFace("assistant");
    expect(isFaceOpen("review")).toBe(false);
    expect(isFaceOpen("assistant")).toBe(true);
  });

  it("pressing the open one again closes it", () => {
    toggleFace("ink");
    toggleFace("ink");
    expect(isFaceOpen("ink")).toBe(false);
    toggleFace("assistant");
    toggleFace("assistant");
    expect(isFaceOpen("assistant")).toBe(false);
  });
});
