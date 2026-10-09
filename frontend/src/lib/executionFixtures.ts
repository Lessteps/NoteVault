// Datos de ejemplo para los tests de «Ejecutar plan» (informe con temas en distintos estados de diseño). Solo lo importan los tests.

import { areaFiles } from "./areaPracticeSystem";
import { buildExecutionReport, progressOf, type ExecutionScope, type ExecutionState, type ReportInput, type TaskState } from "./planExecution";
import { evaluateTopicDesign, type TopicDesign, type TopicDesignInput } from "./topicDesign";

export { buildExecutionReport, progressOf };
export type { ExecutionScope, ExecutionState, TaskState };

const THEORY_OK = "---\ntopic_type: mixed\n---\n## Requires\n## Explanation\n### What it is\n### Mental model\n## Examples\n### Example 1\n### Example 2\n### Example 3\n## Common mistakes\n### Mistake 1\n### Mistake 2\n### Mistake 3\n### Mistake 4\n## Connections\n## Cards\n### 1 · a\n### 2 · a\n### 3 · a\n### 4 · a\n### 5 · a\n### 6 · a\n";
const MAN = { topicType: "mixed", skills: ["implement", "pg_true_false"] };
const F = (n: string) => `Programación/4 Backend/${n}`;
const design = (folder: string, o: Partial<TopicDesignInput>): TopicDesign => evaluateTopicDesign({ folder, title: folder.split("/").pop()!, subject: "programming", exists: true, files: [], exercises: [], ...o });
const COMPLETE = (folder: string): TopicDesign =>
  design(folder, { files: ["T.md", "T — mapa.canvas", "T.practica.md"], theoryText: THEORY_OK, manifest: MAN, exercises: [1, 2, 3].flatMap((d) => ["implement", "pg_true_false"].map((skill) => ({ skill, difficulty: d }))) });

/** Un plan de Backend con tres temas: uno sin canvas ni ejercicios (semana 1), uno con la nota mal estructurada (semana 2) y uno sin teoría (semana 3). */
export function newReportDefaults(o: { designsOf?: "complete" } = {}): ReportInput {
  const topics = [
    { folder: F("4.2 SinCanvas"), title: "4.2 SinCanvas", areaKey: "backend", area: "Backend", week: 1 },
    { folder: F("4.4 Defectos"), title: "4.4 Defectos", areaKey: "backend", area: "Backend", week: 2 },
    { folder: F("4.3 SinTeoria"), title: "4.3 SinTeoria", areaKey: "backend", area: "Backend", week: 3 },
  ];
  const designs = new Map<string, TopicDesign>(
    o.designsOf === "complete"
      ? topics.map((t) => [t.folder, COMPLETE(t.folder)] as const)
      : [
          [topics[0]!.folder, design(topics[0]!.folder, { files: ["T.md", "T.practica.md"], theoryText: THEORY_OK, manifest: MAN })],
          [topics[1]!.folder, design(topics[1]!.folder, { files: ["B.md", "B — mapa.canvas", "B.practica.md"], theoryText: "# B\n\n## Requires\n", manifest: MAN, exercises: [{ skill: "implement", difficulty: 1 }, { skill: "pg_true_false", difficulty: 1 }] })],
          [topics[2]!.folder, design(topics[2]!.folder, { files: ["T.practica.md"], manifest: MAN })],
        ],
  );
  return {
    planId: "plan",
    topics,
    areas: [{ key: "backend", area: "Backend", areaId: "backend" }],
    designs,
    review: null,
    ppReady: true,
    areaFiles: (areaId, katas, fromDay) => areaFiles(areaId, { katasPerArea: katas, fromDay }).map((x) => ({ rel: x.rel, exists: false })),
    kataWeeks: [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3],
    aiConfigured: true,
    now: "2026-10-09T10:00:00.000Z",
  };
}
