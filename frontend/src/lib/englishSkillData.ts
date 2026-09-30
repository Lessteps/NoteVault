// English as a second study domain: its five BRANCHES and the skills of each, plus the vocabulary
// layer that cuts across them. Pure data (no imports) so the UI and the core share it.
//
// Every English skill has its own namespaced id (`gr_…`, `wr_…`, `rd_…`, `ls_…`, `sp_…`, `vc_…`), so
// nothing is shared with the mathematics or programming skills — they cannot leak into each other.
// A branch is a folder of the space with its own syllabus; vocabulary is NOT a branch: it is one
// shared word bank that any branch feeds, practised with the `vc_` skills.
//
// Difficulty 1 / 2 / 3 = CEFR A2 / B1 / B2 and above.

export type EnglishBranch = "grammar" | "writing" | "reading" | "listening" | "speaking";
export type EnglishArea = EnglishBranch | "vocabulary";

export const ENGLISH_BRANCHES: ReadonlyArray<{ id: EnglishBranch; label: string; folder: string; words: readonly string[] }> = [
  { id: "grammar", label: "Gramática", folder: "1 Gramática", words: ["gramatica", "grammar"] },
  { id: "writing", label: "Escritura", folder: "2 Escritura", words: ["escritura", "redaccion", "writing"] },
  { id: "reading", label: "Lectura", folder: "3 Lectura", words: ["lectura", "reading"] },
  { id: "listening", label: "Escucha", folder: "4 Escucha", words: ["escucha", "listening"] },
  { id: "speaking", label: "Habla", folder: "5 Habla", words: ["habla", "speaking", "oral"] },
];

/** The folder of the shared word bank (not a branch and it has no syllabus). */
export const ENGLISH_VOCABULARY_FOLDER = "Vocabulario";

export interface EnglishSkillSpec {
  id: string;
  area: EnglishArea;
  label: string;
  /** what the student does (Spanish, shown in lists) */
  description: string;
  /** what this skill certifies */
  competencies: readonly string[];
  /** the instruction the exercise generator and the grader follow (English) */
  act: string;
  judge: string;
  answerKind: "text" | "short";
  timer: string;
  /** no beginner level (needs some base to make sense) */
  noBeginner?: boolean;
  /** hints would give the answer away: this skill is always without help */
  noHelper?: boolean;
  /** the exercise needs audio (played from the app) and hides its text */
  audio?: boolean;
}

const s = (spec: EnglishSkillSpec): EnglishSkillSpec => spec;

