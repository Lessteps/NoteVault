# 08. Operaciones y Calidad — Los 7 Pilares de Calidad

**Propósito:** Demostrar cómo NoteVault cumple rigurosamente con los 7 Pilares de Calidad definidos en la metodología **Full Stack Development**, garantizando un producto de nivel industrial en todas sus plataformas.

---

## 1. Marco Conceptual: Pilar de Calidad de Software

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que fija una dimensión normativa de calidad (`quality_pillar_id`: de `P1` a `P7`) invocado en cada compuerta de fase (Gate) antes de autorizar el paso a producción.
3. **Existe por sí misma en el marco de ingeniería sin depender de features aisladas**, y es la única responsable de dictar los umbrales cuantitativos, métricas de aceptación y pruebas de verificación requeridas en el código.
4. **Punto de entrada y límite de consistencia:** El incumplimiento de cualquiera de los 7 pilares detiene el ciclo de despliegue y genera un reporte de no conformidad.

</div>

---

## 2. Matriz de Cumplimiento de los 7 Pilares en NoteVault

| # | Pilar | Cómo lo Resuelve y Garantiza NoteVault | Mecanismo de Verificación Automatizado |
| :--- | :--- | :--- | :--- |
| **P1** | **Funcionalidad** | El software implementa exactamente las 9 áreas requeridas (notas, hábitos, entrenamiento, tareas, proyectos, finanzas, estudio, mentor y web) sin omisiones ni características superfluas. | Pruebas unitarias de cobertura funcional y trazabilidad directa requisito → código. |
| **P2** | **Seguridad** | Aislamiento estricto de procesos en Electron (`contextIsolation: true`, `nodeIntegration: false`). Sanitización contra ataques XSS con `DOMPurify`. Confinamiento estricto de rutas (`AppState.resolve`) para impedir *Path Traversal*. Privacidad 100% local sin telemetría ni envío de datos a servidores externos. | Suites de seguridad automatizadas: `windowSecurity.test.ts` y auditorías de dependencias `npm audit`. |
| **P3** | **Rendimiento** | Lectura y renderizado de notas en < 30 ms. Búsqueda acotada a escaneo inteligente (`MAX_SCAN_NOTES = 4000`) para evitar bloqueos del hilo principal. Compilación ultrarrápida con Vite 8. En móvil, renderizado a 60/120 FPS impulsado por Flutter. | Pruebas de rendimiento y profiling en `tests/performance/`. |
| **P4** | **Escalabilidad** | Al no depender de una base de datos centralizada ni servidor, el costo y cuello de botella de escalabilidad es $0 USD. Soporte para múltiples bóvedas independientes sin degradación. | Pruebas de estrés con bóvedas de más de 10,000 archivos markdown y media. |
| **P5** | **Mantenibilidad** | Tipado estricto en TypeScript 5.9 y Dart 3. Separación estricta en capas (Core, API Dispatcher, UI). Funciones puras para lógica de fechas, rachas y porcentajes. | Análisis estático (`npm run typecheck`, `flutter analyze`) con cero tolerancia a errores. |
| **P6** | **Accesibilidad** | Cumplimiento de estándares WCAG 2.1 AA. Contraste de colores verificado en modo claro y modo oscuro. Navegación completa por atajos de teclado sin requerir mouse. Etiquetas semánticas `aria-label` y roles WAI-ARIA en calendario y listas. | Batería de pruebas de contraste automatizadas: `styles.contrast.test.ts`. |
| **P7** | **Confiabilidad** | Escrituras atómicas a disco para evitar archivos truncados ante cortes de energía. Preservación estricta de metadatos desconocidos. Detección y reporte elegante de archivos de conflicto de sincronización (`*.sync-conflict-*`) sin lanzar excepciones hacia la interfaz. | Pruebas de resiliencia de I/O y suite de conformidad multiplataforma `conformance_test.dart`. |
