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
}
