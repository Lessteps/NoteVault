# NoteVault

**Estudio, notas y gestión personal en una sola app de escritorio. Tus datos son archivos tuyos.**

NoteVault reúne en una app lo que normalmente repartes entre varias: notas en Markdown, tareas, calendario, hábitos, metas, proyectos, finanzas, ejercicio, alimentación y un **Mentor** que arma y sigue tu plan de estudio. Todo vive en una carpeta de tu disco (la *bóveda*), en archivos que puedes abrir con cualquier editor.

[Instalar NoteVault](empezar/instalacion.md){ .md-button .md-button--primary }
[Primeros pasos](empezar/primeros-pasos.md){ .md-button }

## Principios

- **Local primero.** No hay cuenta, servidor ni base de datos propietaria. La app no envía telemetría.
- **Archivos abiertos.** Markdown con frontmatter YAML y JSON. El formato está documentado y es el mismo que lee el cliente móvil. Puedes usar la misma carpeta con Obsidian. Ver [la bóveda](guia/boveda.md).
- **La IA es opcional.** Funciona sin IA. Si la quieres, eliges proveedor: API, modelo local (Ollama, LM Studio) o un prompt que pegas tú en la herramienta que prefieras. Ver [IA](guia/ia.md).
- **Código abierto.** Licencia GPL-3.0. Puedes leerlo, modificarlo y mejorarlo. Ver [licencia](proyecto/licencia.md).

## Qué incluye

| Módulo | Para qué sirve |
| :--- | :--- |
| Vista General | El resumen de tu día. |
| Notas | Editor Markdown con vista previa en vivo, enlaces, lienzos (canvas) y fórmulas. |
| Tareas y Proyectos | Tareas con recurrencia y proyectos con estados y plazos. |
| Calendario | Rutinas y eventos por día. |
| Hábitos | Registro diario de tus hábitos. |
| Metas | Metas con submetas y seguimiento. |
| Finanzas | Ingresos, gastos, categorías y metas de ahorro. |
| Ejercicio y Alimentación | Biblioteca de ejercicios, rutinas y registro de comidas. |
| Mentor | Plan de estudio con fechas, repasos espaciados y práctica. Ver [Mentor](guia/mentor.md). |
| Skills | Las instrucciones con las que se generan notas, mapas y práctica, editables y versionadas. Ver [Skills](guia/skills.md). |

Todos los módulos están descritos en [Módulos](guia/modulos.md).

## Estado del proyecto

NoteVault está en desarrollo activo. La versión actual es de escritorio (Windows con instalador; Linux y macOS desde el código fuente). El cliente móvil y la versión web están en el plan, todavía no publicados. Ver [hoja de ruta](proyecto/hoja-de-ruta.md).

## Para desarrolladores

La arquitectura, los requisitos y las decisiones de diseño están en la sección [Ingeniería](ingenieria.md). Para colaborar, empieza por [Contribuir](proyecto/contribuir.md).
