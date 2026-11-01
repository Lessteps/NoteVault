# Contribuir

¡Gracias por querer ayudar! La guía completa está en [`CONTRIBUTING.md`](https://github.com/Lessteps/NoteVault/blob/main/CONTRIBUTING.md). Este es el resumen.

## Antes de empezar

1. Busca en los [issues](https://github.com/Lessteps/NoteVault/issues) si ya existe lo que quieres hacer.
2. Para un cambio grande, abre primero un issue y cuéntanos la idea.
3. Lee el [código de conducta](https://github.com/Lessteps/NoteVault/blob/main/CODE_OF_CONDUCT.md).

## Preparar el entorno

```bash
git clone https://github.com/Lessteps/NoteVault.git
cd NoteVault/frontend
npm install
npm run electron:dev
```

## Antes de abrir un Pull Request

```bash
cd frontend
npm run typecheck
npx vitest run
```

Los cambios de lógica llevan su test. Los cambios que tocan el formato de la bóveda actualizan `docs/VAULT_FORMAT.md` y los tests que lo fijan.

## Licencia de tus aportes

Al contribuir aceptas que tu aporte se publique bajo la misma licencia del proyecto (GPL-3.0-or-later). Firma tus commits con `git commit -s` (Developer Certificate of Origin).

## Vulnerabilidades

No las abras como issue público. Sigue [`SECURITY.md`](https://github.com/Lessteps/NoteVault/blob/main/SECURITY.md).

## Más sobre la arquitectura

La sección [Ingeniería](../ingenieria.md) documenta el sistema completo, incluida la [guía de contribución y nuevos módulos](../07-implementation-y-multiplataforma/03-guia-de-contribucion-paso-a-paso.md).
