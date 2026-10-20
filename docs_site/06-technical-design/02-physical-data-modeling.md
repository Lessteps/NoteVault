# 02. Physical Data Modeling (Vault Format v4)

**Fase:** 06 — Diseño Técnico  
**Entregable:** 02  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Esquema Físico de Archivos en Disco (Equivalente DDL)

NoteVault sustituye las tablas SQL tradicionales por un **modelo físico particionado de archivos en texto plano estándar**:

### 1.1. Esquema de Hábitos Diarios (`.notevault/habits/YYYY/MM/YYYY-MM-DD.md`)
```yaml
---
date: 2026-10-20
completed:
  meditacion: true
  lectura_tecnica: true
  gimnasio: true
  cero_azucar: false
notes: "Texto breve de notas del día"
---
Cuerpo en formato Markdown correspondiente al diario personal.
```

### 1.2. Esquema de Series de Ejercicio (`.notevault/ejercicio/YYYY/MM/YYYY-MM-DD.json`)
```json
{
  "press_banca": {
    "done": true,
    "weight": 85.0,
    "reps": 8,
    "series": [
      { "set": 1, "reps": 10, "weight": 70.0 },
      { "set": 2, "reps": 8, "weight": 80.0 },
      { "set": 3, "reps": 8, "weight": 85.0 }
    ],
    "notes": "Buen descanso entre series"
  }
}
```

### 1.3. Esquema de Tarea (`.notevault/tareas/<task-id>.md`)
```yaml
---
id: task_20261020_001
title: Auditar pruebas de conformidad móvil
status: in_progress
priority: high
due: 2026-10-25
recurrence:
  type: weekly
  interval: 1
tags:
  - mobile
  - testing
created: 2026-10-20T10:00
updated: 2026-10-20T14:30
---
Descripción detallada de la tarea en Markdown.
```

---

## 2. Marco Conceptual: Esquema Físico de Persistencia en Disco

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que fija la estructura física del archivo (`physical_schema_id`: `SCHEMA-TASK-MARKDOWN-V4`) consultado por los serializadores de datos.
3. **Existe por sí misma en el contrato normativo (`docs/VAULT_FORMAT.md`) sin depender de controladores SQL**, y es la única responsable de garantizar que los tipos de datos, valores booleanos y fechas se escriban con absoluta consistencia en todas las plataformas.
4. **Punto de entrada y límite de consistencia:** Si un archivo físico no cumple con el esquema, el parser lo rescata preservando los datos intactos.

</div>
