/**
 * The skills every study space starts with. They are plain notes in `<space>/_skills/`
 * that the AI reads when it creates content, so the user can edit them and the AI can
 * refine them ("write_skill" action). Sibling-subject skills only fill files this list
 * does not define (see ensureDefaultSkills).
 *
 * The theory skill is a CONTRACT: the topic-map generator (tools/kb_canvas.ts) parses
 * exactly these sections and fields, so a note that follows it always yields a map.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const FENCE = "```";

export const DEFAULT_SKILLS: Record<string, string> = {
  resumen_teorico_skill: `---
type: skill_template
skill: teoria_creation
---
# Skill: nota de teoría de un tema

Una nota por tema, en \`<tema>/<tema>.md\`. Español, riguroso y conciso. Fórmulas en LaTeX
(\`$...$\` en línea, \`$$...$$\` en bloque). **Esta estructura es un contrato**: el mapa del tema
(\`<tema> — mapa.canvas\`) se genera leyendo estas secciones y estos campos, y si falta algo el mapa
no se puede construir.

## Frontmatter
${FENCE}yaml
---
id: mat.aritmetica.tema
title: <título sin número>
number: "1.1"
area: "<carpeta del área>"
topic: "<carpeta del tema>"
type: teorica
difficulty: 1
subject: mathematics
prerequisites: []
status: draft
verified: false
sources: []
tags: [materia, area, tema]
---
${FENCE}

## Estructura (exactamente estos encabezados, en este orden)

1. \`# <número> <título>\`
2. \`## Requiere\`: una línea \`- [[Tema previo]] — por qué hace falta\` por cada prerrequisito (el nombre
   entre corchetes es EXACTAMENTE el de otro tema ya existente), o \`*Sin prerrequisitos.*\`.
3. \`## Explicación\` con dos subsecciones:
   - \`### Qué es\`: una frase (**En una frase.** …), luego cada definición en negrita
     (**Concepto.** definición formal) con su notación en LaTeX.
   - \`### Modelo mental\`: la imagen o analogía que hace intuitivo el tema, y 3–5 viñetas con
     **negrita** que la aplican.
4. \`## Ejemplos\` con 3 ejemplos \`### Ejemplo N — título\`. Cada uno son EXACTAMENTE estas cuatro viñetas:
   - \`- **Contexto:** …\`
   - \`- **Caso:** …\`
   - \`- **Resultado esperado:** …\`
   - \`- **Por qué funciona:** …\`
5. \`## Errores comunes\` con 4–5 errores \`### Error N — título\`. Cada uno son EXACTAMENTE cuatro viñetas:
   - \`- **Error:** …\`
   - \`- **Síntoma:** …\`
   - \`- **Causa:** …\`
   - \`- **Solución:** …\`
6. \`## Conexiones\`: con qué otros temas se relaciona y para qué sirve.
7. \`## Tarjetas\`: 6–9 tarjetas \`### T1 · definicion\` con \`**P:**\` y \`**R:**\`
   (tipos: definicion, notacion, ejemplo, contraejemplo, error, conexion).

## Reglas
- No inventes resultados: si no estás seguro de algo, no lo afirmes.
- Un tema = una idea; lo que sea de otro tema se enlaza, no se repite.
- El título y el número coinciden exactamente con el nombre de la carpeta del tema.
- Cada viñeta de un ejemplo o error es un párrafo corto (una o dos frases): el mapa la dibuja en una tarjeta.
`,

  mapa_skill: `---
type: skill_template
skill: mapa
---
# Skill: mapas (canvas) de una materia

Hay TRES niveles de mapa. Todos cumplen: **toda flecha lleva etiqueta que explica la conexión**, nada
se solapa y cada grupo envuelve a sus tarjetas. Los dos primeros se crean solos al generar el temario;
el tercero se genera desde la nota de teoría.

## 1. Mapa de la materia — \`<materia>/00 Mapa de <materia>.canvas\`
Un **grupo por bloque** (\`Bloque I — Aritmética\`, uno cada 680 px, 414 de ancho) y dentro una tarjeta de
texto (360 de ancho) con el área y sus temas como enlaces. Flechas entre áreas, etiqueta \`N prerrequisito(s)\`.
${FENCE}json
{"nodes":[
 {"id":"g1","type":"group","x":0,"y":0,"width":414,"height":584,"label":"Bloque I — Aritmética","nv":{"zIndex":-2}},
 {"id":"a1","type":"text","x":24,"y":48,"width":360,"height":506,"text":"## 1 Aritmética elemental y operativa\\n\\n- [[1.1 Números naturales]]\\n- [[1.2 Suma y resta]]"}],
 "edges":[{"id":"e1","fromNode":"a1","fromSide":"right","toNode":"a2","toSide":"left","label":"4 prerrequisito(s)"}]}
${FENCE}

## 2. Mapa del área — \`<área>/00 Mapa — <área>.canvas\`
Un **grupo grande** (color \`6\`, con el nombre del área, en x −24 / y −48) con una tarjeta \`file\` de 300×120
por tema. Columnas por dependencia (una cada 640 px; 210 px por fila): un tema va a la derecha de aquellos
de los que depende. Flechas de derecha a izquierda (\`right\` → \`left\`) con el MOTIVO de la dependencia.
${FENCE}json
{"nodes":[
 {"id":"area","type":"group","x":-24,"y":-48,"width":1348,"height":378,"color":"6","label":"1 Aritmética elemental y operativa","nv":{"zIndex":-2}},
 {"id":"t1","type":"file","x":0,"y":0,"width":300,"height":120,"file":"Matemáticas/1 Aritmética/1.1 Números naturales/1.1 Números naturales.md"},
 {"id":"t2","type":"file","x":640,"y":0,"width":300,"height":120,"file":"Matemáticas/1 Aritmética/1.2 Suma y resta/1.2 Suma y resta.md"}],
 "edges":[{"id":"e1","fromNode":"t1","fromSide":"right","toNode":"t2","toSide":"left","label":"orden y signo en la recta numérica"}]}
${FENCE}

## 3. Mapa del tema — \`<tema>/<tema> — mapa.canvas\`
Se genera desde la nota de teoría (ver \`resumen_teorico_skill\`), con cuatro paneles de izquierda a derecha:
- **Requiere** (grupo): una tarjeta enlace por prerrequisito, o "Sin prerrequisitos.".
- **Explicación** (grupo, color 6): un panel \`## Qué es\` (color 5, el más ancho: 620) y un panel \`## Modelo mental\`
  (color 6). Flecha \`se entiende con\`.
- **Ejemplos** (grupo, color 4): un grupo por ejemplo con 4 paneles apilados: \`### Contexto\` → \`### Caso\` →
  \`### Resultado esperado\` → \`### Por qué funciona\` (flechas \`el caso concreto\`, \`da como resultado\`,
  \`funciona porque\`); entre ejemplos \`otro caso\`; desde Modelo mental \`se aplica en\`.
- **Errores comunes** (grupo, color 3): un grupo por error con su panel; desde "Qué es" flechas \`se falla cuando\`.
Cada panel tiene la altura de su texto (sin recortes) y 460 de ancho.
`,

  practica_skill: `---
type: skill_template
skill: practica
---
# Skill: qué se practica en cada tema (matriz de competencias)

Cada tema tiene SU matriz: las competencias (skills) que entrena y, para cada una, cuántos ejercicios
aprobados pide en dificultad fácil / media / difícil. La decide la IA leyendo la teoría, y solo se
practica eso. Se guarda en el \`.practica.md\` del tema (\`plan: solve=3/4/2, …\`).

## Primero: qué tipo de tema es
- **teórico**: trata de definiciones, conceptos, representaciones, clasificaciones, propiedades o demostraciones
  (qué es algo y cómo se relaciona). Ej.: naturales, enteros y recta numérica; qué es una fracción; conjuntos.
- **procedimental**: el objetivo es ejecutar un método o un cálculo. Ej.: suma y resta de enteros, división,
  simplificar fracciones, porcentajes.
- **mixto**: las dos cosas pesan lo mismo. Ej.: mcd y mcm.

## Qué skills encajan (matemáticas)
| Skill | Entrena | Teórico | Procedimental | Mixto |
|---|---|---|---|---|
| \`explain\` Explicar | claridad conceptual, ejemplo propio | sí | no | sí |
| \`true_false\` Verdadero o falso | discernir propiedades | sí | no | sí |
| \`counterexample\` Contraejemplo | casos límite, refutar | sí | no | sí |
| \`prove\` Demostración | rigor, cadena deductiva | sí | no | sí |
| \`find_error\` Encontrar el error | detectar el paso fallido | sí | no | sí |
| \`solve\` Problema | modelar y resolver | no | sí | sí |
| \`process\` Procedimiento guiado | método paso a paso | no | sí | sí |
| \`drill\` Cálculo rápido | agilidad y estimación | **nunca** | sí | no |

## Reglas
- Un tema teórico NUNCA lleva \`drill\`; uno procedimental no lleva demostraciones.
- 3–6 skills por tema; total típico por skill 3–10; 0 en el nivel que no tenga sentido.
- \`find_error\` no tiene nivel fácil; \`drill\` va siempre sin ayuda.
- Los ejercicios se guardan en \`<tema>/Ejercicios/<skill>/\`.
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
6. **Dependencias**: para cada área, qué tema necesita a cuál y por qué (una etiqueta corta): alimenta el
   mapa del área (\`mapa_skill\`).

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
   \`resumen_teorico_skill\`, es un contrato), su vista de práctica \`<tema>.practica.md\` y su mapa.
4. Elige la matriz de competencias del tema (\`practica_skill\`) con el botón de la varita.
5. Si el tema es grande, propón dividirlo en subtemas con su propia carpeta y numeración
   (\`1.5.1\`, \`1.5.2\`).
6. Añade el tema al mapa del área con su dependencia y su etiqueta.
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

/**
 * Makes sure `<space>/_skills` has every default skill; existing files are never touched.
 * Returns what it created. `refresh` names default skills to REPLACE even if present
 * (used once to upgrade the thin first-generation templates of an existing subject).
 */
export function ensureDefaultSkills(rootAbs: string, spaceFolder: string, refresh: readonly string[] = []): string[] {
  const dir = path.join(rootAbs, spaceFolder, "_skills");
  fs.mkdirSync(dir, { recursive: true });
  const created: string[] = [];
  const put = (file: string, content: string, force = false) => {
    const target = path.join(dir, file);
    if (fs.existsSync(target) && !force) return;
    fs.writeFileSync(target, content, "utf-8");
    created.push(`${spaceFolder}/_skills/${file}`);
  };
  // The built-in skills first (they are the up-to-date ones); a sibling subject then
  // only contributes files this space does not have (its own canvas / practice notes).
  for (const [name, content] of Object.entries(DEFAULT_SKILLS)) put(`${name}.md`, content, refresh.includes(name));
  const sibling = siblingSkillsDir(rootAbs, spaceFolder);
  if (sibling) {
    for (const f of fs.readdirSync(sibling)) {
      if (f.toLowerCase().endsWith(".md")) put(f, fs.readFileSync(path.join(sibling, f), "utf-8"));
    }
  }
  return created;
}
