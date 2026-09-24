# NoteVault — Resumen Completo de Componentes de la Interfaz de Usuario (UI)

Este documento contiene el inventario exhaustivo de todos los componentes, vistas, paneles, diálogos y flujos de trabajo de NoteVault. Sirve como referencia arquitectónica y funcional para el diseño o reconstrucción de una nueva interfaz de usuario.

---

## 1. Arquitectura General del Layout (Layout de 3 Paneles + Rail)

La interfaz de NoteVault está estructurada en un contenedor de 3 paneles horizontales con divisores ajustables (`QSplitter`), precedidos por una barra de navegación fija a la izquierda:

```
┌──────┬──────────────────┬───────────────────────────────────────┬──────────────────┐
│ Icon │   Panel Izquierdo│           Panel Central               │   Panel Derecho  │
│ Rail │   (Navegación    │      (Área de Trabajo Principal)      │  (Contextual /   │
│      │    del Módulo)   │                                       │   Estadísticas)  │
│      │                  │                                       │                  │
│ [🏠] │ Árbol / Listas / │ Vistas del módulo activo:             │ Metadatos /      │
│ [📅] │ Filtros / Menús  │ - Tablas, Grillas, Paneles de Edición │ Backlinks / TOC  │
│ [⚡] │ contextuales     │ - Editor Split Markdown / Canvas      │ Rachas / Chat IA │
│ [🏋️] │                  │ - Tableros Kanban / Reproductores     │                  │
│ [📝] │                  │                                       │                  │
│ [⚙️] │                  │                                       │                  │
└──────┴──────────────────┴───────────────────────────────────────┴──────────────────┘
```

### 1.1 Icon Rail (`IconRail` — `icon_rail.py`)
- **Propósito:** Barra lateral ultradelgada de navegación primaria entre modos.
- **Componentes:**
  - Botones con íconos para cada modo:
    1. **Inicio / Dashboard** (`MODE_HOME`)
    2. **Calendario** (`MODE_CALENDARIO`)
    3. **Hábitos** (`MODE_HABITS`)
    4. **Ejercicio** (`MODE_EJERCICIO`)
    5. **Tareas** (`MODE_TAREAS`)
    6. **Proyectos** (`MODE_PROYECTOS`)
    7. **Metas** (`MODE_METAS`)
    8. **Finanzas** (`MODE_FINANZAS`)
    9. **Notas y Vault** (`MODE_NOTAS`)
  - Selector / cambio de Vault local.
  - Indicador de sincronización en tiempo real (Syncthing).
  - Botón de Ajustes / Configuración.
  - Toggle de colapso rápido del Panel Izquierdo.

### 1.2 Panel Izquierdo (`QStackedWidget`)
- Alterna automáticamente según el módulo seleccionado en el `IconRail`.
- Proporciona navegación jerárquica, exploradores de árbol, filtros por estado/fecha y accesos directos específicos del módulo.

### 1.3 Panel Central (`_ResponsiveStackedWidget`)
- Área de trabajo principal con soporte de escalado y tamaño mínimo responsivo.
- Carga las vistas interactivas del módulo activo.

### 1.4 Panel Derecho (Colapsable / Contextual)
- Proporciona utilidades complementarias:
  - En **Notas**: Propiedades YAML, Tabla de Contenidos (TOC), Backlinks y Chat IA.
  - En **Hábitos**: Panel de estadísticas, métricas y rachas históricas.
  - Puede ocultarse completamente para maximizar el área central.

---

## 2. Inventario Detallado por Módulos

---

### MÓDULO 1: Vista General / Dashboard (`dashboard/`)
- **Propósito:** Visión panorámica del día del usuario al abrir la aplicación.
- **Componentes:**
  - **Banner de bienvenida:** Saludo dinámico, fecha actual y citas motivacionales.
  - **Métricas rápidas (KPI Cards):**
    - % de hábitos completados hoy.
    - Tareas pendientes con vencimiento hoy o atrasadas.
    - Estado de la rutina de ejercicio del día.
    - Hitos activos de proyectos en curso.
  - **Widget diario de Hábitos:** Checklist compacto para marcar hábitos directamente sin ir a la sección de hábitos.
  - **Agenda del día:** Bloques horarios de eventos próximos del calendario.
  - **Acciones Rápidas:** Botones para crear nota rápida, añadir tarea o registrar ejercicio.

