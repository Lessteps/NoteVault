// El tipo de una entrada de la biblioteca propia, en un fichero aparte y sin
// imports a propósito.
//
// Lo necesitan los dos mundos: el renderer mezcla el catálogo con tus
// ejercicios, y el proceso de Electron los guarda en el vault. Un fichero sin
// dependencias se puede incluir en los dos proyectos de TypeScript; colgarlo de
// `lib/types.ts` arrastraría su cadena de imports al `tsconfig.node.json`.

/**
 * Un ejercicio de la biblioteca que escribe la persona, guardado en
 * `.notevault/ejercicio/biblioteca.json`.
 */
export interface LibraryUserEntry {
  slug: string;
  name: string;
  equipment: string;
  muscles: { primary: string[]; secondary: string[] };
  how_to: string;
  /** Ruta del video dentro del vault, si el ejercicio propio tiene uno. */
  video_path?: string;
}

/**
 * La clave con la que se reconoce un ejercicio: sin mayúsculas y con los
 * espacios internos colapsados. Es lo que hace que «  MI   PRESS » y
 * «mi press» sean el mismo ejercicio y no dos.
 *
 * Vive aquí y no en el módulo de la API porque **los dos** tienen que usar la
 * misma: si el guardado normalizara de una manera y el store comprobara de
 * otra, un nombre con espacios dobles crearía un duplicado.
 */
export function normalizeLibraryName(name: string): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
