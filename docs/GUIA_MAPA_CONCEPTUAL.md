# Guía — Mapas conceptuales en NoteVault (uso y correcciones)

Guía práctica para crear mapas conceptuales, corregirlos a mano y convertir los
buenos en plantillas mientras construimos "step 1.1" como base de los siguientes.

## 1. Generar un mapa
- **Hoy (por la IA):** dile a la IA (Claude/Antigravity) el mapa que quieres:
  idea central, conceptos, y la forma (radial / árbol / lista). La IA escribe el
  *spec* y genera el archivo `.canvas` en tu vault. Ya hay un ejemplo:
  `1.Problem_Statement/Mapa_Problem_Statement.canvas`.
- **Cuando exista el panel "Mapas"** (ver `docs/ANTIGRAVITY_HANDOFF.md`, Tarea 1):
  escribirás la orden, elegirás archivos de contexto y una plantilla, y pulsarás
  "Generar".

## 2. Corregir el mapa a mano (en el canvas)
- **Mover** una tarjeta: arrástrala. **Redimensionar**: agarra un borde (un lado)
  o una **esquina** (diagonal, ambos lados).
- **Conectar**: arrastra desde el punto medio de un borde a otra tarjeta; se
  engancha aunque no la aciertes justo.
- **Duplicar**: **Alt + clic** sobre una tarjeta.
- **Deshacer/Rehacer**: **Ctrl+Z** / **Ctrl+Shift+Z** (o Ctrl+Y). Cada cambio
  (mover, redimensionar, flecha, crear, borrar) es **un paso**; el historial
  guarda hasta **100** acciones.
- **Editar texto** de una tarjeta: doble clic (muestra el markdown crudo);
  al salir se re-renderiza (títulos con `#`, `##`, **negrita**, tablas).
- El canvas **se guarda solo** tras cada cambio y se **abre centrado** en el
  contenido.

## 3. Convertir un mapa bueno en plantilla
Cuando un mapa te sirva como estructura reutilizable:
1. Pídele a la IA el *spec* YAML de ese mapa (o cópialo si lo generaste tú).
2. Guárdalo en `docs/map_templates/<nombre>.yaml`.
3. Añade como primera línea `# name: <Nombre visible en español>`.
4. A partir de ahí, el panel "Mapas" lo ofrecerá como plantilla, y la IA lo usará
   como forma a rellenar.

## 4. Correcciones pendientes
Rellena aquí lo que esté mal; la IA lo lee para ajustar el generador o el prompt.
Formato: `- [fecha] <qué está mal> → <qué se espera>`

- [pendiente] Bug "espacio superior" de una tarjeta de texto: el espacio de
  arriba solo aparece tras clicar dos veces. No se pudo reproducir midiendo el
  layout (idéntico antes/después). **Se necesita:** captura marcando el área
  exacta con un círculo y la secuencia de clics precisa.
