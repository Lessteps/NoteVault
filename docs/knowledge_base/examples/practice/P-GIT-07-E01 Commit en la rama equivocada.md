---
id: prog.git.s07.e01
title: Commit en la rama equivocada
subject: programming
type: exercise
discipline: git
skill: "07"
chapter: mover commits sin publicar a una rama nueva
mode: commands
difficulty: 2
assistance: helper
status: draft
---

# P-GIT-07-E01 Commit en la rama equivocada

## Enunciado
En el repo de tu API de facturación hiciste dos commits del export CSV de reportes directamente en
`main`, cuando tenían que ir en una rama `feature/export-csv` (que todavía no existe). **No has
hecho push.** Los dos commits tocan `reports/csv_writer.py` y `api/reports.py`. Además tienes un
cambio sin commitear en `README.md` que documenta el export y que también pertenece a la feature.

Estado actual:

```text
$ git status -sb
## main...origin/main [ahead 2]
 M README.md

$ git log --oneline -3
9f3c2e1 (HEAD -> main) Add /reports/export endpoint
4b8a7d0 Add CSV writer for monthly report
1e5d9a3 (origin/main) Fix rounding in invoice totals
```

Escribe la secuencia de comandos que deja:

- los dos commits en la rama nueva `feature/export-csv`, y esa rama como rama actual;
- `main` apuntando exactamente a `origin/main`;
- el cambio de `README.md` intacto y sin commitear en `feature/export-csv`;
- el remoto sin tocar.

Explica en una línea por qué tu forma de sacar los commits de `main` es segura aquí.

## Pistas
### Pista 1
Antes de mover `main`, algo tiene que seguir apuntando a `9f3c2e1`; si no, los dos commits solo
quedarían en el reflog.

### Pista 2
Los commits no se han publicado. ¿Qué diferencia eso a `reset` de `revert` en este caso? ¿Y qué
le haría `reset --hard` al cambio de `README.md`?

### Pista 3
Una rama en la que no estás se puede mover sin tocar el directorio de trabajo:
`git branch -f <rama> <destino>`.

## Solución
Opción directa (el cambio sin commitear viaja solo al cambiar de rama):

```bash
git switch -c feature/export-csv      # rama nueva en 9f3c2e1; README.md sigue modificado
git branch -f main origin/main        # mueve main sin tocar el directorio de trabajo
```

Opción equivalente con `stash` y `reset`:

```bash
git branch feature/export-csv          # la rama nueva apunta a 9f3c2e1
git stash push -m "README export"      # protege el cambio sin commitear
git reset --hard origin/main           # main vuelve a 1e5d9a3
git switch feature/export-csv
git stash pop                          # recupera README.md y vacía el stash
```

Es seguro reescribir `main` porque sus dos commits **no se habían publicado**: nadie más los
tiene, y siguen vivos en `feature/export-csv`. `revert` sería la herramienta equivocada: añadiría
dos commits inversos a `main`, dejaría ahí los commits de la feature y complicaría el merge
posterior. No hace falta ningún `push --force`.

## Rúbrica
- [ ] (1) Crea `feature/export-csv` apuntando a `9f3c2e1` antes de mover `main`.
- [ ] (1) Conserva el cambio sin commitear de `README.md` y lo deja en `feature/export-csv` (cambio de rama directo, o `stash` + `stash pop`).
- [ ] (1) Devuelve `main` a `origin/main` moviendo la rama (`branch -f` o `reset`), no con `revert`, y justifica que los commits no estaban publicados.
- [ ] (1) No usa `push --force` ni ningún comando que modifique el remoto.
- [ ] (1) Termina en `feature/export-csv` con el estado de la señal de dominio (sin stash olvidado).

## Errores típicos
- **procedural:** `git reset --hard origin/main` sin crear antes la rama: los dos commits solo quedan en el reflog.
- **procedural:** `git reset --hard` sin guardar antes `README.md`: el cambio sin commitear se pierde.
- **conceptual:** usar `git revert` en `main` para «quitar» commits que nunca se publicaron.
- **procedural:** hacer `git stash` y no aplicarlo nunca: el cambio queda olvidado en `git stash list`.

## Señal de dominio
```text
$ git log --oneline --graph --all -3
* 9f3c2e1 (HEAD -> feature/export-csv) Add /reports/export endpoint
* 4b8a7d0 Add CSV writer for monthly report
* 1e5d9a3 (origin/main, main) Fix rounding in invoice totals

$ git status -sb
## feature/export-csv
 M README.md

$ git stash list
```

`git stash list` no imprime nada, y `git rev-parse main origin/main` imprime dos veces el mismo
hash (`1e5d9a3…`).
