# 01. Codebase & Folder Architecture

**Fase:** 06 — Diseño Técnico  
**Entregable:** 01  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Topología Física Estricta de Carpetas

### Desktop (PC Windows, macOS, Linux)
```
NoteVault/frontend/
├── electron/
│   ├── main.ts                    # Ciclo de vida Electron, gestión de ventanas y IPC handler
│   └── preload.ts                 # Script de preload con contextBridge blindado
├── src/
│   ├── api/                       # Despacho y registro de métodos IPC
│   │   ├── registry.ts            # Registro de métodos y resolución segura
│   │   ├── appState.ts            # Estado en memoria de la bóveda activa
│   │   └── modules/               # Controladores API por módulo funcional (93 archivos)
│   ├── core/                      # Dominio y gestores de negocio puros
│   │   ├── vaultManager.ts        # Apertura, migración y escaneo
│   │   ├── notesService.ts        # I/O de notas y backlinks
│   │   ├── habitManager.ts        # Hábitos y rachas
│   │   ├── exerciseManager.ts     # Ejercicios y logs de series
│   │   ├── taskManager.ts         # Tareas y recurrencias
│   │   ├── projectManager.ts      # Proyectos y Kanban
│   │   ├── financeManager.ts      # Finanzas y balances
│   │   ├── studySrsManager.ts     # Repetición espaciada SRS
│   │   ├── mentor/                # Motor del plan de estudio
│   │   └── canvas/                # Motor de generación de mapas
│   ├── components/                # Árbol de componentes React 19
│   ├── store/                     # Stores Zustand (navState, tabState)
│   ├── lib/                       # bridge.ts y utilidades de cliente
│   ├── App.tsx                    # Layout raíz y pestañas múltiples
│   └── main.tsx                   # Punto de entrada de renderizado
```

### Mobile (Android & iPhone / iOS)
```
notevault_mobile/
├── lib/
│   ├── core/                      # Réplica simétrica en Dart
│   │   ├── vault_format.dart      # Contrato canónico de formato (v4)
│   │   ├── vault_service.dart     # Acceso al sistema de archivos móvil
│   │   ├── habit_manager.dart     # Homólogo de HabitManager
│   │   ├── exercise_manager.dart  # Homólogo de ExerciseManager
│   │   ├── task_manager.dart      # Homólogo de TaskManager
│   │   ├── project_manager.dart   # Homólogo de ProjectManager
│   │   └── finance_manager.dart   # Homólogo de FinanceManager
│   ├── ui/
│   │   ├── screens/               # Pantallas Flutter completas
│   │   ├── widgets/               # Widgets reutilizables (barras, tarjetas)
│   │   └── theme/                 # Tokens visuales y tipografía
│   └── main.dart                  # Punto de entrada Flutter
```

---

## 2. Marco Conceptual: Topología de Código Fuente

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que fija la ruta canónica de cada paquete (`codebase_folder_id`: `FOLDER-FRONTEND-CORE`) consultado en las reglas de importación.
3. **Existe por sí misma en el diseño de implementación sin depender de enlaces dinámicos**, y es la única responsable de garantizar la modularidad *Package by Feature* y la inversión de dependencias.
4. **Punto de entrada y límite de consistencia:** Prohíbe que componentes de presentación importen directamente APIs del sistema operativo sin pasar por la capa de servicio.

</div>
