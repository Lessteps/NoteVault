# Guía de Referencia — Crear temas con Antigravity en NoteVault

Esta guía describe el flujo de 1 página para crear temas faltantes de referencia (HTML, CSS, JavaScript Reference y Java), validarlos e integrarlos automáticamente a tu plan de estudio.

---

## 1. Pasos en la aplicación NoteVault

1. **Abrir el área:** Ve a **Áreas** del Mentor, abre **Programación** y entra a un área con la marca **«Desarrollo insuficiente»** (empezar por **HTML**, luego **CSS**, luego **JavaScript Reference**, y finalmente **Java**).
2. **Ver temas pendientes:** Pulsa el botón **«Ver temas por crear»**.
3. **Seleccionar lote:** Elige **«Seleccionar esenciales faltantes»** (se recomienda un máximo de 25 temas por tanda para que el agente termine con precisión).
4. **Generar la tarea:** Pulsa **«Crear con Antigravity»** y confirma. La app escribirá el archivo de tarea en la vault (`Programación/_handoff/crear/<fecha>_<área>.md`).
5. **Copiar la orden:** Copia el mensaje corto que aparece en la tarjeta.

---

## 2. Texto exacto para pegar en Antigravity

Pega exactamente la frase proporcionada por la app en el chat de Antigravity:

```text
Read <ruta-del-archivo> and execute it. Create only the folders and files that file lists, change nothing else, and tell me when you are done.
```

*Nota: La ruta absoluta o relativa la genera la propia app de forma automática.*

---

## 3. Ejecución y validación

1. **Espera la confirmación de Antigravity:** El agente creará únicamente las carpetas de los temas, las notas conceptuales (`.md`), los manifiestos (`.practica.md`) y actualizará el temario (`00 Temario.md`).
2. **Validar en NoteVault:** Vuelve a la app y pulsa el botón **«Ya terminó — validar»**.
3. **Añadir al plan:** Una vez validado (0 problemas), pulsa **«Añadir al plan»**:
   - HTML, CSS y JavaScript Reference se incorporan al final de la ruta de **Frontend**.
   - Java se incorpora como una nueva área de estudio.
   - El cronograma y ritmo de estudio se recalculan automáticamente sin alterar el orden previo.

---

## 4. Cómo corregir errores

Si al pulsar «Ya terminó — validar» la app reporta problemas o advertencias:

1. **Copiar la lista de problemas:** Copia los errores que lista la app (por ejemplo: falta frontmatter `curriculum_id`, falta elemento obligatorio en la nota, o falta enlace en `00 Temario.md`).
2. **Pedir corrección a Antigravity:** Pega en el chat:
   ```text
   La validación reportó los siguientes problemas en la tarea anterior. Por favor corrígelos:
   <pega aquí la lista de problemas>
   ```
3. **Revalidar:** Una vez que Antigravity confirme los ajustes, pulsa nuevamente **«Ya terminó — validar»** en NoteVault.
