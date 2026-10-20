# 08. CI/CD & Environments Strategy

**Fase:** 05 — Diseño Arquitectónico  
**Entregable:** 08  
**Proyecto:** NoteVault (PC, Mac, Android, iPhone)

---

## 1. Estrategia de Integración Continua y Despliegue Multiplataforma

```mermaid
flowchart TD
    subgraph Pipeline de Integración Continua (CI)
        TRIGGER["Git Push a rama main / PR"] --> LINT["1. Typecheck & Linter<br/>npm run typecheck && flutter analyze"]
        LINT --> TEST["2. Suites de Pruebas Unitarias<br/>npx vitest run && flutter test"]
        TEST --> CONF["3. Pruebas de Conformidad Binaria<br/>flutter test test/conformance_test.dart"]
    end

    subgraph Pipeline de Despliegue (CD)
        CONF --> BUILD_WIN["Compilar Windows (.exe NSIS)"]
        CONF --> BUILD_MAC["Compilar macOS (.dmg Universal)"]
        CONF --> BUILD_ANDR["Compilar Android (.apk / .aab)"]
        CONF --> BUILD_IOS["Compilar iOS (.ipa Archive)"]
    end
```

### Ambientes Operativos
- **Local Dev:** Servidor Vite con HMR para React y hot-reload de Flutter en emuladores.
- **CI Runner:** Contenedores aislados sin estado donde se validan suites de pruebas unitarias y cobertura.
- **Release:** Binarios firmados y empaquetados distribuidos directamente a los usuarios o a través de tiendas de aplicaciones.

---

## 2. Marco Conceptual: Pipeline Automatizado de CI/CD

<div class="entity-card">

1. **Entidad principal e independiente.**
2. **Es la entidad líder del conjunto de datos:** posee un identificador global único que modela el flujo de integración continua (`cicd_pipeline_id`: `PIPELINE-MULTI-PLATFORM-BUILD`) consultado en las auditorías de DevOps.
3. **Existe por sí misma en la configuración de automatización (`.github/workflows/`) sin depender del entorno de desarrollo local**, y es la única responsable de garantizar que ningún binario se publique si falla una sola prueba.
4. **Punto de entrada y límite de consistencia:** Sella la inmutabilidad de los releases de producción.

</div>