export const ENGLISH_SKILL_SPECS: readonly EnglishSkillSpec[] = [
  // ── Grammar ───────────────────────────────────────────────────────────────
  s({ id: "gr_explain_rule", area: "grammar", label: "Explicar la regla", description: "Explicar con tus palabras cuándo y cómo se usa una estructura.",
    competencies: ["Formulación de la regla", "Contraste con el español"],
    act: "Ask the learner to explain, in Spanish or simple English, when and how the target structure is used and how it differs from Spanish.",
    judge: "The rule is stated correctly and completely (form, use, main exceptions) and an original example is given.", answerKind: "text", timer: "10m" }),
  s({ id: "gr_recognize", area: "grammar", label: "Reconocer la estructura", description: "Identificar la estructura objetivo en ejemplos y decir por qué.",
    competencies: ["Identificación de formas", "Discriminación de usos"],
    act: "Give several short example sentences and ask which ones use the target structure and why.",
    judge: "Every use of the structure is identified, no false positives, and the reason given is correct.", answerKind: "short", timer: "5m" }),
  s({ id: "gr_cloze", area: "grammar", label: "Completar huecos", description: "Completar huecos con la forma correcta según el contexto.",
    competencies: ["Forma correcta en contexto", "Concordancia y tiempos"],
    act: "Write a text or sentences with blanks that require the target form; give the base word in brackets when useful.",
    judge: "Each blank has the correct form for its context (tense, agreement, article, preposition).", answerKind: "short", timer: "5m" }),
  s({ id: "gr_transform", area: "grammar", label: "Transformar", description: "Cambiar la estructura (activa/pasiva, cambio de tiempo, estilo indirecto).",
    competencies: ["Transformaciones", "Conservación del significado"],
    act: "Give sentences and ask the learner to transform them (active/passive, tense change, reported speech, etc.) keeping the meaning.",
    judge: "The transformation is grammatical, uses the requested structure and keeps the original meaning.", answerKind: "text", timer: "10m" }),
  s({ id: "gr_correct", area: "grammar", label: "Corregir errores", description: "Encontrar y corregir errores típicos de hispanohablantes.",
    competencies: ["Detección de errores", "Corrección por transferencia del español"],
    act: "Give a text with realistic errors a Spanish speaker makes with the target structure; the learner finds and corrects them.",
    judge: "Every error is found and corrected properly, and no correct part is changed.", answerKind: "text", timer: "10m", noBeginner: true }),
  s({ id: "gr_produce", area: "grammar", label: "Producir en contexto", description: "Usar la estructura en tus propias frases dentro de una situación.",
    competencies: ["Producción propia", "Uso natural"],
    act: "Describe a real situation and ask the learner to write sentences that use the target structure naturally.",
    judge: "The structure is used correctly and naturally in original sentences that fit the situation.", answerKind: "text", timer: "10m" }),
  // ── Writing ───────────────────────────────────────────────────────────────
  s({ id: "wr_sentences", area: "writing", label: "Construir oraciones", description: "Armar oraciones correctas a partir de palabras o ideas dadas.",
    competencies: ["Orden de palabras", "Oraciones completas"],
    act: "Give words or ideas and ask the learner to build correct, complete sentences with them.",
    judge: "Sentences are complete, well ordered and grammatical, using all the given elements.", answerKind: "text", timer: "10m" }),
  s({ id: "wr_paragraph", area: "writing", label: "Párrafo guiado", description: "Escribir un párrafo siguiendo una estructura y conectores dados.",
    competencies: ["Estructura del párrafo", "Conectores"],
    act: "Give a topic, a paragraph structure (topic sentence, support, closing) and linkers to use; the learner writes one paragraph.",
    judge: "Clear topic sentence, supported ideas, correct use of the required linkers, few errors for the CEFR level.", answerKind: "text", timer: "pomodoro" }),
  s({ id: "wr_free", area: "writing", label: "Escritura libre con rúbrica", description: "Redactar un texto propio evaluado con una rúbrica MCER.",
    competencies: ["Cumplimiento de la tarea", "Coherencia y precisión"],
    act: "Give a real writing task with a word range and the CEFR level (email, opinion, description) for the learner to write freely.",
    judge: "CEFR writing criteria: task achievement, coherence and cohesion, lexical and grammatical range, accuracy.", answerKind: "text", timer: "pomodoro" }),
  s({ id: "wr_paraphrase", area: "writing", label: "Parafrasear", description: "Decir lo mismo con otras palabras y otra estructura.",
    competencies: ["Sinónimos y estructuras", "Fidelidad de sentido"],
    act: "Give a sentence or short text and ask the learner to say the same with different words and structures.",
    judge: "Meaning is preserved, the wording and structure are really different, and the result is natural and correct.", answerKind: "text", timer: "10m" }),
  s({ id: "wr_register", area: "writing", label: "Adaptar el registro", description: "Reescribir un texto para otro público (formal, informal, técnico).",
    competencies: ["Registro", "Adecuación al lector"],
    act: "Give a text in one register and ask the learner to rewrite it for a different audience (formal email, chat, report).",
    judge: "Vocabulary, grammar and tone fit the new register consistently; the message is unchanged.", answerKind: "text", timer: "10m", noBeginner: true }),
  s({ id: "wr_review", area: "writing", label: "Autorrevisión", description: "Revisar un texto propio o dado y mejorarlo con criterios.",
    competencies: ["Revisión", "Criterios de calidad"],
    act: "Give a draft with weaknesses and a checklist; the learner lists the problems and delivers an improved version.",
    judge: "The main problems are identified, the revision fixes them without new errors, and the checklist is followed.", answerKind: "text", timer: "pomodoro", noBeginner: true }),
  // ── Reading ───────────────────────────────────────────────────────────────
  s({ id: "rd_literal", area: "reading", label: "Comprensión literal", description: "Responder sobre lo que el texto dice explícitamente.",
    competencies: ["Localizar información", "Comprensión explícita"],
    act: "Write a short text at the CEFR level and ask questions whose answers are stated explicitly in it.",
    judge: "Answers match what the text states, are complete and do not add information that is not there.", answerKind: "short", timer: "10m" }),
  s({ id: "rd_inference", area: "reading", label: "Inferencia", description: "Deducir lo que el texto sugiere sin decirlo.",
    competencies: ["Deducción", "Intención del autor"],
    act: "Write a text and ask questions whose answers must be inferred (implied meaning, attitude, cause) with justification from the text.",
    judge: "The inference is reasonable, supported with evidence from the text, and not a literal copy.", answerKind: "text", timer: "10m", noBeginner: true }),
  s({ id: "rd_vocab_context", area: "reading", label: "Vocabulario en contexto", description: "Deducir el significado de palabras por el contexto.",
    competencies: ["Deducción léxica", "Pistas del contexto"],
    act: "Write a text with a few unfamiliar words and ask the learner to deduce their meaning from context and say which clues they used.",
    judge: "The meaning is right for that context and the clues named are the real ones.", answerKind: "short", timer: "10m" }),
  s({ id: "rd_summary", area: "reading", label: "Resumir", description: "Contar las ideas principales del texto con pocas palabras.",
    competencies: ["Ideas principales", "Síntesis"],
    act: "Write a text and ask for a summary of a given length in the learner's own words.",
    judge: "Main ideas are all there, details are left out, wording is original and the length is respected.", answerKind: "text", timer: "10m" }),
  s({ id: "rd_skim_scan", area: "reading", label: "Skimming y scanning", description: "Sacar la idea general y datos concretos con lectura rápida.",
    competencies: ["Lectura rápida", "Búsqueda de datos"],
    act: "Give a longer text (menu, schedule, article) with a time limit; ask for the gist (skimming) and specific data (scanning).",
    judge: "The gist is right and the specific data are exact.", answerKind: "short", timer: "5m" }),
  s({ id: "rd_structure", area: "reading", label: "Estructura del texto", description: "Reconocer cómo se organiza un texto y para qué sirve cada parte.",
    competencies: ["Organización del texto", "Función de los párrafos"],
    act: "Give a text and ask for the function of each paragraph, the linkers that mark the structure and the type of text.",
    judge: "The organisation and the function of each part are identified correctly, with the linkers as evidence.", answerKind: "text", timer: "10m", noBeginner: true }),
  // ── Listening (audio is played by the app; the text stays hidden) ─────────
  s({ id: "ls_dictation", area: "listening", label: "Dictado", description: "Escuchar una frase y escribirla exactamente.",
    competencies: ["Discriminación de sonidos", "Ortografía"],
    act: "Provide a short text (1-3 sentences) at the CEFR level to be played aloud; the learner types exactly what they hear.",
    judge: "Compare with the original word by word: missing, extra and misspelled words, contractions, endings -s/-ed and homophones.", answerKind: "text", timer: "5m", audio: true, noHelper: true }),
  s({ id: "ls_gist", area: "listening", label: "Idea general", description: "Entender de qué trata lo que se escucha.",
    competencies: ["Comprensión global", "Tema y propósito"],
    act: "Provide a short audio text to be played; ask the learner for the main idea and the speaker's purpose.",
    judge: "The general idea and purpose are correct; unnecessary details are not required.", answerKind: "short", timer: "5m", audio: true }),
  s({ id: "ls_detail", area: "listening", label: "Detalles específicos", description: "Captar datos concretos: cifras, nombres, horarios.",
    competencies: ["Datos concretos", "Atención selectiva"],
    act: "Provide an audio text with specific data (numbers, names, times); ask questions about exact details.",
    judge: "Each detail is exact (numbers, names, dates).", answerKind: "short", timer: "5m", audio: true }),
  s({ id: "ls_gap", area: "listening", label: "Transcripción con huecos", description: "Completar los huecos de una transcripción mientras escuchas.",
    competencies: ["Escucha selectiva", "Palabras clave"],
    act: "Provide an audio text and its transcript with blanks for key words; the learner fills the blanks.",
    judge: "Each blank has the exact word heard, spelled correctly.", answerKind: "short", timer: "5m", audio: true, noHelper: true }),
  s({ id: "ls_variation", area: "listening", label: "Velocidad y acento", description: "Entender el mismo mensaje a distinta velocidad o con otro acento.",
    competencies: ["Adaptación al ritmo", "Acentos"],
    act: "Provide an audio text to be played at different speeds or with a different English accent; the learner answers the same questions each time.",
    judge: "Comprehension is kept as speed or accent changes; the learner reports what became harder.", answerKind: "short", timer: "10m", audio: true, noBeginner: true }),
  // ── Speaking (no speech recognition: the learner types what they said) ────
  s({ id: "sp_read_aloud", area: "speaking", label: "Lectura en voz alta", description: "Leer un texto en voz alta cuidando la pronunciación.",
    competencies: ["Pronunciación", "Entonación"],
    act: "Give a short text with tricky sounds; the learner reads it aloud, then reports the words they were unsure about and how they pronounced them.",
    judge: "The self-report identifies the real difficult sounds and the pronunciation notes are correct; suggest practice for each.", answerKind: "text", timer: "10m" }),
  s({ id: "sp_shadowing", area: "speaking", label: "Shadowing", description: "Repetir un audio casi a la vez, imitando ritmo y entonación.",
    competencies: ["Ritmo", "Entonación"],
    act: "Give a short model text to repeat right after the audio; the learner reports how it went (speed, stress, sounds) and writes the phrase it found hardest.",
    judge: "The report is specific about rhythm, stress and sounds, and the phrase copied is exact.", answerKind: "text", timer: "10m", audio: true }),
  s({ id: "sp_guided", area: "speaking", label: "Respuesta guiada", description: "Responder en voz alta a preguntas con ayudas de estructura.",
    competencies: ["Respuesta pertinente", "Fluidez"],
    act: "Give questions with a structure prompt; the learner answers aloud and types the transcript of what they said.",
    judge: "The transcript answers the question, uses the structure and is correct for the CEFR level.", answerKind: "text", timer: "10m" }),
  s({ id: "sp_monologue", area: "speaking", label: "Monólogo libre", description: "Hablar 1-2 minutos sobre un tema sin guion.",
    competencies: ["Fluidez", "Organización del discurso"],
    act: "Give a topic to talk about for 1-2 minutes; the learner types a transcript of what they said.",
    judge: "CEFR speaking criteria on the transcript: content, organisation, range and accuracy, hesitation strategies.", answerKind: "text", timer: "pomodoro", noBeginner: true }),
  s({ id: "sp_roleplay", area: "speaking", label: "Diálogo y roleplay", description: "Interpretar una conversación real con otra persona.",
    competencies: ["Interacción", "Fórmulas de conversación"],
    act: "Describe a role-play situation with the other person's lines; the learner types their own lines as they would say them.",
    judge: "Turns are appropriate, use natural conversational formulas and are correct for the CEFR level.", answerKind: "text", timer: "10m" }),
  s({ id: "sp_record_compare", area: "speaking", label: "Grabar y comparar", description: "Grabarte, escucharte y compararte con un modelo.",
    competencies: ["Autoevaluación oral", "Comparación con un modelo"],
    act: "Give a model text; the learner records themself, compares with the model and lists differences (sounds, stress, pace) and a plan to improve.",
    judge: "The differences named are specific and plausible, and the improvement plan is concrete.", answerKind: "text", timer: "10m", noBeginner: true }),
  // ── Vocabulary (cross-cutting: one shared word bank) ──────────────────────
  s({ id: "vc_recall", area: "vocabulary", label: "Recuerdo de memoria", description: "Recordar la palabra o su significado sin ver la respuesta.",
    competencies: ["Recuerdo activo", "Rapidez"],
    act: "Give the meaning, a definition or a Spanish word and ask the learner to recall the English word (or the other way round) with no help.",
    judge: "Each answer is exactly the word (spelling included) or its correct meaning.", answerKind: "short", timer: "5m", noHelper: true }),
  s({ id: "vc_recognition", area: "vocabulary", label: "Reconocimiento", description: "Reconocer la palabra o su significado entre opciones.",
    competencies: ["Reconocimiento", "Discriminación de significados"],
    act: "Give words with several options (meaning, synonym or sentence) and ask which one is correct.",
    judge: "Each choice is correct; when the learner explains, the reason is right.", answerKind: "short", timer: "5m" }),
  s({ id: "vc_usage", area: "vocabulary", label: "Uso en oraciones", description: "Usar cada palabra en oraciones propias y naturales.",
    competencies: ["Uso en contexto", "Gramática de la palabra"],
    act: "Give words from the bank and ask the learner to write one original, natural sentence with each.",
    judge: "Each sentence uses the word with the right meaning, part of speech and grammar, and sounds natural.", answerKind: "text", timer: "10m" }),
  s({ id: "vc_families", area: "vocabulary", label: "Familias de palabras", description: "Formar y usar las palabras de una misma familia.",
    competencies: ["Formación de palabras", "Categorías gramaticales"],
    act: "Give a root word and ask for its family (noun, verb, adjective, adverb) with each form used in a sentence.",
    judge: "The forms exist, have the right suffixes and part of speech, and are used correctly.", answerKind: "text", timer: "10m", noBeginner: true }),
  s({ id: "vc_collocations", area: "vocabulary", label: "Colocaciones", description: "Elegir y usar las combinaciones naturales de palabras.",
    competencies: ["Colocaciones", "Naturalidad"],
    act: "Give sentences where the learner must choose or complete the natural collocation (make/do, heavy rain, take a decision…).",
    judge: "The collocations are the natural ones; calques from Spanish are errors.", answerKind: "short", timer: "5m" }),
];

