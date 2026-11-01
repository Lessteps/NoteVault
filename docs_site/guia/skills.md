# Skills

A **skill** is the instruction file used to generate one piece of a topic. NoteVault works with three kinds per subject:

| Skill | Generates |
| :--- | :--- |
| Theory notes (md) | The note `<topic>.md`. |
| Map (canvas) | The explanatory map `<topic> — mapa.canvas`. |
| Practice files | The file `<topic>.practica.md` and its exercises. |

They live in `<subject>/_skills/` inside your vault, so they are your own files.

## The Skills panel

It is in the right bar, below the Mentor. From there you can:

- **View and edit** each skill by hand.
- **See previous versions** (the last 3 are kept) and **restore** one.
- **Ask for a change in plain language.** You have three paths:
    - with the **app's AI** (API or local model);
    - copying a **prompt** to paste into Antigravity or any other AI;
    - typing the text yourself.

A request never saves by itself: it returns a proposal and you decide whether to save it.

## Versioning

Each skill has an 8-character version computed from its content. Every note, map or practice file that is generated carries in its frontmatter the version it was made with:

```yaml
skill_version: "15f0185c"
```

With that, the app detects on its own which pieces were made with an older version of the skill and marks them as outdated, so you do not have to review them one by one.
