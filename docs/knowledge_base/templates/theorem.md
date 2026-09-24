---
id: <concept id>.t<NN, two digits, e.g. mat.logica.induccion.t02>
title: <theorem title in words, as in the syllabus key result>
number: "<concept number>-T<NN>"
subject: mathematics
concept: <concept id>
type: theorem
technique: <directa | contrarreciproco | contradiccion | casos | induccion | induccion-fuerte | construccion | doble-inclusion | contraejemplo | otra>
difficulty: <1-5>
status: draft
verified: false
---

# <concept number>-T<NN> <title>

## Enunciado
<The full, self-contained statement with LaTeX. Readable without the concept note.>

## Hipótesis
- **H1:** <first hypothesis, one condition per bullet>
- **H2:** <...>

## Conclusión
<What is claimed, alone.>

## Estrategia
<Max 30 words: the technique and what it is applied to. E.g. "Inducción sobre $n$ con $x$ fijo.">

## Idea clave
<1-3 sentences: the single trick without which the proof does not work.>

## Demostración
1. **Paso:** <one logical action: define, assume, compute, apply, conclude>
   **Por qué:** <justification, max 80 characters: rule, hypothesis (H1), definition or earlier step>
2. **Paso:** <...>
   **Por qué:** <...>
<At least 3 steps. The last step concludes and ends with $\blacksquare$.>

## Si se quita una hipótesis
- **Sin H1:** <a concrete counterexample showing the conclusion fails, with the numbers checked>
- **Sin H2:** <...>
<One bullet per hypothesis. If a hypothesis only fixes the setting and cannot be removed
meaningfully, write: - **Sin H2:** *(no removible: <reason>)*>

## Variantes para practicar
- <A modified statement to prove (stronger, weaker, converse, generalisation)>
- <At least 2>