export const ENGLISH_SKILL_IDS: readonly string[] = ENGLISH_SKILL_SPECS.map((x) => x.id);

export function englishSkillSpec(id: string): EnglishSkillSpec | undefined {
  return ENGLISH_SKILL_SPECS.find((x) => x.id === id.trim().toLowerCase());
}

export const isEnglishSkill = (id: string): boolean => englishSkillSpec(id) !== undefined;

/** The skills a topic of a branch can practise: its own branch plus the cross-cutting vocabulary ones. */
export function englishSkillsForBranch(branch: EnglishBranch): EnglishSkillSpec[] {
  return ENGLISH_SKILL_SPECS.filter((x) => x.area === branch || x.area === "vocabulary");
}

const fold = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** The branch a path belongs to, from its folder names (`Inglés/3 Lectura/3.1 …` → reading); null when none says. */
export function branchFromPath(rel: string): EnglishBranch | null {
  for (const part of rel.replace(/\\/g, "/").split("/")) {
    const name = fold(part).replace(/^\d+(?:\.\d+)*\s*[-.—–]*\s*/, "").trim();
    const hit = ENGLISH_BRANCHES.find((b) => b.words.includes(name));
    if (hit) return hit.id;
  }
  return null;
}

export function isEnglishBranch(value: unknown): value is EnglishBranch {
  return ENGLISH_BRANCHES.some((b) => b.id === String(value).trim().toLowerCase());
}

