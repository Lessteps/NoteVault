// Study actions per workspace (the buttons over a note and the "Acciones de
// estudio" menu), with the prompt each one sends to the assistant.

export interface StudyAction { id: string; label: string; tip: string; menuOnly?: boolean }

export const WORKSPACE_ACTIONS: Record<string, StudyAction[]> = {
  mathematics: [
    { id: "solve", label: "Resolver", tip: "Resolver o simplificar expresión matemática" },
    { id: "derive", label: "Derivar", tip: "Calcular derivada simbólica" },
    { id: "integrate", label: "Integrar", tip: "Calcular integral simbólica" },
    { id: "graph", label: "Graficar", tip: "Graficar función matemática" },
    { id: "latex", label: "LaTeX", tip: "Convertir o formatear expresión a LaTeX" },
    { id: "decompose", label: "Descomponer solución", tip: "Descomponer la solución paso a paso", menuOnly: true },
    { id: "verify", label: "Verificar razonamiento", tip: "Verificar el razonamiento", menuOnly: true },
    { id: "exercise", label: "Ejercicio", tip: "Generar ejercicio de matemáticas" },
  ],
  programming: [
    { id: "run", label: "Ejecutar", tip: "Ejecutar código seleccionado (simulado paso a paso)" },
    { id: "test", label: "Probar", tip: "Ejecutar o generar pruebas unitarias" },
    { id: "debug", label: "Depurar", tip: "Depurar y analizar errores en el código" },
    { id: "explain", label: "Explicar", tip: "Explicar lógica o complejidad del código" },
    { id: "optimize", label: "Optimizar", tip: "Optimizar algoritmo", menuOnly: true },
    { id: "variant", label: "Variante", tip: "Generar variante de problema", menuOnly: true },
    { id: "exercise", label: "Ejercicio", tip: "Generar reto de programación" },
  ],
  english: [
    { id: "translate", label: "Traducir", tip: "Traducir selección", menuOnly: true },
    { id: "vocabulary", label: "Vocabulario", tip: "Extraer y crear ficha de vocabulario" },
    { id: "grammar", label: "Gramática", tip: "Explicar estructura y regla gramatical" },
    { id: "listening", label: "Listening", tip: "Práctica de listening" },
    { id: "speaking", label: "Speaking", tip: "Práctica de speaking" },
    { id: "cloze", label: "Cloze", tip: "Crear ejercicio de rellenar huecos" },
    { id: "questions", label: "Preguntas", tip: "Generar preguntas de conversación", menuOnly: true },
    { id: "exercise", label: "Ejercicio", tip: "Generar ejercicio de inglés" },
  ],
  general: [
    { id: "explain", label: "Explicar", tip: "Explicar concepto detalladamente" },
    { id: "summarize", label: "Resumir", tip: "Resumir contenido clave" },
    { id: "flashcard", label: "Flashcard", tip: "Crear flashcard de active recall" },
    { id: "extract_concepts", label: "Conceptos clave", tip: "Extraer conceptos clave", menuOnly: true },
    { id: "questions", label: "Preguntas de repaso", tip: "Crear preguntas de repaso", menuOnly: true },
    { id: "link_concepts", label: "Vincular con otras notas", tip: "Vincular con otras notas", menuOnly: true },
    { id: "exercise", label: "Ejercicio", tip: "Generar ejercicio de repaso" },
  ],
};

const fence = (t: string, lang = "text") => `\n\n\`\`\`${lang}\n${t}\n\`\`\``;

export function actionPrompt(id: string, ctx: string): string {
  const p: Record<string, string> = {
    solve: `Resuelve o simplifica paso a paso la siguiente expresión matemática de la nota:${fence(ctx)}`,
    derive: `Calcula la derivada simbólica paso a paso de la siguiente expresión:${fence(ctx)}`,
    integrate: `Calcula la integral simbólica paso a paso de la siguiente expresión:${fence(ctx)}`,
    graph: `Analiza matemáticamente y describe las propiedades para graficar (raíces, asíntotas, máximos y mínimos) de la función:${fence(ctx)}`,
    latex: `Convierte o formatea la siguiente expresión a LaTeX limpio y profesional:${fence(ctx)}`,
    decompose: `Descompón paso a paso la solución del siguiente problema e identifica el método utilizado:${fence(ctx)}`,
    verify: `Verifica la corrección matemática y el razonamiento del siguiente desarrollo, señalando cualquier error:${fence(ctx)}`,
    run: `Analiza y simula la ejecución paso a paso del siguiente código, indicando la salida esperada y posibles fallos:${fence(ctx, "python")}`,
    test: `Diseña una suite completa de pruebas unitarias para el siguiente código, cubriendo casos normales y casos límite:${fence(ctx, "python")}`,
    debug: `Depura el siguiente código. Identifica el error exacto, explica la causa raíz y propón la solución corregida:${fence(ctx, "python")}`,
    explain: `Explica de forma didáctica y clara la lógica del siguiente fragmento, incluyendo complejidad algorítmica si aplica:${fence(ctx)}`,
    optimize: `Optimiza el siguiente código para mejorar su eficiencia temporal y espacial, explicando las mejoras:${fence(ctx, "python")}`,
    variant: `Genera una variante desafiante del siguiente problema para entrenar la misma habilidad:${fence(ctx)}`,
    translate: `Traduce de forma fluida y precisa el siguiente texto, añadiendo notas lingüísticas si es necesario:${fence(ctx)}`,
    vocabulary: `Extrae el vocabulario clave del siguiente texto con su significado contextual, categoría gramatical, pronunciación IPA y ejemplo:${fence(ctx)}`,
    grammar: `Explica la estructura gramatical utilizada en el siguiente texto, reglas, excepciones y posibles errores comunes:${fence(ctx)}`,
    cloze: `Genera un ejercicio tipo cloze (rellenar huecos) basado en el siguiente texto con opciones múltiples y solución explicada:${fence(ctx)}`,
    listening: `Genera un guión de comprensión auditiva con preguntas de opción múltiple y vocabulario clave a partir de:${fence(ctx)}`,
    questions: `Formula 5 preguntas de comprensión y reflexión activa basadas en:${fence(ctx)}`,
    summarize: `Sintetiza los puntos fundamentales del siguiente contenido en 5 ideas clave con formato markdown:${fence(ctx)}`,
    flashcard: `Crea una tarjeta de recuperación activa (pregunta frontal y respuesta detallada al reverso) sobre:${fence(ctx)}`,
    extract_concepts: `Extrae y define los conceptos principales presentes en:${fence(ctx)}`,
    link_concepts: `Identifica conceptos relacionados y prerrequisitos para vincular con otras notas a partir de:${fence(ctx)}`,
    exercise: `Genera un ejercicio interactivo de práctica activa adecuado al nivel del siguiente tema:${fence(ctx)}`,
  };
  return p[id] ?? `Analiza y explica en profundidad el siguiente contenido:\n\n${ctx}`;
}
