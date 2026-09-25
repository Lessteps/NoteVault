import { describe, expect, it } from "vitest";
import { parseExercise } from "../practice/exerciseNote.js";
import { buildMinedNote, minedNoteId } from "./mining.js";

describe("sentence mining", () => {
  it("builds a translate note that parses as a practice exercise", () => {
    const text = buildMinedNote('No, it\'s not: "really" a big deal.', {
      media_rel: "Inglés/Películas/Film.mp4",
      seconds: 83.4,
      reference_es: "No es para tanto.",
    });
    const ex = parseExercise(text, "x.md");
    expect(ex.frontmatter.type).toBe("exercise");
    expect(ex.subject).toBe("english");
    expect(ex.discipline).toBe("english_vocabulary");
    expect(ex.mode).toBe("translate");
    expect(ex.level).toBe("B1");
    expect(ex.note_id).toBe("en.mining.film.83400");
    expect(ex.statement).toContain("[01:23](nv://media?file=Ingl%C3%A9s/Pel%C3%ADculas/Film.mp4&t=83.4)");
    expect(ex.statement).toContain("No, it's not");
    expect(ex.hints.length).toBe(2);
    expect(ex.rubric.length).toBe(3);
    expect(ex.solution).toContain("**Traducción:**");
    expect(ex.solution).toContain("No es para tanto.");
    expect(ex.title.startsWith("No, it's not")).toBe(true);
  });

  it("builds a cloze note", () => {
    const text = buildMinedNote("I'm looking forward to seeing you.", {
      media_rel: "f.mp4",
      seconds: 5,
      mode: "cloze",
      target: "looking forward",
      level: "c1",
    });
    const ex = parseExercise(text);
    expect(ex.mode).toBe("cloze");
    expect(ex.level).toBe("C1");
    expect(ex.statement).toContain("I'm _____ to seeing you.");
    expect(ex.solution).toContain("**looking forward**");
  });

  it("computes a stable mined note id", () => {
    expect(minedNoteId("Inglés/Películas/Film.mp4", 83.4)).toBe("en.mining.film.83400");
  });
});
