# Especificación de Módulo: MOD-STUDY (Estudio, SRS y Matemáticas Puras)

**Fase:** 03 — Ingeniería de Requisitos  
**Entregable:** 07 de 09 — Especificación Detallada de Módulos  
**Módulo ID:** `MOD-STUDY` (12 de 15)  
**Bounded Context:** `SpacedLearning` / Repetición Espaciada y Dominio Matemático  
**Ubicación de Almacenamiento:** `.notevault/estudio/` (`srs.json`) y notas de conocimiento en `Matematicas/`  
**Responsable Técnico:** NoteVault Core Engineering  

---

## 1. Alcance y Responsabilidades del Módulo

El módulo `MOD-STUDY` es el motor de aprendizaje acelerado y maestría cognitiva de NoteVault. Implementa el sistema de repetición espaciada (SRS) y gobierna la base canónica de conocimiento de Matemáticas Puras:

- **Motor de Repetición Espaciada (SuperMemo SM-2 Modificado):** Algoritmo de programación de intervalos basado en factor de facilidad (`EF >= 1.3`), repeticiones consecutivas e intervalo en días (`I_1 = 1`, `I_2 = 6`, `I_n = I_{n-1} * EF`), evaluado mediante autocalificación de 0 a 5.
- **Tríada Canónica de Notas de Matemáticas Puras:** Estándar obligatorio de 3 arquetipos interconectados según el temario oficial (`SYLLABUS_MATH.md`):
  1. **Notas de Concepto (`c.XX.YY.md`):** Definición matemática rigurosa, intuición geométrica/algebraica, ejemplos canónicos, contraejemplos (*non-examples*) y conceptos precedentes obligatorios.
  2. **Notas de Teorema y Demostración (`t.XX.YY.md`):** Enunciado formal, intuición del paso clave, demostración paso a paso con justificación por renglón y corolarios directos.
  3. **Notas de Ejercicio Práctico (`e.XX.YY.md`):** Enunciado del problema, pistas graduadas ocultas (*spoilers*), solución detallada y análisis de trampas conceptuales frecuentes.
- **Protocolo de Práctica de Demostraciones (*Proof Practice Protocol*):** Modo de examen activo donde el estudiante debe reconstruir la demostración sin ver la solución antes de calificar su retención.
- **Auditoría de Integridad Automática:** Integración con la herramienta `tools/check_kb_notes.py` para garantizar 0 problemas de formato, links rotos o metadatos ausentes en las notas de conocimiento.
- **Generación de Canvas de Estudio:** Integración con `tools/kb_canvas.py` para proyectar el mapa del área matemática de forma automatizada.

---

## 2. Marco Conceptual: Entidad Tarjeta de Repaso SRS en el Dominio

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único derivado del código formal del tema en el temario (`srs_card_id`: `srs_c.01.03_espacios_vectoriales`), consultado por la cola diaria de repasos y el calendario.
3. **Existe por sí misma en el registro `.notevault/estudio/srs.json` sin depender del archivo físico de la nota**, y es la única responsable de calcular el próximo intervalo de repaso y actualizar el factor de facilidad tras cada sesión de evaluación.
4. **Punto de entrada y límite de consistencia:** El registro de una calificación (0 a 5) programa la próxima fecha de revisión en el calendario sin mutar el contenido textual de la nota en disco.

</div>

---

## 3. Requisitos Funcionales del Módulo (RF)

