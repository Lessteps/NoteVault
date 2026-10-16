import { describe, expect, it } from "vitest";
import { buildCoachSystemPrompt, type CoachContextData } from "./exerciseCoachPrompt.js";

describe("exerciseCoachPrompt", () => {
  it("genera un prompt con el rol de coach y contexto atlético completo", () => {
    const data: CoachContextData = {
      profile: {
        goal: "hipertrofia",
        goal_note: "Enfocado en espalda y hombros",
        weight_history: [
          { date: "2026-05-01", weight: 75.0 },
          { date: "2026-05-15", weight: 75.8 },
        ],
      },
      exercises: [
        { day: "lunes", name: "Press de banca", series_reps: "4x8-10", rest: "90s" },
        { day: "lunes", name: "Remo con barra", series_reps: "4x10", rest: "90s" },
        { day: "martes", name: "Sentadilla libre", series_reps: "3x6-8", rest: "120s" },
      ],
      streak: 5,
    };

    const prompt = buildCoachSystemPrompt(data);

    expect(prompt).toContain("Coach de Entrenamiento de NoteVault");
    expect(prompt).toContain("Hipertrofia");
    expect(prompt).toContain("Enfocado en espalda y hombros");
    expect(prompt).toContain("75.8 kg");
    expect(prompt).toContain("+0.8 kg");
    expect(prompt).toContain("Press de banca");
    expect(prompt).toContain("Sentadilla libre");
    expect(prompt).toContain("5 días seguidos");
  });

  it("maneja de forma segura un perfil sin pesajes ni rutinas", () => {
    const data: CoachContextData = {
      profile: {
        goal: "salud",
        goal_note: "",
        weight_history: [],
      },
      exercises: [],
    };

    const prompt = buildCoachSystemPrompt(data);

    expect(prompt).toContain("Coach de Entrenamiento de NoteVault");
    expect(prompt).toContain("Salud general");
    expect(prompt).toContain("Sin pesajes registrados todavía");
    expect(prompt).toContain("Sin ejercicios configurados");
  });

  it("incluye el progreso profundo de cargas recientes y 1RM", () => {
    const data: CoachContextData = {
      profile: { goal: "fuerza", goal_note: "", weight_history: [] },
      exercises: [{ day: "lunes", name: "Press de banca" }],
      recentPerformances: [
        {
          exerciseId: "lunes_pressdebanca",
          name: "Press de banca",
          date: "2026-10-10",
          weight: 80,
          reps: 8,
          e1rm: 101.3,
        },
      ],
      recentCompletedSessions: 4,
    };

    const prompt = buildCoachSystemPrompt(data);

    expect(prompt).toContain("PROGRESO Y CARGAS REALES");
    expect(prompt).toContain("4 sesiones de entrenamiento registradas");
    expect(prompt).toContain("Press de banca: 80 kg x 8 reps");
    expect(prompt).toContain("1RM estimado: ~101.3 kg");
  });

  it("incluye el resumen del catálogo de biblioteca", () => {
    const data: CoachContextData = {
      profile: { goal: "hipertrofia", goal_note: "", weight_history: [] },
      exercises: [],
      librarySummary: [
        "Catálogo Workout Guide con 302 ejercicios disponibles (pecho, espalda, hombros, piernas, brazos, core).",
        "3 ejercicios personalizados propios en el vault.",
      ],
    };

    const prompt = buildCoachSystemPrompt(data);

    expect(prompt).toContain("BIBLIOTECA DE EJERCICIOS");
    expect(prompt).toContain("302 ejercicios disponibles");
    expect(prompt).toContain("3 ejercicios personalizados propios");
  });

  it("incluye limitaciones físicas y directivas de salud cuando existen", () => {
    const data: CoachContextData = {
      profile: {
        goal: "hipertrofia",
        goal_note: "",
        weight_history: [],
        health_limitations: "Hernia discal lumbar L5-S1, molestia en hombro izquierdo",
      },
      exercises: [],
    };

    const prompt = buildCoachSystemPrompt(data);

    expect(prompt).toContain("CONDICIONES DE SALUD, LESIONES Y LIMITACIONES FÍSICAS");
    expect(prompt).toContain("Hernia discal lumbar L5-S1, molestia en hombro izquierdo");
    expect(prompt).toContain("REGLA DE ORO DE SEGURIDAD");
  });

  it("incluye el sexo biológico y la edad en el perfil del prompt", () => {
    const data: CoachContextData = {
      profile: {
        goal: "hipertrofia",
        goal_note: "",
        weight_history: [],
        gender: "hombre",
        age: 28,
      },
      exercises: [],
    };

    const prompt = buildCoachSystemPrompt(data);

    expect(prompt).toContain("Sexo: Hombre");
    expect(prompt).toContain("Edad: 28 años");
  });

  it("incluye el desglose de volumen muscular semanal y referencias científicas de hipertrofia", () => {
    const data: CoachContextData = {
      profile: {
        goal: "hipertrofia",
        goal_note: "",
        weight_history: [],
      },
      exercises: [],
      weeklyVolume: [
        { group: "Pecho", plannedSets: 14, completedSets: 8, levelLabel: "Óptimo hipertrofia (10-20 series)" },
        { group: "Espalda", plannedSets: 12, completedSets: 4, levelLabel: "Óptimo hipertrofia (10-20 series)" },
        { group: "Piernas", plannedSets: 4, completedSets: 0, levelLabel: "Mantenimiento (<6 series)" },
      ],
    };

    const prompt = buildCoachSystemPrompt(data);

    expect(prompt).toContain("DISTRIBUCIÓN Y VOLUMEN MUSCULAR SEMANAL");
    expect(prompt).toContain("Pecho: 14 series planificadas · hechas: 8 → Óptimo hipertrofia");
    expect(prompt).toContain("Piernas: 4 series planificadas · hechas: 0 → Mantenimiento");
    expect(prompt).toContain("Referencia científica de hipertrofia");
  });
});
