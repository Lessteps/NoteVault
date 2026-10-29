// Regla de metodología que todo prompt del Mentor que arma o juzga un plan debe llevar (un solo sitio para que un plan nuevo nunca vuelva a necesitar la corrección).

/**
 * Metodología de aprendizaje que TODA etapa de la generación del plan respeta (misma regla que el catálogo de referencia y las skills de la vault).
 * Está aquí, en un solo sitio, para que un plan nuevo la lleve siempre y no haya que corregirlo después.
 */
export const METHODOLOGY_RULE = [
  "METODOLOGÍA (obligatoria): en las materias que se aprenden por PATRONES —HTML (cada elemento y atributo), CSS (cada propiedad, selector y regla), las funciones y métodos de un lenguaje— cada pieza es su PROPIO tema (subtema atómico, numerado N.M.K bajo su grupo); nunca los fundas en un tema general ni los omitas por ser muchos.",
  "Los temas grandes (funciones, clases, async, layout) se dividen en subtemas en orden lineal: primero el repaso del grupo, luego cada pieza; ninguno puede ir antes de otro que necesita. Mantén ese orden (el número de la carpeta lo marca).",
  "HTML y CSS son ASIGNATURAS de Frontend con sus propios grupos, igual que el lenguaje (JavaScript): no las diluyas dentro de «Conocimientos». Si un subplan de Frontend no los trae, no los inventes (solo usas carpetas listadas), pero deja el motivo para que la app avise.",
].join("\n");

