# Política de seguridad

## Versiones con soporte

Se corrigen vulnerabilidades en la última versión publicada.

## Cómo reportar una vulnerabilidad

**No abras un issue público.** Usa el reporte privado de GitHub:
<https://github.com/Lessteps/NoteVault/security/advisories/new>

Incluye:

- qué ocurre y qué impacto tiene;
- pasos para reproducirlo;
- la versión de NoteVault y tu sistema operativo.

Respondemos para confirmar la recepción lo antes posible y te mantenemos al tanto de la corrección. Con tu permiso, te mencionamos en las notas de la versión que la corrige.

## Qué consideramos vulnerabilidad

- Salir de la bóveda: leer o escribir fuera de la carpeta elegida.
- Ejecución de código a partir de contenido de una nota o de una bóveda ajena.
- Fuga de claves de API o de datos de la bóveda.
- Fallos del proceso principal de Electron o del puente IPC.

## Buenas prácticas para usuarios

- Las claves de API se guardan en texto plano en `~/.notevault/settings.json`, fuera de la bóveda. No subas esa carpeta a ningún repositorio.
- Abre solo bóvedas de las que te fíes.