---

### MÓDULO 2: Calendario (`calendario/`)
- **Propósito:** Planificación temporal unificada de eventos, rutinas y compromisos.
- **Panel Izquierdo (`CalendarioLeftPanel`):**
  - Mini-calendario mensual de navegación rápida.
  - Lista de fuentes / capas de eventos con checkboxes de visibilidad:
    - Eventos personales.
    - Tareas con fecha límite.
    - Rutinas de hábitos.
    - Sesiones de ejercicio.
    - Pagos / Finanzas programadas.
  - Acceso al editor de rutinas recurrentes.
- **Panel Central (`CalendarioPanel`):**
  - **Selector de vistas:**
    - `vista_mes.py`: Grilla de 7x5 semanas con indicadores de eventos.
    - `vista_semana.py` y `vista_dia.py`: Rejilla horaria vertical (`rejilla_horaria.py`) de 00:00 a 24:00 con bloques de tiempo interactivos y soporte de arrastrar/redimensionar.
    - `vista_agenda.py`: Lista cronológica vertical agrupada por días.
- **Diálogos y Popovers:**
  - `evento_popover.py`: Popover emergente al hacer clic en un evento (título, horario, color, repetición, recordatorio, notas).
  - `rutina_editor.py`: Editor de bloques de hábitos o rutinas fijas semanales.

---

### MÓDULO 3: Hábitos (`habit_tracker/`, `habit_left_panel.py`, `habit_right_panel.py`)
- **Propósito:** Seguimiento sistemático de hábitos diarios, semanales y mensuales con métricas de consistencia.
- **Panel Izquierdo (`HabitLeftPanel`):**
  - Filtros de vista temporal (Diario, Semanal, Mensual, Anual).
  - Contador de hábitos activos para el día de la semana actual.
  - Botón de gestión / configuración de hábitos.
- **Panel Central (`HabitTrackerPanel`):**
  - `daily_view.py`:
    - Checklist de hábitos del día seleccionado.
    - Sub-tareas / pasos de cada hábito (`subtasks_widget.py`).
    - Cuadro de diario / journaling del día (texto Markdown guardado al final de la nota del día).
  - `weekly_view.py`: Matriz semanal (filas = hábitos, columnas = lunes a domingo) con casillas de verificación.
  - `monthly_view.py`: Cuadrícula mensual estilo calendario con porcentaje de éxito diario.
  - `annual_view.py`: Heatmap anual (estilo GitHub contributions) por niveles de intensidad de completitud.
  - `habit_manage_view.py` y `habit_editor.py`: Diálogo modal para crear/editar hábitos (nombre, icono, días activos de la semana [0-6], sub-hábitos asociados).
- **Panel Derecho (`HabitRightPanel`):**
  - `streak_widget.py`: Racha actual y racha máxima histórica.
  - Porcentaje de cumplimiento semanal, mensual y anual acumulado.
  - Gráfico de tendencia de consistencia (`charts.py`).

---

### MÓDULO 4: Ejercicio (`ejercicio/`)
- **Propósito:** Registro y ejecución de rutinas de entrenamiento físico con control de series, pesos y técnica.
- **Panel Izquierdo (`EjercicioLeftPanel`):**
  - Selector de días de entrenamiento (Lunes a Domingo) con etiquetas de grupo muscular (Pecho/Tríceps, Espalda/Bíceps, Pierna, etc.).
  - Botón para añadir nuevo ejercicio a la rutina.
