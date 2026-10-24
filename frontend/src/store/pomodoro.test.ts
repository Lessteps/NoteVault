// Asignar una fila del Mentor al Pomodoro con el reloj parado deja el bloque con su tipo de trabajo y su área; con un bloque en marcha no los cambia.

import { beforeEach, describe, expect, it } from "vitest";
import { idlePomodoro, mentorAssignment } from "../lib/pomodoro";
import { usePomodoro } from "./pomodoro";

beforeEach(() => usePomodoro.setState({ p: idlePomodoro() }));

describe("usePomodoro.assignTopic desde el Mentor", () => {
  it("con el reloj parado rellena el tipo y el área del bloque", () => {
    usePomodoro.getState().assignTopic(mentorAssignment("practice", { folder: "t1", title: "T1", areaKey: "backend" }));
    expect(usePomodoro.getState().p).toMatchObject({ work: "practice", areaKey: "backend" });
    usePomodoro.getState().assignTopic(mentorAssignment("review", { folder: "t2", title: "T2", areaKey: "frontend" }));
    expect(usePomodoro.getState().p).toMatchObject({ work: "review", areaKey: "frontend" });
    expect(usePomodoro.getState().p.assignedTopics.map((t) => t.folder)).toEqual(["t1", "t2"]);
  });

  it("una asignación sin tipo ni área (la de siempre) no toca el bloque", () => {
    usePomodoro.getState().assignTopic({ folder: "t1", title: "T1" });
    expect(usePomodoro.getState().p).toMatchObject({ work: null, areaKey: "" });
  });

  it("con un bloque en marcha asigna el tema pero no cambia su tipo ni su área", () => {
    usePomodoro.getState().start("p", "backend", "theory");
    usePomodoro.getState().assignTopic(mentorAssignment("project", { folder: "project:daily:x", title: "P", areaKey: "frontend" }));
    expect(usePomodoro.getState().p).toMatchObject({ work: "theory", areaKey: "backend" });
    expect(usePomodoro.getState().p.assignedTopics).toHaveLength(1);
  });

  it("reasignar el mismo tema desde otro punto actualiza su tipo", () => {
    usePomodoro.getState().assignTopic(mentorAssignment("theory", { folder: "t1", title: "T1", areaKey: "backend" }));
    usePomodoro.getState().assignTopic(mentorAssignment("practice", { folder: "t1", title: "T1", areaKey: "backend" }));
    expect(usePomodoro.getState().p.assignedTopics).toHaveLength(1);
    expect(usePomodoro.getState().p).toMatchObject({ work: "practice" });
  });
});
