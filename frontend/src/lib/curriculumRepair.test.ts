import { describe, expect, it } from "vitest";
import { repairTopicType } from "./curriculumRepair";

describe("repairTopicType", () => {
  it("cambia un tipo inventado por mixed y no toca nada más", () => {
    const src = "---\nid: x\ntopic_type: reference\ndifficulty: 1\n---\n\n# T\n\ntopic_type: reference (en el cuerpo no)\n";
    const r = repairTopicType(src);
    expect(r.changed).toBe(true);
    expect(r.text).toBe("---\nid: x\ntopic_type: mixed\ndifficulty: 1\n---\n\n# T\n\ntopic_type: reference (en el cuerpo no)\n");
  });
  it("deja los tipos válidos (también entre comillas) y lo que no tiene frontmatter", () => {
    for (const t of ["theoretical", "procedural", "mixed", '"mixed"']) expect(repairTopicType(`---\ntopic_type: ${t}\n---\n`).changed).toBe(false);
    expect(repairTopicType("# solo cuerpo").changed).toBe(false);
  });
});
