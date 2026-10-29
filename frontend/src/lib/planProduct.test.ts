import { describe, expect, it } from "vitest";
import { monthProduct, productStage, spreadTopics } from "./planProduct";

describe("planProduct", () => {
  it("el producto crece mes a mes y pasado el sexto sigue ampliándose", () => {
    expect(productStage(0).title).toMatch(/primera versión/);
    expect(productStage(5).title).toMatch(/portafolio/);
    expect(productStage(7).title).toMatch(/Ampliación del producto \(mes 8\)/);
  });
  it("reparte los temas del mes entre los hitos sin perder ninguno", () => {
    const topics = ["a", "b", "c", "d", "e", "f", "g"];
    const s = spreadTopics(topics, 4);
    expect(s.flat()).toEqual(topics);
    expect(s.every((x) => x.length >= 1)).toBe(true);
  });
  it("un hito por semana, también con meses de 3 o de 5 semanas", () => {
    expect(monthProduct(0, 4, []).milestones).toHaveLength(4);
    const three = monthProduct(1, 3, []);
    expect(three.milestones).toHaveLength(3);
    expect(three.milestones[2]!.title).toContain(" + ");
    const five = monthProduct(1, 5, []);
    expect(five.milestones).toHaveLength(5);
    expect(five.milestones[4]!.title).toMatch(/Pulido y pruebas/);
  });
});
