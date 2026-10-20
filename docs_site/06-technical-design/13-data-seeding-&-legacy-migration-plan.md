# 13. Data Seeding & Legacy Migration Plan

**Fase:** 06 — Diseño Técnico  
**Entregable:** 13  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Migración Automática y Datos Semilla

### 1.1. Migración No Destructiva desde la Versión 1 a la Versión 4
En las versiones tempranas de NoteVault, las carpetas `habits`, `ejercicio`, `tareas` y `proyectos` residían en la raíz de la bóveda.

El método `VaultManager.migrateVault()` (`frontend/src/core/vaultManager.ts`) y su homólogo en Dart implementan la migración automática:
1. Al abrir la bóveda por primera vez, el sistema detecta si existen carpetas heredadas en la raíz.
2. Si existen, crea `.notevault/` y mueve los archivos hacia sus nuevas ubicaciones.
3. **Regla de No Sobreescritura:** Si un archivo ya existe en el destino, **el archivo destino gana** y la copia antigua se conserva en disco. Una bóveda a medio sincronizar nunca puede perder datos.

### 1.2. Datos Semilla (Defaults)
Si una bóveda nueva se inicializa por primera vez:
- Se genera `habits_config.json` con 15 hábitos esenciales sugeridos.
- Se genera `exercises.json` con la rutina base de entrenamiento y ejercicios de estiramiento.
- Se crean los directorios internos de trabajo sin tocar el espacio de notas del usuario.

---

## 2. Marco Conceptual: Procedimiento de Migración No Destructiva

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que sella el protocolo de migración de bóveda (`migration_plan_id`: `MIGRATE-V1-TO-V4-SAFE`) consultado en el arranque de la app.
3. **Existe por sí misma en el gestor de bóveda sin depender de la interacción del usuario**, y es la única responsable de garantizar la compatibilidad hacia atrás sin pérdida de información.
4. **Punto de entrada y límite de consistencia:** Si ocurre un error durante el movimiento de un archivo, la copia original se conserva intacta.

</div>
