# NoteVault — nueva interfaz (HTML + CSS + TypeScript)

La interfaz nueva vive en `frontend/` (Vite + React + TypeScript + Tailwind) y se
abre en una ventana de escritorio con **pywebview** (`run_web.py`). La lógica sigue
en Python (`notevault_app/core/`) y se expone a la interfaz por
`notevault_app/webapp/api.py`.

## Ejecutar

```bash
pip install pywebview          # una vez
cd frontend && npm install && npm run build && cd ..
python run_web.py              # la app
python run_web.py --debug      # con herramientas de desarrollador
```

Desarrollo con recarga en caliente:

```bash
cd frontend && npm run dev     # terminal 1
python run_web.py --dev        # terminal 2
```

La app clásica (`python run_app.py`) sigue funcionando mientras se migran los
módulos restantes.

## Estado de la migración

| Módulo | Estado |
|---|---|
| Notas (explorador, pestañas, lectura, editor, búsqueda, marcadores, etiquetas, backlinks, grafo, propiedades, asistente IA, Ctrl+P) | ✅ migrado |
| Paleta de comandos (Ctrl+Shift+P): formato, listas y casillas (Ctrl+L), tablas (Ctrl+Shift+T y edición de filas/columnas), plantillas, nota diaria (Ctrl+Shift+D), atajos (Ctrl+,) | ✅ migrado |
| Tareas (tabla editable, filtros, calendario con repeticiones, recordatorios, subtareas) | ✅ migrado |
| Hábitos (vista general con racha, diaria con subtareas y diario, semanal, mensual, anual, gestionar) | ✅ migrado |
| Vista General (resumen del día con casillas de todos los módulos y registro rápido de gastos) | ✅ migrado |
| Calendario (día, semana con arrastrar para crear/mover/estirar, mes, agenda, editor de eventos, rutinas, filtros) | ✅ migrado |
| Proyectos (tablero de proyectos, resumen con gráficas, Kanban, lista, calendario, notas, panel de issue, adjuntos, rúbrica) | ✅ migrado |
| Metas (tablero por áreas, Hoy, submetas en tarjetas/árbol/detalle, historial, notas, áreas) | ✅ migrado |
| Finanzas (diario, semanal, mensual, anual, metas de ahorro, categorías con presupuesto, facturas, CSV) | ✅ migrado |
| Ejercicio (vista general, registro semanal, un día por vista, gestionar rutina, reproductor de video) | ✅ migrado |
| Canvas (tarjetas de texto, notas, imágenes, enlaces, grupos, formas de diagrama, dibujo libre, flechas con etiqueta y estilo, zoom, deshacer, cuadrícula; mismo formato que Obsidian) | ✅ migrado |
| Práctica (notas `type: exercise`: enunciado, pistas, cronómetro/pomodoro, corrección por IA por API, web o archivo de intercambio, historial, cálculo rápido) | ✅ migrado |
| Escalera de demostración (L1–L6 para notas de teorema: estrategia, ordenar, completar, justificar, en blanco, variante) | ✅ migrado |
| Estudio (panel lateral del área: cola de hoy con repasos y tarjetas, ledger de skills y conceptos, registro de errores) | ✅ migrado |
| Generador de mapas conceptuales (orden + notas de contexto + plantilla → IA → canvas; también YAML pegado) | ✅ migrado |
| WEB (Ctrl+Shift+P → WEB: navegador en ventana aparte con restricciones, marcadores, historial, tiempo por sitio y límites diarios) | ✅ migrado |

## Seguridad

- Toda ruta que llega de la interfaz se valida contra el vault (`..`, rutas
  absolutas, enlaces simbólicos hacia fuera y carpetas internas como `.trash`
  se rechazan). Solo se escriben notas y archivos de código existentes.
- El HTML de las notas pasa por DOMPurify: una nota nunca ejecuta código.
- La ventana nunca navega: los enlaces externos se abren en el navegador del
  sistema (solo `http`, `https` y `mailto`).
- CSP estricta: nada remoto, sin scripts inline. `'unsafe-eval'` está permitido
  solo porque el puente de pywebview lo necesita.
- El puente HTTP de desarrollo (`python -m notevault_app.webapp.devserver`)
  escucha solo en 127.0.0.1, exige un token por sesión y valida el `Host`.
- Los videos de Ejercicio se sirven desde un servidor local mínimo
  (`webapp/media.py`): solo 127.0.0.1, un token aleatorio por video y solo los
  archivos que la API registró; la CSP permite medios solo desde 127.0.0.1.
- Los datos que terminan en frontmatter (nombres, etiquetas…) se guardan en una
  sola línea: no pueden inyectar claves nuevas en el archivo.
- Los canvas se validan al guardar (ids, tipos, colores, tamaños y número de
  nodos acotados; flechas solo entre nodos existentes). Las tarjetas de
  archivo solo leen archivos del vault.
- Práctica: los pasos ocultos de la escalera y las respuestas del cálculo rápido
  no se envían a la página antes de tiempo; las solicitudes de corrección solo
  se aceptan con su id exacto y para la nota que las creó.
- WEB: las páginas se abren en una segunda ventana **sin** el puente de Python;
  las reglas se comprueban cada segundo y una página bloqueada se sustituye
  por un aviso. Solo se abren direcciones http/https.
- Adjuntos (capturas, facturas): solo imágenes y PDF, 15 MB como máximo, dentro
  de `.notevault/<módulo>/adjuntos/`; al quitarlos van a la papelera del vault.

## Pruebas

```bash
python -m pytest tests/test_webapp_*.py tests/test_webui_e2e.py
cd frontend && npm test && npm run typecheck
```

## Pendiente conocido

- Los recordatorios de Tareas se avisan **dentro de la app** (cada minuto). La
  notificación del sistema operativo que daba la app clásica todavía no está en
  la versión web.