- **Panel Central (`EjercicioPanel`):**
  - `ejercicio_tracker.py`:
    - Lista de ejercicios programados para el día activo.
    - Tarjeta por ejercicio con:
      - Nombre y grupo muscular.
      - Series planificadas vs. realizadas.
      - Entradas de registro por serie: Peso (kg/lb) y Repeticiones logradas.
      - Casilla de completado (`done`).
      - Botón de reproducción de video demostrativo.
  - `ejercicio_video_player.py`: Reproductor multimedia integrado para videos `.mp4` locales de técnica correcta.
  - Cronómetro de descanso entre series con alerta audible/visual.
  - `ejercicio_registro.py`: Historial de pesos levantados en entrenamientos anteriores.
  - `ejercicio_manage.py`: Editor de catálogo de ejercicios y asignación a días de la semana.

---

### MÓDULO 5: Tareas (`tareas/`)
- **Propósito:** Gestión de tareas pendientes, prioridades, fechas de entrega y recordatorios.
- **Panel Izquierdo (`TareasLeftPanel`):**
  - Filtros estándar:
    - *Bandeja de entrada / Todas*.
    - *Hoy / Vencidas*.
    - *Próximos 7 días*.
    - *Completadas*.
  - Filtros por etiquetas / tags.
  - Filtros por nivel de prioridad (Alta, Media, Baja).
- **Panel Central (`TareasPanel`):**
  - **Selector de vistas:**
    - `tareas_table.py`: Tabla interactiva con columnas (Completado, Título, Proyecto, Prioridad, Vencimiento, Etiquetas, Recordatorio). Soporta ordenamiento y edición en línea.
    - `tareas_calendar.py`: Vista de calendario integrada con tareas ubicadas por fecha límite.
    - Vista Kanban (opcional vía `comun/kanban.py`).
  - `tareas_reminders.py`: Panel de configuración de notificaciones del sistema operativo.
- **Diálogos:**
  - `task_editor.py`: Modal de creación y edición profunda de tarea (descripción en Markdown, fecha/hora, recurrencia, recordatorio previo, checklist interno).
  - `date_picker.py`: Selector de fechas con atajos ("Hoy", "Mañana", "Fin de semana", "Próxima semana").

---

### MÓDULO 6: Proyectos (`proyectos/`)
- **Propósito:** Organización de metas complejas divididas en fases, entregables y listas de verificación.
- **Panel Izquierdo (`ProyectosLeftPanel`):**
  - Lista de proyectos agrupados por área (Trabajo, Estudio, Personal).
  - Barra de progreso porcentual por proyecto.
  - Botón de nuevo proyecto.
- **Panel Central (`ProyectosPanel` / `proyecto_view.py`):**
  - **Pestaña Resumen (`proyecto_resumen.py`):** Descripción del proyecto, fechas de inicio/fin, barra de progreso global, métricas de tareas completadas.
  - **Pestaña Lista de Pasos (`proyecto_lista.py`):** Entregables ordenados secuencialmente con fechas y responsables.
  - **Pestaña Tablero Kanban (`proyecto_tablero.py` / `proyectos_board.py`):** Columnas de estado (*Por empezar*, *En progreso*, *Revisión*, *Completado*).
  - **Pestaña Notas del Proyecto (`proyecto_notas.py`):** Enlace directo con notas del vault asociadas al proyecto.
- **Diálogos:**
  - `proyecto_dialogs.py`: Modal de configuración de proyecto.
  - `rubric_dialog.py`: Rúbrica de evaluación de entregables.
  - `issue_detail.py`: Modal de detalle de paso o problema del proyecto.

---

### MÓDULO 7: Metas / OKRs (`metas/`)
- **Propósito:** Planificación estratégica de objetivos a mediano y largo plazo vinculados con proyectos y hábitos.
- **Panel Izquierdo (`MetasLeftPanel`):**
  - Lista de áreas vitales (Salud, Carrera, Aprendizaje, Finanzas).
  - Selector de horizonte temporal (Trimestral Q1-Q4, Anual).
- **Panel Central (`MetasPanel`):**
  - `metas_board.py`: Tablero de objetivos con porcentaje de avance acumulado.
  - `submetas_board.py`: Desglose en metas secundarias o resultados clave cuantitativos.
  - `metas_hoy.py`: Vista de enfoque diario con las acciones críticas que impactan en las metas del mes.
- **Componentes de Detalle:**
  - `meta_detail.py` y `submeta_detail.py`: Paneles de métricas con indicadores numéricos (valor inicial, valor actual, meta final) y fechas de corte.

