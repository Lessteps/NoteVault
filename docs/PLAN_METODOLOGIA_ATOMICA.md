# Metodología pieza a pieza (HTML, CSS, funciones) y verificaciones del plan

## Jerarquía
**Área** (Frontend) → **asignatura** (HTML, CSS, JavaScript) → **tema** (grupo: «Flex container properties») → **subtema atómico** (UNA pieza: `flex-wrap`, `<nav>`, `map`).

- Materias de **patrones** (HTML, CSS, métodos de un lenguaje): una nota por pieza. El tema-grupo queda como repaso; cada pieza es `N.M.K <pieza>` (`5.19.7.3 flex-wrap`), plano en la carpeta del área.
- Materias de **conceptos**: una nota por concepto; se parte solo si pasa de ~9 tarjetas.
- Temas **complejos** (funciones, clases, async): subtemas en orden lineal, ninguno depende de uno posterior.

## Dónde vive
| Qué | Dónde |
|---|---|
| Catálogo de referencia (grupos) | `core/curriculum/catalog/*.ts` |
| Expansión a subtemas (`atomic: true` en html, css, js-reference) | `core/curriculum/atomic.ts` → `expandAtomic` |
| Numeración jerárquica y cobertura | `core/curriculum/coverage.ts` (`parentId`) |
| Regla para la IA / Antigravity | `core/programmingDefaultSkills.ts` («Granularity») y `lib/curriculumPrompt.ts` («ATOMIC TOPIC») |
| Alcance de «Verificar metodología» y prompt de revisión | `lib/methodologyScope.ts` |

## Qué garantiza que un plan nuevo la lleve
- `core/mentor/methodologyRule.ts` (`METHODOLOGY_RULE`) está en TODOS los prompts que arman o juzgan un plan: esqueleto, temas (completo y compacto), planificador, ajustes (`planChange`) y análisis de cobertura. Test: `methodologyRule.test.ts`.
- `evaluateAreaMethodology` (lib/planAreas.ts) avisa solo en cualquier plan de Frontend con menos de 20 temas de HTML o 40 de CSS.
- Los temas creados bajo `5 Frontend/HTML|CSS/` entran al plan ya agrupados en su asignatura.
- Una pieza del catálogo (`atomTitle`) solo es elemento, propiedad, selector, regla, función o método; la prosa y los conceptos se descartan.

## Botones nuevos
- **Agregar nuevos temas…** arriba **y abajo** de la tabla de cada asignatura; el diálogo enseña los temas que ya tiene.
- **Verificar metodología** (junto a «Agregar nuevos temas»): según la pestaña, verifica la asignatura, el área o todas. «Ver y crear lo que falta» escribe la tarea para Antigravity (sin IA local); «Copiar prompt de revisión» deja el texto para cualquier IA; «Revisar con la IA de la app» usa tu clave de API o modelo local (`mentor_methodology_review`). También en Preparar → Ejecutar plan (todas las áreas).
- **Verificar áreas faltantes** (junto a «Analizar el plan»): áreas estándar y carpetas de la vault que no están en el plan, con «Añadir» (operación del plan con historial y «Deshacer»).
- **Horario por área**: `lib/areaTimes.ts` + API `mentor_area_time_set`; el calendario general (`MentorCalendarSource`) usa esa hora. Se edita en Calendario (Vista general, plegado) y en el Calendario de cada área: es el mismo dato.

## Organización automática del plan
- `lib/planOrganize.ts` + op `organize` (`planChange.ts`): el orden de los temas de referencia sale de los NÚMEROS de carpeta (`5.18.4` antes que `5.18.4.1`), los genéricos antiguos pasan a opcionales y las semanas se recalculan con la capacidad real.
- Se aplica SOLO: al añadir temas al plan (`mentor_plan_add_topics`) y al abrir un plan que lo necesite (`useAutoOrganize`); a mano con «Organizar el plan ahora» en «Verificar metodología».
- Una IA puede proponer el orden (bloque `json` con `order` al final de su respuesta); la app lo valida contra el plan y lo aplica (`parseOrderReply`). La IA da la lógica; la app la muestra.

## Pendiente / no verificado
- Probar a mano en la app (Electron) todos los flujos nuevos.
- El «Corregir metodología» ya no inserta notas genéricas: solo prepara la asignatura.
