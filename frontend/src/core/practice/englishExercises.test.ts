import { describe, expect, it } from "vitest";
import { buildEnglishExercisePrompt, cefrOf, formatEnglishExerciseNote } from "./englishExercises";
import { parseExercise } from "./exerciseNote";
import { buildGradingMessages } from "./grading";
import { buildExerciseGenerationPrompt, formatExerciseNote, parseExerciseArray } from "./sessionBuilder";
import { createDefaultTopicManifest } from "./topic";

const manifest = (branch: string) => createDefaultTopicManifest(`Inglés 1/${branch}/1.1 Tema`, "1.1 Tema", "english", []);
const grammar = manifest("1 Gramática");
const listening = manifest("4 Escucha");
const speaking = manifest("5 Habla");
const fields = { title: "Ej", statement: "Do this.", hints: ["Fíjate en el verbo"], solution: "Answer", rubric: ["Correcto", "Natural"] };

describe("English exercise prompts follow the exercise's branch", () => {
  it("carries the discipline framing, the CEFR level, the skill and the Spanish/English split", () => {
    const [system, user] = buildExerciseGenerationPrompt(grammar, [], "gr_cloze", 2, "no_help", 3);
    expect(system!.content).toContain("Skill to train: gr_cloze");
    expect(system!.content).toContain("Target CEFR level: B1");
    expect(system!.content).toContain("Spanish speaker");
    expect(system!.content).toContain("in English at the target level");
    expect(system!.content).not.toContain("theorems");
    expect(user!.content).toContain("Generate 3 exercises");
  });

  it("an audio skill hides its text: the statement must not contain it and audio_text is requested", () => {
    const [system] = buildEnglishExercisePrompt(listening, [], "ls_dictation", 1, "no_help", 2);
    expect(system!.content).toContain("audio_text");
    expect(system!.content).toContain("must NOT contain the audio text");
    expect(system!.content).toContain("played aloud by the app"); // the listening discipline framing
    const [plain] = buildEnglishExercisePrompt(grammar, [], "gr_cloze", 1, "no_help", 1);
    expect(plain!.content).not.toContain('"audio_text"');
  });

  it("speaking says there is no speech recognition and that the typed text is what is judged", () => {
    const [system] = buildEnglishExercisePrompt(speaking, [], "sp_guided", 2, "helper", 2);
    expect(system!.content).toContain("NO speech recognition");
    expect(system!.content).toContain("no speech recognition"); // the speaking discipline framing
  });

  it("a skill that must go without help never gets helper hints, and a word bank / error record reach the prompt", () => {
    const [system, user] = buildEnglishExercisePrompt(grammar, [], "vc_recall", 1, "helper", 2, ["Confunde make y do"], ["reliable — fiable", "though — aunque"]);
    expect(system!.content).toContain("Assistance is NO HELP");
    expect(user!.content).toContain("WORD BANK");
    expect(user!.content).toContain("reliable — fiable");
    expect(user!.content).toContain("Confunde make y do");
  });

  it("maps difficulty to CEFR", () => {
    expect([1, 2, 3].map((d) => cefrOf(d as 1 | 2 | 3))).toEqual(["A2", "B1", "B2"]);
  });
});

describe("English exercise notes", () => {
  it("record the discipline of the skill's branch, the CEFR level and the branch, and parse back", () => {
    const note = formatExerciseNote(grammar, "gr_cloze", 2, "no_help", fields);
    expect(note).toContain("discipline: english_grammar");
    expect(note).toContain("level: B1");
    expect(note).toContain("branch: grammar");
    const ex = parseExercise(note, "/tmp/x.md");
    expect(ex).toMatchObject({ subject: "english", mode: "gr_cloze", discipline: "english_grammar", level: "B1" });
    expect(ex.audio_text).toBe("");
  });

  it("an audio exercise keeps its text in a separate section the parser exposes and the statement never shows", () => {
    const note = formatEnglishExerciseNote(listening, "ls_dictation", 1, "helper", { ...fields, audio_text: "The meeting starts at nine." });
    expect(note).toContain("## Texto del audio\nThe meeting starts at nine.");
    expect(note).toContain("assistance: nohelp"); // dictation is always without help
    const ex = parseExercise(note, "/tmp/y.md");
    expect(ex.discipline).toBe("english_listening");
    expect(ex.audio_text).toBe("The meeting starts at nine.");
    expect(ex.statement).toBe("Do this.");
  });

  it("the parser keeps audio_text from the model's JSON", () => {
    const list = parseExerciseArray('[{"title":"T","statement":"S","audio_text":" Hello there. ","solution":"Hello there."}]');
    expect(list[0]!.audio_text).toBe("Hello there.");
  });
});

describe("grading English", () => {
  it("frames the judge with the branch's discipline and CEFR level, never with maths", () => {
    const note = formatExerciseNote(grammar, "gr_transform", 3, "no_help", fields);
    const ex = parseExercise(note, "/tmp/z.md");
    const [system] = buildGradingMessages(ex, "some answer");
    expect(system!.content).toContain("Discipline: english_grammar");
    expect(system!.content).toContain("Target CEFR level: B2");
    expect(system!.content).not.toContain("math_general");
    expect(system!.content).toContain("transform them");
  });
});
