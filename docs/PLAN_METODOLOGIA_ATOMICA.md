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

## Botones nuevos
- **Agregar nuevos temas…** arriba **y abajo** de la tabla de cada asignatura; el diálogo enseña los temas que ya tiene.
- **Verificar metodología** (junto a «Agregar nuevos temas»): según la pestaña, verifica la asignatura, el área o todas. «Ver y crear lo que falta» escribe la tarea para Antigravity (sin IA local); «Copiar prompt de revisión» deja el texto para cualquier IA. También en Preparar → Ejecutar plan (todas las áreas).
- **Verificar áreas faltantes** (junto a «Analizar el plan»): áreas estándar y carpetas de la vault que no están en el plan, con «Añadir» (operación del plan con historial y «Deshacer»).
- **Horario por área**: `lib/areaTimes.ts` + API `mentor_area_time_set`; el calendario general (`MentorCalendarSource`) usa esa hora. Se edita en Calendario (Vista general, plegado) y en el Calendario de cada área: es el mismo dato.

## Pendiente / no verificado
- Probar a mano en la app (Electron) todos los flujos nuevos.
- El «Corregir metodología» ya no inserta notas genéricas: solo prepara la asignatura.
