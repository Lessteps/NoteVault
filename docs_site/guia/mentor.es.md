# Mentor

El Mentor arma tu plan de estudio, lo reparte en el calendario y te acompaña día a día. La guía completa de cada pantalla está en [`docs/MENTOR_GUIA.md`](https://github.com/Lessteps/NoteVault/blob/main/docs/MENTOR_GUIA.md); aquí tienes lo esencial.

## Cómo está organizado

```text
Mentor
├─ Plan                  resumen de planes y cada plan
│   └─ <tu plan>
│       ├─ Ejecución     el día a día: hoy, áreas, Pomodoro, progreso
│       └─ Plan          armar y ajustar (resumen, temas, agenda, práctica…)
├─ Cierre del día        qué pasó hoy y qué corregir
├─ Metas
├─ Proyectos
└─ Notas y estudio       temas a medias, repasos, errores
```

El chat con el Mentor vive en el panel del asistente, en la columna derecha.

## El plan siempre cabe en tus fechas

Defines una fecha de inicio y una de fin. El plan **se ajusta a ese rango**: reparte todos los temas pendientes entre las dos fechas. En cada asignatura, la app te dice el **ritmo necesario** (temas por día y minutos por día) para llegar a la fecha de fin.

## Ejecución

- **Hoy:** las áreas programadas, con sus temas, minutos y estado.
- **Repasos espaciados** a los 3, 7, 14, 30, 60 y 120 días.
- **Pomodoro** global que no se pierde al cambiar de pestaña; cada bloque queda en el registro de horas.
- **Ruta sólida:** si hay un día anterior sin terminar, los temas posteriores quedan bloqueados hasta cerrarlo.
- **Empezar hoy / Replanificar desde hoy:** mueve el comienzo del plan a hoy, mantiene la fecha de fin, conserva lo ya completado y se puede deshacer.

## Estados de un tema

| Estado | Significado |
| :--- | :--- |
| Programado | Aún no le toca. |
| En su tiempo | Hoy cae dentro de su ventana de fechas. |
| Pendiente | Su tiempo pasó y no está completo (automático). |
| Hecho | Completado. |

## Cada tema son tres piezas

Una nota de **teoría** (`.md`), un **mapa** (`.canvas`) y un archivo de **práctica** (`.practica.md`) con ejercicios. Las tres se generan con las [Skills](skills.md), y la app sabe con qué versión de la skill se hizo cada una.
