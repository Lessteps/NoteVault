# The vault

The **vault** is any folder on your disk. NoteVault needs no server or database: everything is text you can read and edit by hand.

## Format principles

1. A vault is an ordinary folder. It can be the same one you use in Obsidian.
2. Everything is readable text: Markdown with YAML frontmatter, or JSON.
3. One file per day or per entity. Two computers can write at the same time as long as they touch different entities, and folder-level sync produces no conflicts.
4. Dates in ISO 8601 (`YYYY-MM-DD`), in local time.
5. UTF-8 encoding.

## Structure

```text
vault/
├── .notevault/        module data (habits, tasks, goals, finances…)
├── your-notes.md      your .md notes and .canvas files, wherever you like
└── Programación/      example of a study subject
    ├── _skills/       generation instructions for that subject
    └── …              topics, practice and maps
```

The files in `.notevault/` are managed by the app; the rest is yours.

## The full contract

The format is specified, versioned and protected by tests: the current version is **4**. The reference document is [`docs/VAULT_FORMAT.md`](https://github.com/Lessteps/NoteVault/blob/main/docs/VAULT_FORMAT.md) (in Spanish). If you change the format, change that document and the tests that pin it.

## Syncing between computers

NoteVault does not sync for you: use whatever you already have on the folder (Syncthing, Git, iCloud Drive, Google Drive…). The app settings (`~/.notevault/settings.json`) live outside the vault and are not synced with it.

## Backups

Copy the folder. That is all.
