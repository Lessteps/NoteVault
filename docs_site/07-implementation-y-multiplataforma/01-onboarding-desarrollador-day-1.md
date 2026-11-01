# 07. Implementación — Onboarding de Desarrolladores (Day 1)

**Propósito:** Proporcionar la guía paso a paso para que cualquier nuevo ingeniero de software o agente de IA sea 100% productivo en su primer día levantando el entorno, ejecutando pruebas y entendiendo la navegación del código en Desktop y Mobile.

---

## 1. Marco Conceptual: Entorno de Desarrollo Local (DevEnv)

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que combina el perfil del desarrollador y la máquina de trabajo (`workspace_env_id`: ej. `devenv_win_node20`, `devenv_mac_flutter3`) invocado durante las fases de arranque y configuración.
3. **Existe por sí misma en la máquina del colaborador sin depender de servidores en la nube**, y es la única responsable de verificar que los runtimes (Node.js, npm, Flutter, Python) y variables de entorno cumplan con las versiones fijadas antes de permitir compilar.
4. **Punto de entrada y límite de consistencia:** Si una herramienta no cumple con la versión mínima exigida, el script de inicialización se detiene inmediatamente (*Fail-Fast*).

</div>

---

## 2. Requisitos Previos de Software

| Herramienta | Versión Requerida | Propósito en el Proyecto |
| :--- | :--- | :--- |
| **Node.js** | `v20 LTS` o `v22 LTS` | Runtime para el proceso de Electron y empaquetado Vite. |
| **npm** | `v10+` | Gestor de dependencias del frontend de escritorio. |
| **Python** | `3.12` o `3.13` | Herramientas de generación de canvas, MkDocs y scripts auxiliares. |
| **Flutter SDK** | `3.24+` (Dart 3.5+) | Framework móvil para compilar hacia Android y iPhone. |
| **Git** | `v2.40+` | Control de versiones y submódulos. |

---

## 3. Protocolo de Arranque Rápido (5 Pasos)

### Paso 1: Clonar Repositorios
```bash
# Clonar repositorio de escritorio
git clone https://github.com/Lessteps/NoteVault.git
# Clonar repositorio móvil
git clone https://github.com/Lessteps/notevault_mobile.git
```

### Paso 2: Instalar Dependencias de Escritorio
```bash
cd NoteVault/frontend
npm install
```

### Paso 3: Ejecutar Verificación de Tipos y Suite de Pruebas
```bash
# Comprobar que no existan errores de TypeScript
npm run typecheck

# Ejecutar las 90+ suites de pruebas unitarias
npx vitest run
```

### Paso 4: Levantar NoteVault Desktop en Modo Desarrollo
```bash
npm run electron:dev
```
*La ventana de Electron se abrirá automáticamente con Vite HMR (Hot Module Replacement).*

### Paso 5: Levantar y Probar NoteVault Mobile
```bash
cd ../../notevault_mobile
flutter pub get
flutter test
```

---

## 4. Mapa de Navegación del Código: "¿Dónde Toco Si Quiero Cambiar X?"

| Si deseas modificar o agregar... | Busca en la siguiente ruta (Desktop) | Busca en la siguiente ruta (Mobile) |
| :--- | :--- | :--- |
| **El cálculo de rachas o formato de hábitos** | `frontend/src/core/habitManager.ts` | `lib/core/habit_manager.dart` |
| **La estructura de tareas o recurrencias** | `frontend/src/core/taskManager.ts` | `lib/core/task_manager.dart` |
| **El registro de series y ejercicios de gimnasio** | `frontend/src/core/exerciseManager.ts` | `lib/core/exercise_manager.dart` |
| **El algoritmo de repetición espaciada (SRS)** | `frontend/src/core/studySrsManager.ts` | `lib/core/store.dart` |
| **El motor del plan de estudio del Mentor** | `frontend/src/core/mentor/` | `lib/core/` (Backlog de paridad) |
| **Un nuevo endpoint o método IPC de la app** | `frontend/src/api/registry.ts` | N/A (Llamada directa interna en Dart) |
| **Los estilos visuales globales o temas** | `frontend/src/styles.css` | `lib/ui/theme/` |
| **El contrato normativo de la bóveda** | `docs/VAULT_FORMAT.md` | `docs/VAULT_FORMAT.md` (Copia exacta) |
