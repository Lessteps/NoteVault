# Interfaces V2 Progress Log

| Area | Commit | Tests | Description |
|---|---|---|---|
| Area H | `b0bb48e` | 82 files passed (530 tests) | Rediseño visual completo de Vista General según mockup de referencia `vista_general_ref.webp` (Focus Engine, 5 stat cards con sparklines fluidos, listas interactivas de hábitos y ejercicio con checks optimistas, analítica semanal y progreso de metas). |
| Area A | `1d21704` | 82 files passed (530 tests) | Reproductor de video de ejercicio integrado (A1) y soporte interactivo de ejercicios en el dashboard diario. |
| Area B | `c3266f2` | 82 files passed (530 tests) | Colapso del panel derecho del inspector de notas y refresco en vivo del árbol de archivos con eventos del watcher. |
| Area C | `915cf9d` | 82 files passed (533 tests) | Rediseño de plantillas de mapas conceptuales matemáticos (`math_concept.yaml`: Definición, Ejemplos, Contraejemplos y errores comunes; sin Intuición ni Práctica), ajuste de tamaño dinámico de nodos según texto y mapa índice de matemáticas (`math_index.yaml`) completamente legible. |
| Area E | `93ff40b` | 82 files passed (533 tests) | Creación de grupos vacíos desde menú contextual en espacio libre, redimensionado desde 8 lados y esquinas, ajuste de grosor de borde (1px, 2px, 4px), barra de herramientas con teclas de acceso rápido `z, x, c, v, b, n, m`, y alternador de cuadrícula visual desacoplado del ajuste a cuadrícula (snap). |
| Area D | `1bb31ec` | 82 files passed (534 tests) | Corrección del renderizado del grafo de conocimiento en canvas con ResizeObserver, auto-fit con escala protectora y resolución robusta de enlaces wiki con subcarpetas, alias y extensiones. |
| Area F | `ffbc8a7` | 82 files passed (534 tests) | Reconstrucción completa del navegador web embebido usando `WebContentsView` de Electron con partición de sesión persistente (`persist:nvweb`), soporte nativo de reproducción de video, filtrado de navegación por reglas/listas y entrada directa desde la barra lateral derecha de Notas. |

---

## Revisión de Cobertura del Índice Matemático (C4)

El mapa de índice de matemáticas (`docs/map_templates/math_index.yaml`) ha sido estructurado respetando la progresión curricular desde los fundamentos:

1. **Fundamentos**: Lógica proposicional, Teoría de conjuntos, Sistemas numéricos y aritmética, Álgebra elemental.
2. **Álgebra y Estructuras**: Polinomios y factorización, Matrices y determinantes, Espacios vectoriales, Estructuras algebraicas (Grupos y anillos).
3. **Geometría y Trigonometría**: Geometría euclidiana y analítica, Trigonometría plana, Secciones cónicas, Vectores geométricos.
4. **Cálculo Diferencial**: Límites y continuidad, La derivada, Reglas de derivación, Teorema del valor medio y optimización.
5. **Cálculo Integral**: Antiderivadas, Teorema fundamental del cálculo, Métodos de integración, Aplicaciones geométricas y físicas.
6. **Cálculo Multivariable**: Funciones de varias variables, Derivadas parciales y gradiente, Integrales dobles y triples, Teoremas de Green, Stokes y Gauss.
7. **Ecuaciones Diferenciales**: EDO de primer orden, EDO lineales de orden superior, Transformada de Laplace, Sistemas lineales de EDO.
8. **Probabilidad y Estadística**: Combinatoria y probabilidad clásica, Variables aleatorias discretas y continuas, Distribuciones notables, Estimación e inferencia.

Cobertura completa sin lagunas curriculares detectadas.