| ID RF | Declaración del Requisito Funcional | Prioridad MoSCoW | Criterio de Verificación |
| :--- | :--- | :--- | :--- |
| **RF-STU-01** | El sistema DEBE implementar el algoritmo SuperMemo SM-2 para calcular los intervalos de repaso basados en calificaciones de 0 (olvido total) a 5 (recuerdo perfecto). | **Must Have** | Vitest: Calificación 5 incrementa el intervalo y mantiene o sube el EF; calificación < 3 resetea repeticiones a 0. |
| **RF-STU-02** | El sistema DEBE extraer diariamente todas las tarjetas cuya fecha de próximo repaso sea menor o igual a la fecha actual (`due_date <= today`). | **Must Have** | La cola de repasos del día presenta el número exacto de ítems pendientes. |
| **RF-STU-03** | El sistema DEBE validar que las notas de matemáticas cumplan rigurosamente la estructura canónica de frontmatter y secciones según `SYLLABUS_MATH.md`. | **Must Have** | Script `python tools/check_kb_notes.py "Matematicas"` reporta `0 problem(s)`. |
| **RF-STU-04** | El sistema DEBE ofrecer un modo de "Práctica Activa" que oculte la demostración o solución hasta que el usuario pulse "Revelar Demostración". | **Must Have** | Componente visual bloquea la respuesta y despliega botones de autoevaluación (0 a 5) tras revelarla. |
| **RF-STU-05** | El sistema DEBE enlazar los repasos pendientes con el calendario de `MOD-CALENDAR`, mostrando la carga de tarjetas por día. | **Should Have** | Las tarjetas debidas aparecen agrupadas en la casilla correspondiente del calendario. |
| **RF-STU-06** | El sistema DEBE permitir generar el mapa conceptual del área matemática ejecutando `python tools/kb_canvas.py` sin intervención manual. | **Should Have** | El canvas resultante no superpone nodos y contiene todas las aristas de dependencia de conceptos. |
| **RF-STU-07** | El sistema DEBE registrar el tiempo dedicado por tarjeta para alimentar las métricas de enfoque del mentor. | **Could Have** | Cronómetro invisible mide los segundos transcurridos antes de pulsar la calificación. |

---

## 4. Requisitos No Funcionales del Módulo (RNF Local)

| ID RNF | Dimensión ISO 25010 | Declaración y Métrica Cuantitativa | Método de Medición |
| :--- | :--- | :--- | :--- |
| **RNF-STU-01** | Eficiencia de Desempeño | **Velocidad de Sesión de Repaso:** El paso de una tarjeta a la siguiente tras calificar debe completarse en **< 20 ms** sin recarga visual apreciable. | Medición de latencia de renderizado con Vitest y Chrome Performance. |
| **RNF-STU-02** | Confiabilidad | **Factor de Facilidad Acotado:** El factor de facilidad (`EF`) nunca debe decrecer por debajo de **1.3**, garantizando estabilidad matemática del algoritmo. | Test unitario sometiendo una tarjeta a 10 calificaciones consecutivas de 0. |
| **RNF-STU-03** | Usabilidad | **Soporte Completo de KaTeX:** 100% de los símbolos matemáticos de álgebra lineal, cálculo y análisis real deben compilarse sin errores tipográficos. | Prueba de regresión sobre las notas de matemáticas existentes. |
| **RNF-STU-04** | Portabilidad | **Independencia de Plataforma:** La cola de repaso debe funcionar con idéntica lógica de cálculo en la app móvil Flutter y en la versión de escritorio React. | Suite de pruebas compartida verificando vectores de prueba SM-2. |

---

## 5. Historias de Usuario con Criterios Gherkin

### US-STU-01: Repaso activo de demostración matemática
**Como** estudiante preparándose para una olimpiada o examen de análisis matemático,  
**Quiero** que el sistema me presente el enunciado del Teorema de Bolzano-Weierstrass con la demostración oculta,  
**Para** intentar escribirla en mi libreta antes de verificar mi rigor y calificar mi memoria.

```gherkin
Escenario: Sesión de práctica de demostración
  Dado que la nota "t.02.04_bolzano_weierstrass.md" está programada para repaso hoy
  Cuando el usuario inicia la sesión de práctica
  Entonces el sistema muestra el enunciado formal del teorema y el paso clave
  Y mantiene la demostración formal oculta bajo el botón "Verificar Demostración"
  Y cuando el usuario pulsa el botón, revela la prueba completa y activa los botones 0 a 5.
```

### US-STU-02: Calificación y reprogramación de intervalo
**Como** estudiante que tuvo dificultades para recordar un paso técnico de una demostración,  
**Quiero** calificar mi desempeño con un "2 (Repaso fallido pero recordé el concepto)",  
**Para** que el algoritmo reprograme la tarjeta para mañana mismo sin avanzar el intervalo largo.

```gherkin
Escenario: Calificación menor a 3 resetea el intervalo
  Dado que una tarjeta tenía un intervalo acumulado de 14 días y factor EF 2.5
  Cuando el usuario selecciona la calificación "2"
  Entonces el sistema reinicia las repeticiones consecutivas a 0
  Y programa el próximo repaso para dentro de 1 día (mañana)
  Y ajusta el factor EF a 2.34
  Y guarda el cambio atómico en "srs.json".
```

