# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Las versiones siguen [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido
- Mentor: un **temario general** siempre al día para IAs y personas — `00 Master syllabus.md` y su gemelo JSON en cada espacio de estudio. Un solo archivo con cada ruta (plan) → área → asignatura → tema → pieza, con número, tiempo, semana del plan y estado (teoría, mapa, práctica, ejercicios, hecho), más la biblioteca de temas que no están en ningún plan. La app lo reescribe cada vez que se sincroniza el plan (solo si cambió) y se puede regenerar con `mentor_master_syllabus`.

### Corregido
- Mentor: la sincronización del plan ahora detecta las piezas nuevas de las áreas de **lenguaje** (`2.1 Python`, `2.2 JavaScript`, `2.3 TypeScript`) y de cualquier área que ya esté en el plan, y las añade junto a sus hermanas (mismo subplan y grupo que su capítulo). Antes el aviso de «capítulos gruesos» no se iba nunca tras desglosar un lenguaje.
- Mentor: la sincronización ya no marca como «ofrecidos» los temas que no cupieron en su tope de 400 por vuelta; el resto se añade en la siguiente en vez de perderse.

### Añadido
- Mentor: crear un plan con otra IA (Antigravity o un chat) sin clave de API ni modelo local. NoteVault escribe el pedido en la bóveda y valida la respuesta antes de crear el plan.

## [0.1.0] - 2026-11-01

### Añadido
- Primera versión pública del código bajo GPL-3.0-or-later.
- Documentación pública con MkDocs, sitio web y archivos de comunidad.
- Skills: panel para ver y editar las instrucciones de generación, con historial de 3 versiones y detección automática de piezas desactualizadas.
- Mentor: el plan se ajusta siempre a las fechas de inicio y fin, y cada asignatura muestra el ritmo necesario.
- Teoría de los temas organizada en tres módulos funcionales: qué es, cómo se organiza y cómo actúa en el mundo real.

### Cambiado
- Licencia: de Apache-2.0 a GPL-3.0-or-later.
- Vista General: la racha, el ahorro y las gráficas muestran datos reales (antes salían valores de ejemplo).
- Instalador de Windows con icono y nombre `NoteVault-Setup-<versión>.exe`.

### Corregido
- El paso a paso de JavaScript ya no agota el tiempo en programas largos.
