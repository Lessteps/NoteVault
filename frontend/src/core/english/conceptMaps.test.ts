import { describe, expect, it } from "vitest";
import { buildTenseMapCanvas, buildWordFamilyCanvas } from "./conceptMaps";

function checkMap(m: ReturnType<typeof buildTenseMapCanvas>) {
  const ids = new Set(m.nodes.map((n) => n.id));
  expect(ids.size).toBe(m.nodes.length);
  for (const e of m.edges) {
    expect(ids.has(e.fromNode) && ids.has(e.toNode)).toBe(true);
    expect(e.label.trim().length).toBeGreaterThan(3); // every arrow says why
  }
  const groups = m.nodes.filter((n) => n.type === "group");
  const cards = m.nodes.filter((n) => n.type !== "group");
  for (const c of cards) {
    const g = groups.find((g) => c.x >= g.x && c.x + c.width <= g.x + g.width && c.y >= g.y && c.y + c.height <= g.y + g.height);
    expect(g, `${c.id} inside a group`).toBeTruthy();
  }
  for (const a of cards) {
    for (const b of cards) {
      if (a.id < b.id) {
        const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        expect(apart, `${a.id}/${b.id} overlap`).toBe(true);
      }
    }
  }
}

describe("English concept maps", () => {
  it("draws the tenses on a past / present / future timeline with labelled arrows", () => {
    const m = buildTenseMapCanvas();
    expect(m.nodes.filter((n) => n.type === "group").map((g) => g.label)).toEqual(["Pasado", "Presente", "Futuro"]);
    expect(m.nodes.filter((n) => n.type === "text")).toHaveLength(9);
    checkMap(m);
  });

  it("draws one group per word family with the suffix on every arrow", () => {
    const m = buildWordFamilyCanvas();
    expect(m.nodes.filter((n) => n.type === "group")).toHaveLength(3);
    expect(m.edges.some((e) => e.label.includes("-ly"))).toBe(true);
    checkMap(m);
    checkMap(buildWordFamilyCanvas([{ root: "x", pos: "verbo", forms: [{ word: "xs", pos: "sustantivo", change: "+ -s (plural)" }] }]));
  });
});
