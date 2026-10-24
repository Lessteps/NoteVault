# Plan: NoteVault Mobile (reescritura en React Native, solo Android)

Estado: borrador del 23 oct 2026. Decisiones del usuario: reescribir desde cero, paridad amplia,
solo Android, React Native, el vault se comparte como carpeta (incluye `.notevault/`).

## 1. Contexto

- App anterior: Flutter/Android (`Lessteps/notevault-mobile`, última actividad 24 sep). Escrita contra el desktop
  Python/PySide6, ya reemplazado por TypeScript + Electron. Queda como referencia (tag `flutter-legacy`).
- El único contrato entre desktop y móvil es el formato de archivos: `docs/VAULT_FORMAT.md`. Gana el desktop.
- Reglas heredadas que siguen vigentes: UI en español; un cambio de formato se hace en desktop y móvil a la vez;
  los writers deben producir bytes idénticos a los del desktop (tests de conformidad con fixtures);
  nunca autoguardar una nota reserializada que pierda contenido.

## 2. Arquitectura

- **Expo (dev build, no Expo Go) + React Native + TypeScript** estricto. Android únicamente.
- **Acceso al vault**: el usuario elige la carpeta una vez (Storage Access Framework, permiso persistente) y la
  app lee/escribe directamente dentro de ella, incluida `.notevault/`. La sincronización entre PC y teléfono es
  externa (Syncthing, Drive u otra herramienta de carpeta); la app no sincroniza.
  - Capa `VaultFS` con interfaz mínima (list, read, write, stat, mtime) sobre SAF; es el único punto dependiente
    de la plataforma y permite tests con un FS en memoria.
- **`vault-core`** (paquete TS puro, sin dependencias de RN): tipos, parsers y writers del formato, recurrencia,
  progreso. Objetivo: extraerlo del desktop (`src/lib`) y consumirlo en ambos, para no mantener dos implementaciones.
  Hasta que se extraiga, se copia con tests de conformidad que fallan si divergen.
- **Capas**: `vault-core` → `VaultFS` → stores por módulo (estado + caché en memoria) → pantallas.
- **Conflictos de sincronización**: escritura atómica (temp + rename cuando SAF lo permita), comparar `mtime`
  antes de guardar, y si el archivo cambió en disco, recargar y avisar en vez de pisar.
- **Rendimiento**: `ejercicio/` pesa ~73 MB (el resto < 3 MB). Indexar bajo demanda y no cargar `ejercicio/`
  completo al inicio. Considerar excluirlo de la sincronización móvil si el medio es lento.
- **UI**: replicar el lenguaje visual del desktop (ver `AI_HANDBOOK.md`: barras de progreso de bloques cuadrados,
  checkboxes cuadrados vacíos, bordes superiores de acento). Navegación con tabs inferiores + pila por módulo.
- **Notificaciones locales** para hábitos, agenda y recordatorios (expo-notifications / alarmas exactas).

## 3. Fases

### Fase 0 — Cimientos (hasta que la app abra un vault real)
1. Inventario del formato vigente: recorrer `VAULT_FORMAT.md` y marcar por módulo lectura / edición / captura.
2. Repo limpio en `Lessteps/notevault-mobile` (rama `main`; Flutter archivado con tag).
3. Proyecto Expo + TS + lint + tests (Jest) + CI mínima.
4. `VaultFS` sobre SAF, selector de carpeta, permiso persistente, detección de `.notevault/`.
5. `vault-core` mínimo: parseo de frontmatter, versión de formato, fixtures de conformidad.

### Fase 1 — Día a día
Notas (lectura con markdown, luego edición con modo Editar idéntico a Lectura), tareas con repetición,
hábitos, agenda, captura rápida, papelera. Notificaciones.

### Fase 2 — Gestión
Áreas, metas (con submetas y progreso), proyectos tipo Jira, finanzas, ejercicio, alimentación.

### Fase 3 — Aprendizaje
Mentor (plan por áreas, agenda, «Empezar hoy», registros de sesión), estudio y práctica (intentos, errores,
exámenes), web (marcadores) y canvas (lectura primero).

Criterio de salida de cada fase: pasa conformidad contra fixtures del desktop y se probó en un teléfono real
con una copia del vault.

## 4. Riesgos

| Riesgo | Mitigación |
|---|---|
| SAF es lento y tiene API incómoda (sin rutas reales) | Capa `VaultFS` aislada, caché de listados, pruebas temprano en Fase 0 |
| Conflictos al sincronizar (PC y móvil escriben a la vez) | mtime + recarga + aviso; nunca sobrescribir a ciegas |
| Divergencia del formato entre desktop y móvil | `vault-core` compartido o tests de conformidad con fixtures |
| `ejercicio/` de 73 MB | Carga perezosa; opción de excluirlo de la sincronización |
| Paridad amplia es mucho trabajo | Fases con salida verificable; Fase 1 ya es útil por sí sola |

## 5. Preguntas abiertas

- Herramienta de sincronización elegida (Syncthing, Drive, otra). Condiciona el manejo de conflictos.
- ¿Extraer `vault-core` del desktop ahora (refactor) o copiar primero y extraer luego?
- ¿Canvas y Mentor en edición, o solo lectura en móvil para la v1?