/**
 * A SUGGESTION (never applied automatically) of the branch of a topic from its name, to make explicit
 * resolution one click. Unknown → null.
 */
export function suggestBranch(name: string): EnglishBranch | null {
  const n = fold(name);
  const rules: Array<[EnglishBranch, RegExp]> = [
    [
      "listening",
      /\b(escucha|listening|dictado|dictation|audio|podcast|acento|accent)\b/,
    ],
    ["speaking", /\b(habla|speaking|pronunci|shadowing|roleplay|conversaci|oral)\b/],
    ["reading", /\b(lectura|reading|comprension|skimming|scanning)\b/],
    ["writing", /\b(escritura|writing|redaccion|email|correo|parrafo|paragraph|ensayo|essay)\b/],
    [
      "grammar",
      /\b(gramatica|grammar|tiempo|tense|present|past|future|perfect|conditional|passive|pasiva|articulo|article|preposicion|preposition|relative|reported|modal)\b/,
    ],
  ];
  return rules.find(([, re]) => re.test(n))?.[0] ?? null;
}

/** What a syllabus and a theory note of each branch is about; the generators quote it. */
export const ENGLISH_BRANCH_BRIEF: Record<EnglishBranch, { syllabus: string; theory: string }> = {
  grammar: {
    syllabus: "Each topic is ONE grammar point (a tense, articles, prepositions, conditionals, the passive, relative clauses, reported speech…), ordered by CEFR level from A2 to C1 and by dependency.",
    theory: "The note explains the rule (form, use, exceptions), contrasts it with Spanish and shows it in realistic work and daily-life sentences.",
  },
  writing: {
    syllabus: "Each topic is ONE writing sub-skill or text type (building sentences, linkers, a paragraph, an email, an opinion text, register, self-review), from A2 to C1.",
    theory: "The note teaches the structure of that text or sub-skill and includes a model text; the examples are short pieces of writing with why they work.",
  },
  reading: {
    syllabus: "Each topic is ONE reading strategy or text type (skimming and scanning, guessing words from context, inference, main ideas and summaries, text structure, articles, instructions, emails), from A2 to C1.",
    theory: "The note teaches the strategy step by step and uses short sample texts; the examples show the strategy applied to a text.",
  },
  listening: {
    syllabus: "Each topic is ONE listening skill or sound pattern (weak forms and contractions, numbers and dates, stress and rhythm, accents, meetings, phone calls, instructions), from A2 to C1.",
    theory: "The note explains the pattern or strategy and includes transcripts of sample audios; the examples are short transcripts with what to listen for.",
  },
  speaking: {
    syllabus: "Each topic is ONE communicative function or pronunciation pattern (introducing yourself, asking and answering, giving opinions, meetings, presentations, phone calls, problem sounds), from A2 to C1.",
    theory: "The note teaches the function or sound with model phrases and typical Spanish-speaker slips; the examples are short exchanges or phrases to say aloud.",
  },
};
