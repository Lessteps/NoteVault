/**
 * The skills every study space starts with. They are plain notes in `<space>/_skills/`
 * that the AI reads when it creates content, so the user can edit them and the AI can
 * refine them ("write_skill" action). The three original ones (canvas, theory,
 * practice) are copied from a sibling subject when the vault already has them.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export const DEFAULT_SKILLS: Record<string, string> = {
  resumen_teorico_skill: `---
type: skill_template
skill: teoria_creation
---
# Skill: nota de teoría de un tema

Una nota por tema, en \`<tema>/<tema>.md\`. Español, riguroso y conciso; las fórmulas en LaTeX
(\`$...$\` en línea, \`$$...$$\` en bloque).

## Frontmatter
\`\`\`yaml
---
type: teorica
subject: <materia>
area: <carpeta del área>
topic: <carpeta del tema>
number: "1.1"
difficulty: 1
status: draft
tags: [materia, area, tema]
---
\`\`\`

## Estructura (en este orden)
1. \`# <número> <título>\`
2. \`## Requiere\`: los temas previos que hacen falta (enlaces \`[[...]]\`) o *Sin prerrequisitos.*
3. \`## Explicación\`
   - \`### Qué es\`: una frase (**En una frase.**) y luego cada definición formal en negrita
     (**Concepto.** definición), con su notación.
   - \`### Modelo mental\`: la imagen o analogía que hace intuitivo el tema.
4. \`## Ejemplos\`: 3 ejemplos trabajados paso a paso (\`### Ejemplo 1 — título\`).
5. \`## Errores comunes\`: 3–5 errores (\`### Error 1 — título\`) con por qué ocurre y cómo se corrige.
6. \`## Conexiones\`: con qué otros temas se relaciona y para qué sirve.
7. \`## Tarjetas\`: 6–9 tarjetas de repaso \`### T1 · definicion\` con **P:** y **R:** (tipos: definicion,
   notacion, ejemplo, contraejemplo, error, conexion).

## Reglas
- No inventes resultados: si no estás seguro de algo, no lo afirmes.
- Un tema = una idea; lo que sea de otro tema se enlaza, no se repite.
- El título y el número deben coincidir exactamente con el nombre de la carpeta del tema.
`,
  mapa_skill: `---
type: skill_template
skill: mapa
---
# Skill: mapa del área (canvas)

Cada **área agrupadora** (una carpeta que agrupa temas, con su \`.resumen\`) tiene un mapa:
un canvas \`00 Mapa — <área>.canvas\` dentro de su carpeta. Se crea automáticamente al generar
el temario; esta skill dice cómo debe ser si lo rehaces o lo mejoras.

## Estructura
1. **Nodo central**: el nombre del área y una frase de qué cubre.
2. **Un nodo por tema**, en el orden del temario (numeración natural: 1.2 antes que 1.10),
   con su número, su título y una línea de qué se aprende.
3. Los temas en filas de cuatro, de izquierda a derecha, en serpiente.

## Flechas (todas con etiqueta)
- Central → primer tema: "empieza por".
- Tema → siguiente: "prepara para" (o el motivo real si es otro: "necesita", "aplica").
- Toda flecha explica la conexión; nunca hay una flecha sin etiqueta.

## Colores
Un color por bloque de temas relacionados; el nodo central en el color de acento.
`,
  temario_skill: `---
type: skill_template
skill: temario
---
# Skill: generar el temario

Proceso para proponer las áreas y los temas de una materia. Se hace en pasos y sin exigirle al
usuario decisiones técnicas: tú infieres nivel, alcance y profundidad.

1. **Área y objetivo**: qué se estudia y qué resultado concreto se quiere.
2. **Diagnóstico**: como máximo 5 preguntas cortas (qué sabe ya, qué ha hecho, tiempo).
3. **Prerrequisitos**: qué conocimientos hacen falta; si faltan, una "Fase 0" (área \`0 …\`).
4. **Foco y extensiones**: el foco orienta la selección; ofrece extensiones complementarias
   y deja que el usuario las acepte, rechace o ignore.
5. **Propuesta**: áreas numeradas (\`1 Nombre\`) con 6–12 temas (\`1.1 Nombre\`), ordenados por
   dependencias de aprendizaje.

## Reglas
- Nombres de carpeta: \`N Nombre\` y \`N.M Nombre\`, sin \`/ \\ : * ? " < > |\`.
- Ningún tema repetido; cada tema es una sola idea que se pueda practicar.
- Los nombres deben ser idénticos en teoría, práctica y canvas.
`,
  subtemas_skill: `---
type: skill_template
skill: subtemas
---
# Skill: generar subtemas y temas nuevos

Cómo añadir un tema (o dividir uno) dentro de un área ya existente.

1. Lee los temas actuales del área y elige una numeración que respete el orden natural
   (\`1.13\` va después de \`1.12\`; para insertar en medio, renumera solo si el usuario lo pide).
2. Comprueba que no duplica un tema existente ni invade el de otro.
3. Crea, dentro de la carpeta del tema: la nota de teoría \`<tema>.md\` (sigue
   \`resumen_teorico_skill\`) y su vista de práctica \`<tema>.practica.md\`.
4. Dile al usuario que use el botón de la varita del tema para que la IA elija las
   competencias y cuántos ejercicios hacer de cada una.
5. Si el tema es grande, propón dividirlo en subtemas con su propia carpeta y numeración
   (\`1.5.1\`, \`1.5.2\`).
`,
};

/** A sibling subject's `_skills` folder: "Matemáticas 1" → "Matemáticas". */
function siblingSkillsDir(rootAbs: string, spaceFolder: string): string | null {
  const stem = spaceFolder.replace(/\s*\d+\s*$/, "").trim();
  const candidates = [stem, ...fs.readdirSync(rootAbs, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)];
  for (const name of candidates) {
    if (!name || name === spaceFolder || name.startsWith(".")) continue;
    const dir = path.join(rootAbs, name, "_skills");
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

/** Makes sure `<space>/_skills` has every default skill; existing files are never touched. Returns what it created. */
export function ensureDefaultSkills(rootAbs: string, spaceFolder: string): string[] {
  const dir = path.join(rootAbs, spaceFolder, "_skills");
  fs.mkdirSync(dir, { recursive: true });
  const created: string[] = [];
  const put = (file: string, content: string) => {
    const target = path.join(dir, file);
    if (fs.existsSync(target)) return;
    fs.writeFileSync(target, content, "utf-8");
    created.push(`${spaceFolder}/_skills/${file}`);
  };
  // The built-in skills first (they are the up-to-date ones); a sibling subject then
  // only contributes files this space does not have (its own canvas / practice notes).
  for (const [name, content] of Object.entries(DEFAULT_SKILLS)) put(`${name}.md`, content);
  const sibling = siblingSkillsDir(rootAbs, spaceFolder);
  if (sibling) {
    for (const f of fs.readdirSync(sibling)) {
      if (f.toLowerCase().endsWith(".md")) put(f, fs.readFileSync(path.join(sibling, f), "utf-8"));
    }
  }
  return created;
}