---

## 6. Especificación Detallada de Casos de Uso

### UC-STU-01: Ejecutar Sesión de Repaso Espaciado Activo

| Campo | Detalle de Especificación |
| :--- | :--- |
| **ID y Nombre** | `UC-STU-01` — Ejecutar Sesión de Repaso Espaciado Activo |
| **Actor Principal** | Estudiante / Investigador |
| **Precondición** | Existen tarjetas en `.notevault/estudio/srs.json` con fecha `due_date <= hoy`. |
| **Flujo Principal** | 1. El usuario hace clic en "Iniciar Repaso del Día" (ej. "15 tarjetas pendientes").<br/>2. El sistema carga la primera tarjeta de la cola y presenta la nota asociada en modo práctica (ocultando secciones de solución o demostración).<br/>3. El usuario lee el concepto o problema y elabora su respuesta mental o escrita.<br/>4. Presiona la barra espaciadora o el botón "Revelar Solución".<br/>5. El sistema despliega el cuerpo completo de la nota con fórmulas KaTeX renderizadas.<br/>6. El usuario evalúa su respuesta y pulsa una tecla de calificación numérica del 0 al 5.<br/>7. El sistema ejecuta el algoritmo SM-2: calcula nuevo `EF`, repeticiones consecutivas y nuevo intervalo en días.<br/>8. Actualiza la fecha de próximo repaso (`due_date = hoy + intervalo`).<br/>9. Persiste el cambio atómico en `.notevault/estudio/srs.json`.<br/>10. Si quedan tarjetas en la cola, avanza instantáneamente a la siguiente tarjeta (paso 2); de lo contrario, presenta la pantalla de felicitación y resumen de la sesión. |
| **Flujos Alternativos** | **A1 (Tarjeta nueva nunca antes repasada):** El sistema asigna `interval = 1`, `repetitions = 1` y `EF = 2.5` como punto de partida estándar. |
| **Excepciones** | **E1 (Nota borrada en disco):** Si la tarjeta apunta a una nota que fue eliminada del sistema de archivos, el sistema notifica "Nota no encontrada", archiva la tarjeta huérfana en un log de limpieza y salta a la siguiente tarjeta sin interrumpir la sesión. |
| **Postcondición** | El archivo `srs.json` almacena las nuevas fechas de revisión y el contador de pendientes del día se reduce. |

---

## 7. Diagrama de Actividad del Módulo

```mermaid
flowchart TD
    A[Iniciar Sesión de Repaso SRS] --> B[Filtrar Tarjetas Due <= Hoy en srs.json]
    B --> C{¿Hay tarjetas pendientes?}
    C -->|No| D[Mostrar Pantalla de Felicitación: Cola al Día]
    C -->|Sí| E[Cargar Primera Tarjeta de la Cola]
    
    E --> F[Renderizar Vista de Práctica: Solución Oculta]
    F --> G[Esperar que el Usuario Piense la Respuesta]
    G --> H[Click en Revelar / Espacio]
    
    H --> I[Mostrar Demostración Completa con KaTeX]
    I --> J[Habilitar Botones de Autoevaluación 0 a 5]
    
    J --> K[Usuario Selecciona Calificación q]
    K --> L{¿q >= 3?}
    
    L -->|Sí: Recordado| M[Calcular Intervalo SM-2: I_n = I_{n-1} * EF]
    L -->|No: Olvidado| N[Resetear Repeticiones = 0, Intervalo = 1 día]
    
    M --> O[Actualizar EF = EF + 0.1 - (5-q)*(0.08 + (5-q)*0.02)]
    N --> O
    O --> P[Garantizar EF >= 1.3]
    
    P --> Q[Calcular Nueva Fecha Due = Hoy + Intervalo]
    Q --> R[Actualizar Registro en srs.json]
    R --> S[Escritura Atómica en Disco]
    S --> B
```

---

## 8. Implicación de Compuerta de Fase (Gate 3 Criteria)

- **¿Bloquea el avance a Modelado/Fase 4?:** No.
- **Condición de Pase:** El motor SM-2 está formalmente verificado con pruebas unitarias de regresión matemática, y la estructura de notas de matemáticas satisface al 100% el validador `tools/check_kb_notes.py`.
