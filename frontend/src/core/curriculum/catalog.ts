import type { CurriculumArea } from "../../lib/curriculum";
import { CSS_ENTRIES } from "./catalog/css";
import { HTML_ENTRIES } from "./catalog/html";
import { JAVA_ENTRIES } from "./catalog/java";
import { JS_REFERENCE_ENTRIES } from "./catalog/js-reference";

export { CURRICULUM_OVERVIEWS, type OverviewRule } from "./catalog/overviews";

const SPACE = "Programación";

/**
 * Currículo de referencia por área (HTML, CSS, referencia de JavaScript, Java): lo que cada área DEBERÍA cubrir.
 * Son áreas hermanas de primer nivel (`11 HTML`…`14 Java`), planas: las categorías van en el catálogo, no en carpetas.
 */
export function curriculumAreas(): CurriculumArea[] {
  return [
    { id: "html", title: "HTML", space: SPACE, areaFolder: "11 HTML", entries: HTML_ENTRIES },
    { id: "css", title: "CSS", space: SPACE, areaFolder: "12 CSS", entries: CSS_ENTRIES },
    { id: "js-reference", title: "JavaScript Reference", space: SPACE, areaFolder: "13 JavaScript Reference", entries: JS_REFERENCE_ENTRIES },
    { id: "java", title: "Java", space: SPACE, areaFolder: "14 Java", entries: JAVA_ENTRIES },
  ];
}