---

### MÓDULO 8: Finanzas (`finanzas/`)
- **Propósito:** Control de ingresos, gastos, presupuestos y metas de ahorro.
- **Panel Izquierdo (`FinanzasLeftPanel`):**
  - Resumen de saldo total y balance del mes.
  - Filtro por cuentas (Efectivo, Banco, Ahorros, Tarjetas).
- **Panel Central (`FinanzasPanel`):**
  - `finanzas_diario.py`: Registro cronológico de transacciones con inputs rápidos (monto, categoría, cuenta, nota).
  - `finanzas_tablas.py`: Tablas dinámicas agrupadas por categorías con totales mensuales.
  - `finanzas_metas.py`: Monitoreo de fondos de ahorro y amortizaciones.
- **Diálogos:**
  - `finanzas_dialogs.py`: Diálogo modal de nueva transacción o ajuste de presupuesto.

---

### MÓDULO 9: Notas, Base de Conocimiento y Canvas (`notes/`)
- **Propósito:** Entorno completo de toma de notas Markdown, mapas conceptuales visuales (Canvas) y sistema de estudio/práctica activa.
- **Panel Izquierdo (`notes_sidebar.py` / `file_explorer.py`):**
  - Árbol de archivos del Vault con soporte de iconos personalizados (`file_icons.py`).
  - Menú contextual completo: Crear nota, Crear carpeta, Renombrar, Eliminar, Mover, Abrir en Canvas.
  - Barra de búsqueda de notas con filtrado instantáneo en vivo.
  - Sección de "Favoritos / Marcadores" (`.notevault-bookmarks.json`).
  - Explorador de etiquetas (#tags).
- **Panel Central (`note_view.py` y `split_notes.py`):**
  - **Sistema de Pestañas Múltiples:** Pestañas superiores para alternar entre notas abiertas.
  - **Editor Markdown (`markdown_editor.py`):**
    - Resaltado de sintaxis enriquecido (`md_highlighter.py`): negrita, cursiva, encabezados H1-H6, listas de tareas `[ ]`, bloques de código y fórmulas matemáticas LaTeX `$inline$` y `$$display$$`.
    - Auto-completado de enlaces wiki estilo Obsidian `[[nota]]`.
    - Barra de herramientas rápida: formato, listas, tablas (`table_picker.py`), callouts/admonitions.
  - **Modos de Visualización:**
    - Modo Split (Edición a la izquierda, Vista Previa HTML/MathJax/Mermaid a la derecha).
    - Modo Solo Edición.
    - Modo Solo Lectura / Live Preview.
  - **Paleta de Comandos (`command_palette.py`):** Modal flotante accesible mediante `Ctrl+P` para buscar notas y ejecutar acciones.
- **Sistema de Canvas Infinito (`notes/canvas/`):**
  - `view.py` y `scene.py`: Lienzo infinito con pan (arrastre con barra espaciadora/botón central) y zoom con rueda de ratón.
  - `items.py`:
    - Nodos de texto enriquecido.
    - Nodos de nota embebida (previsualización del contenido Markdown en tiempo real).
    - Nodos de grupo jerárquico (`GroupItem`) con fondos traslúcidos y títulos.
  - `edges.py`: Conectores y flechas vectoriales entre nodos, con etiquetas flotantes de relación en el centro del trazo.
  - Herramientas de dibujo y exportación (`drawing.py`, `outline.py`).
- **Sistema de Práctica y Estudio ("El Profesor" — `notes/practice/` y `estudio/`):**
  - `study_queue_panel.py`: Cola de repaso diario basada en algoritmo de repetición espaciada (FSRS).
  - `practice_view.py` y `ladder_view.py`:
    - Visor de ejercicios con revelación secuencial de pistas (`### Pista 1`, `### Pista 2`).
    - Cronómetro regresivo de práctica (`practice_timer.py`).
    - Cuadro de solución detallada.
    - Rúbrica interactiva de 5 puntos con casillas de verificación.
    - Registro de errores típicos clasificados (`conceptual`, `logical`, `procedural`, `calculation`).
  - Práctica de demostraciones matemáticas paso a paso.
  - Modo Flashcards / Tarjetas de memoria anverso-reverso (`estudio/`).
- **Panel Derecho Contextual de Notas:**
  - **Pestaña Propiedades (`properties_panel.py`):** Editor de campos frontmatter YAML (tags, estado, dificultad, fuentes, etc.).
  - **Pestaña Esquema / TOC:** Árbol interactivo de encabezados de la nota para salto rápido.
  - **Pestaña Backlinks:** Lista de notas entrantes que vinculan a la nota actual y menciones sin vincular.
  - **Pestaña Grafo (`knowledge_graph_widget.py`, `math_graph_widget.py`):** Visualización interactiva en 2D de la red de enlaces entre notas.
  - **Pestaña Asistente IA (`ai_chat_panel.py`):** Chat lateral para consultar o resumir el contenido de las notas del vault.

---

## 3. Componentes Compartidos y Reutilizables (`ui/components/comun/`)

Estos widgets modulares deben considerarse como la biblioteca base para la nueva interfaz:

1. **`kanban.py`:**
   - Tablero kanban multipropósito con columnas, tarjetas arrastrables, conteo de items y límites WIP.
2. **`subtasks_widget.py`:**
   - Lista anidada de pasos con casillas de verificación, barra de progreso y edición rápida.
3. **`charts.py`:**
   - Gráficos de barras, líneas de tendencia y gráficos circulares para progreso y finanzas.
4. **`spreadsheet.py`:**
   - Cuadrícula editable tipo hoja de cálculo para tablas dentro de notas o finanzas.
5. **`tree_list.py`:**
   - Listas jerárquicas desplegables con soporte de filtrado y arrastre.
6. **`attachment_strip.py`:**
   - Tira horizontal de archivos adjuntos (imágenes, PDFs, audios) asociados a una nota o proyecto.
7. **`widgets.py`:**
   - Biblioteca de controles atómicos estilizados:
     - Botones primarios, secundarios y de peligro.
     - Inputs de texto con validación y borrado rápido.
     - Badges de prioridad, estado y dificultad.
     - Modales de confirmación con títulos y descripciones estandarizadas.
     - Selectores desplegables (`ComboBox`) y botones segmentados (`SegmentedControl`).

---

## 4. Sistema de Diseño, Estilos y Temas

- **Motor de estilos:** `ui/theme.py` y `ui/styles.py` (`DARK_THEME_QSS`).
- **Paleta base:** Tema oscuro moderno, tonos neutros oscuros (`#1e1e2e`, `#252538`, `#181825`), acentos suaves para foco y estados (azul, verde éxito, naranja alerta, rojo error).
- **Tipografía:** Jerarquía tipográfica con fuentes del sistema o Google Fonts (Inter / JetBrains Mono para código y matemáticas).
- **Iconografía:** Set consistente de iconos SVG / vectoriales para módulos, acciones y tipos de archivo.

---

## 5. Resumen de Flujos e Integraciones Críticas a Mantener

Al desarrollar la nueva interfaz, se debe garantizar que los siguientes flujos de datos no se rompan:
1. **Sin backend ni base de datos central:** Todo componente lee y escribe archivos locales en el Vault (`.notevault/` y notas Markdown).
2. **Formato byte a byte idéntico:** Cualquier guardado de notas, tareas o hábitos debe respetar los contratos de serialización de `VAULT_FORMAT.md`.
3. **Sincronización tolerante:** El explorador y los paneles deben reaccionar a cambios externos en disco causados por Syncthing sin bloquear la interfaz.
4. **Interoperabilidad entre módulos:**
   - Los proyectos vinculan notas del vault y generan tareas en el calendario.
   - Las tareas se reflejan en el calendario y en el dashboard.
   - Los hábitos registran journals diarios dentro del vault de notas.
   - El sistema de práctica consume notas de conceptos y alimenta la cola de estudio.
   - El canvas abre y renderiza notas del explorador como nodos interactivos.
   - El reproductor de ejercicio abre archivos multimedia guardados localmente.
