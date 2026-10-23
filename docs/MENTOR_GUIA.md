# Mentor — guía de funciones (22 oct 2026)

Esta guía describe **qué hace cada pantalla del Mentor** y las reglas que aplica. Está al día con la versión que simplifica el plan a cuatro sub-vistas. Los detalles de formato de archivos están en `VAULT_FORMAT.md`.

## 1. Mapa rápido

```
Mentor (barra lateral)
├─ Plan                      → resumen de planes y cada plan
│   └─ <tu plan>
│       ├─ Ejecución         → el día a día (solo lectura): hoy, áreas, Pomodoro, progreso
│       └─ Plan              → armar y ajustar
│           ├─ Mi plan       → Resumen · Temas por área · Registros · Preparar
│           ├─ Agenda        → por área: Semana · Mes (con las fases) · Calendario · Día
│           ├─ Práctica      → katas y proyectos del plan
│           ├─ Entregables
│           └─ Preguntas y ajustes
├─ Cierre del día            → qué pasó hoy y qué corregir
├─ Metas                     → resumen de metas y borradores
├─ Proyectos                 → estado y plazos
└─ Notas y estudio           → temas a medias, repasos, errores
```

El chat con el Mentor vive en el panel del asistente (columna derecha), no en un panel propio.

## 2. Ejecución (la cara del día a día)

Es **solo lectura sobre el plan**: nada de aquí cambia el plan, salvo «Empezar hoy» (ver §2.5).

### 2.1 Pestaña «Plan de estudio» (general)
- **Hoy**: fecha, semana, enfoque del día y las áreas programadas como **tarjetas plegables** (nombre, nº de temas, horas, estado). La primera área con trabajo pendiente sale abierta y marcada «En progreso». Cada tema muestra casilla, subtítulo («Teoría + Práctica», «Parte 2 de 15»), minutos y su **etiqueta de tiempo**.
- **Asignar temas**: manda los temas de hoy que faltan al Pomodoro (quedan en el registro de la sesión).
- **Planear mi día**: pide al Mentor proponer el día con IA.
- **Ruta sólida**: si hay un día anterior sin terminar, los temas de días posteriores quedan bloqueados hasta cerrarlo (ver §6).
- **Lo que viene**: pestañas de los próximos días; del elegido se ve su distribución por área. «Ver en la Agenda» abre ese día.
- **Vas atrasado en N temas**: los atrasados por área (plegables), con horas estimadas y el ritmo que hace falta para llegar a la fecha de fin.
- **Columna lateral**: Presupuesto de estudio (tiempo estimado frente al disponible), Repasos espaciados (3, 7, 14, 30, 60 y 120 días), **Ruta de áreas** (tarjeta oscura con el avance por área) y **Pomodoro & Práctica**.

### 2.2 Pestañas por área (Backend, Frontend…) y Bases
Cada una muestra el trabajo de esa ruta con cuatro vistas:
- **Temas de hoy** · **Temas de la semana** (con «Lo que viene»: las semanas siguientes, de 4 en 4) · **Pendientes** · **Por repasar**.
- Al **pulsar un tema** se abre un menú: *Abrir apunte (.md)*, *Abrir archivo de práctica*, *Abrir canvas explicativo*, *Asignar al Pomodoro*.
- Debajo, la **práctica diaria del área** (katas) y su proyecto diario; a la derecha, la sesión del área (Pomodoro y registro de horas).

### 2.3 Pestaña «Proyectos»
Proyecto semanal y mensual del plan.

### 2.4 Pomodoro
Un único reloj global (no se pierde al cambiar de pestaña). Se inicia desde «Pomodoro & Práctica» o desde la barra superior. Al terminar un bloque se pide una evaluación corta y el bloque queda en el **registro de horas** y en `Registros`.

### 2.5 «Empezar hoy» / «Replanificar desde hoy»
Aparece arriba cuando el plan arrancó antes de que empezaras a estudiar (o vas atrasado). Mueve el comienzo del plan a hoy (la fecha de fin no cambia) y reparte desde hoy todo lo que falta, empezando por el primer tema de la ruta. Lo ya completado se conserva. Pide confirmación, queda en «Preguntas y ajustes» y se puede **deshacer**. Solo vale hacia delante y deja al menos dos semanas de plan.

## 3. Etiquetas de tiempo y «pendiente»
Cada tema lleva la ventana de fechas en que toca (primer y último día de su reparto) y un estado:
- **Programado**: aún no le toca, o la ruta todavía no ha empezado.
- **En su tiempo**: hoy cae dentro de su ventana.
- **Pendiente**: su tiempo ya pasó y no está completo. Es automático.
- **Hecho**: completado.

Mientras **no hayas empezado la ruta** (ningún tema en curso ni completado) nada aparece como pendiente, ni «Vas atrasado», ni el aviso de ruta sólida.

