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
| Notas (explorador, pestañas, lectura, editor, búsqueda, marcadores, backlinks, Ctrl+P) | ✅ migrado |
| Tareas (tabla editable, filtros, calendario con repeticiones, recordatorios, subtareas) | ✅ migrado |
| Vista general, Calendario, Hábitos, Ejercicio, Proyectos, Metas, Finanzas | ⏳ en la app clásica |
| Canvas, práctica, grafo, asistente IA, WEB | ⏳ en la app clásica |

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

## Pruebas

```bash
python -m pytest tests/test_webapp_api.py tests/test_webapp_tasks.py tests/test_webui_e2e.py
cd frontend && npm test && npm run typecheck
```

## Pendiente conocido

- Los recordatorios de Tareas se avisan **dentro de la app** (cada minuto). La
  notificación del sistema operativo que daba la app clásica todavía no está en
  la versión web.
