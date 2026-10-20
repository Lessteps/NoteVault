# 07. Implementación — Expansión Multiplataforma (PC, Android, iOS, Mac)

**Propósito:** Detallar la estrategia de arquitectura, compilación, acceso al sistema de archivos y sincronización para expandir NoteVault de manera homogénea a lo largo de **PC (Windows, Linux), Mac (macOS), Android y iPhone (iOS)**.

---

## 1. Marco Conceptual: Perfil de Plataforma Objetivo

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que define las capacidades del sistema operativo anfitrión (`target_platform_id`: ej. `platform_pc_win`, `platform_pc_mac`, `platform_mobile_android`, `platform_mobile_ios`) consultado por los módulos de I/O y UI adaptativa.
3. **Existe por sí misma en la matriz de compilación sin depender de emuladores en ejecución**, y es la única responsable de garantizar que las llamadas a APIs nativas (acceso a archivos, notificaciones locales, atajos de teclado y gestos táctiles) se adapten a las convenciones de cada sistema operativo.
4. **Punto de entrada y límite de consistencia:** Si una plataforma no soporta una API opcional (por ejemplo, partición web aislada en móvil), el sistema degrada la funcionalidad de forma elegante sin interrumpir el núcleo de notas y productividad.

</div>

---

## 2. Matriz de Arquitectura por Plataforma

```mermaid
graph TD
    subgraph Núcleo de Bóveda Local-First
        FORMAT["Contrato de Bóveda: docs/VAULT_FORMAT.md (Versión 4)"]
        SYNC["Sincronización Transparente (Syncthing, iCloud Drive, Git)"]
    end

    subgraph PC Desktop (Electron + React 19)
        WIN["PC Windows<br/>- NSIS Installer (.exe)<br/>- Atajos Ctrl+K, Win-unpacked"]
        MAC_EL["PC macOS (Electron)<br/>- Paquete .dmg Universal<br/>- Atajos Cmd+K, Menu Bar Mac"]
        LINUX["PC Linux<br/>- AppImage / .deb<br/>- Cumplimiento XDG"]
    end

    subgraph Dispositivos Móviles (Flutter + Dart)
        ANDR["Android (API 26+)<br/>- APK / AAB para Play Store<br/>- Scoped Storage / SAF<br/>- AlarmManager Reminders"]
        IOS["iPhone / iPad (iOS 15+)<br/>- Paquete .ipa / App Store<br/>- iCloud Drive / App Archivos<br/>- Cupertino Gestures & Haptics"]
        MAC_FL["Mac Nativo (Flutter Desktop)<br/>- Cliente ultraligero alternativo<br/>- Huella RAM menor a 60MB"]
    end

    FORMAT --> WIN
    FORMAT --> MAC_EL
    FORMAT --> LINUX
    FORMAT --> ANDR
    FORMAT --> IOS
    FORMAT --> MAC_FL

    SYNC <--> WIN
    SYNC <--> MAC_EL
    SYNC <--> ANDR
    SYNC <--> IOS
```

---

## 3. Estrategia Detallada por Plataforma

### 3.1. PC Windows (Producción Activa)
- **Tecnología:** Electron 44 + Node.js 20/22 + React 19 + Tailwind v4.
- **Acceso a Disco:** `node:fs` con soporte completo para rutas Windows (`\` normalizadas internamente a `/`).
- **Empaquetado:** Generación de instalador NSIS en `frontend/release/NoteVault Setup 0.1.0.exe` y versión portable en `win-unpacked/NoteVault.exe`.
- **Comando de Compilación:**
  ```bash
  cd frontend && npm run electron:build
  ```

---

### 3.2. PC macOS (Mac con Electron)
- **Tecnología:** Electron empaquetado para arquitecturas `arm64` (Apple Silicon M1/M2/M3/M4) y `x64` (Intel).
- **Integración con el Sistema:**
  - Barra de menú superior nativa de macOS (Archivo, Edición, Ver, Ventana).
  - Mapeo automático de atajos de teclado: `Ctrl` pasa a ser `Cmd` (`Cmd+P` búsqueda rápida, `Cmd+O` abrir nota).
  - Soporte para tema claro/oscuro del sistema mediante `nativeTheme.shouldUseDarkColors`.
- **Empaquetado:** Generación de imagen `.dmg` firmada y notarizada para macOS.

---

### 3.3. Teléfonos Android (notevault_mobile)
- **Tecnología:** Flutter 3.24+ con Dart 3.5+.
- **Versión de Android:** Mínimo Android 8.0 (API 26), compatible hasta Android 15.
- **Estrategia de Acceso a Bóveda:**
  - Uso del *Storage Access Framework* (SAF) o permiso `MANAGE_EXTERNAL_STORAGE` para permitir al usuario seleccionar cualquier carpeta en su almacenamiento interno (`/storage/emulated/0/...`).
  - Perfecta compatibilidad con la carpeta local replicada por la aplicación de **Syncthing** para Android.
- **Notificaciones y Recordatorios:** `flutter_local_notifications` integrado con el sistema de alarmas exactas de Android para recordar tareas y rutinas programadas.
- **Comando de Compilación:**
  ```bash
  cd notevault_mobile
  flutter build apk --release
  ```

---

### 3.4. iPhone / iPad (iOS via Flutter)
- **Tecnología:** Flutter compilado para iOS 15.0+.
- **Estrategia de Almacenamiento e Integración con iCloud:**
  - En iOS, el sandbox es estricto. La app habilita en su `Info.plist`:
    - `UIFileSharingEnabled = true` (Permite ver los archivos en la app nativa "Archivos" de Apple).
    - `LSSupportsOpeningDocumentsInPlace = true` (Permite editar archivos en su ubicación original).
  - El usuario puede elegir una carpeta ubicada dentro de su **iCloud Drive**, permitiendo que NoteVault en iPhone y iPad sincronice instantáneamente con la carpeta de iCloud Drive en una Mac o PC con Windows sin software adicional.
- **Experiencia de Usuario (UX Táctil):**
  - Transiciones y animaciones adaptativas con gestos Cupertino (deslizar para volver atrás).
  - Retroalimentación háptica en la marcación de hábitos y registro de series de entrenamiento.
- **Comando de Compilación:**
  ```bash
  cd notevault_mobile
  flutter build ipa --release
  ```

---

### 3.5. Mac Ligero (macOS Nativo via Flutter Desktop)
- **Ventaja Competitiva:** Mientras que la versión Electron de escritorio ofrece el navegador web integrado y el motor completo de IA, la versión compilada con Flutter Desktop para macOS ofrece un visor ultraligero con una huella de memoria RAM inferior a 60 MB, ideal para computadoras portátiles en modo ahorro de batería.

---

## 4. Garantía de Sincronización Inter-Plataforma

| Escenario de Conflicto Potencial | Solución de Arquitectura Implementada |
| :--- | :--- |
| **Escritura simultánea en dos dispositivos** | Partición de entidades: cada tarea vive en un archivo, cada día de hábitos en un archivo. Las probabilidades de colisión se reducen a cero en el uso real. |
| **Conflicto de sincronización Syncthing** | Detección automática de archivos `*.sync-conflict-*`. No se procesan como notas válidas, se preservan intactos y se alertan en la interfaz. |
| **Discrepancia de saltos de línea (CRLF vs LF)** | Toda serialización en Windows, Mac, Android e iOS normaliza obligatoriamente a `\n` antes de escribir a disco. |
| **Diferencias de huso horario** | Las fechas y horas se guardan en tiempo local `YYYY-MM-DD` y `YYYY-MM-DDTHH:MM` sin conversión UTC, preservando el significado humano del día. |