## 4. Práctica diaria (katas)
- Un kata **solo cuenta como hecho** si hay un **intento calificado con nota de 75 o más**, sin haber visto la solución ni rendirse. Da igual si lo calificó la IA o la corrección interna de NoteVault: se mira el registro de intentos.
- «Verificar y marcar hecho» no marca a mano: el servidor lo rechaza sin esa verificación.
- **No se puede saltar un kata** salvo que lleves hecho y verificado **el 70 %** de los katas que tocaban hasta hoy en esa área. El botón y el menú dicen cuánto llevas.
- Los katas viven en `Programación/programming_practice/<área>/katas/`. Abrir un kata atrasado crea su archivo si falta (nunca sobrescribe).

## 5. Plan (armar y ajustar)

### 5.1 Mi plan — cuatro sub-vistas
| Sub-vista | Qué es |
|---|---|
| **Resumen** | Avance general, aviso de «Falta generar», **datos clave** (tiempo diario, días, ritmo, modo de áreas, lenguajes) y, si existe, el **alcance y comentarios**. |
| **Temas por área** | Una pestaña por área (y Bases). Por tema: semana, **anillo de avance**, etiqueta de tiempo, nota, mapa, `.practica`, ejercicios y estado. «Generar el área»/«Generar» crea lo que falta. Debajo: *reparto por semanas y áreas* y *detalle de cada área* (objetivo, metas enlazadas, grupos, proyecto). |
| **Registros** | Todo lo que dejan las sesiones (evidencia, notas, patrones). Se abre también desde el botón «Registros» de Ejecución. |
| **Preparar** | Lo técnico, fuera del estudio diario: **Ejecutar plan** (generar teoría, mapas, ejercicios y katas en segundo plano), **Cobertura** (qué tiene cada tema frente al plan) y **Plan para Antigravity** (traspaso a otra IA). |

Los ids antiguos (`datos`, `alcance`, `catalogo`, `areas`, `fases`, `ejecutar`, `cobertura`, `antigravity`) siguen funcionando: abren su sitio nuevo.

### 5.2 Agenda — por área
- Pestañas **Todas las áreas · Backend · Frontend · Databases · …**: filtran Semana, Mes, Día y Calendario (se recuerda por plan).
- **Semana**: temas separados por área, entregables y días. **Mes**: áreas en foco, temas por semana, hitos y, al final, **«Fases del plan, mes a mes»** (qué trabaja cada área cada mes, semanas activas). **Calendario**: rejilla con indicadores por área. **Día**: composición completa de un día (se llega desde otras vistas).
- Navegación común: anterior/siguiente, Hoy, Esta semana, Este mes y selector de fecha.

### 5.3 Práctica, Entregables
- **Práctica**: el sistema de práctica por área (katas, proyectos semanales y mensuales).
- **Entregables**: proyectos y entregables del plan; mientras no se definan aparecen «por definir».

### 5.4 Preguntas y ajustes
Un comentario («quita desktop», «pasa X a la semana 5», «sube a 3 horas al día») se traduce a un parche con IA (o con palabras clave sin IA), se valida y se aplica recalculando todo el reparto. Cada cambio guarda una instantánea para **Deshacer**. Lo que no se entiende queda como pendiente (el texto no se pierde).

### 5.5 Estados del plan
**Propuesto** (se puede refinar, no cuenta como activo) → **Mantener plan** / **Mantener y ejecutar** → **Activo** → **Archivado/Terminado**. La cabecera ofrece renombrar, archivar y eliminar (a la papelera de la vault).

## 6. Ruta sólida
Los temas avanzan en orden: el «frente» es el primer día con algún tema sin completar; todo lo repartido después queda bloqueado hasta cerrarlo. Es **por área**: un atraso en Frontend no bloquea Backend. Un tema completado nunca se bloquea.

## 7. Otras vistas
- **Cierre del día**: lo registrado (temas previstos, intentos, completados, katas), lo que queda sin terminar y un cierre con tu valoración; el Mentor lo guarda y lo tiene en cuenta.
- **Metas**: resumen de metas y borradores («Crear meta» desde un borrador). Se editan en su módulo.
- **Proyectos**: estado y plazos; carpetas de proyecto por ruta y área con plantilla de archivos.
- **Notas y estudio**: temas a medias, repasos y errores recientes.

## 8. Datos y rendimiento
- Todo se guarda en `.notevault/mentor/…` (planes, historial de cambios, ejecución, marcas de práctica) y en notas de la vault; el Mentor nunca borra notas.
- «Ejecutar plan» **se reanuda solo al abrir la app** si quedó en curso; trabaja en segundo plano. Para pararlo: Plan › Mi plan › Preparar › Ejecutar plan.
- La primera lectura del vault tras abrir la app puede tardar unos segundos; las siguientes usan caché validada por fecha y tamaño de cada archivo.

## 9. Límites conocidos
- La vista **Día** de la Agenda se mantiene porque la usan los enlaces de Ejecución («Ver ese día en la Agenda»).
- Si el plan arrancó antes de empezar a estudiar, usa «Empezar hoy» para no arrastrar atrasos.
- «Marcar el bloque como hecho» al cerrar el día (autorreporte de sesión) no pasa por la verificación de katas: es un registro de lo que declaras, no la práctica diaria.
