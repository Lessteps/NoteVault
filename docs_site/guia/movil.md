# Mobile app (Android)

NoteVault Mobile opens **the same vault folder** as the desktop app and reads and writes the same plain files. There is no account, no server and no telemetry: your phone only talks to the folder you choose (the one you already sync with your computer using Syncthing, Google Drive or similar).

!!! warning "Early software"
    The mobile app is in active development (Phase 1 of 3) and has not yet been tested on many phones. Your notes are safe by design — it never overwrites a file that changed on another device — but expect rough edges. Please report problems.

## What works today

| Area | What you can do |
| :--- | :--- |
| **Notes** | Browse folders, read Markdown, edit, create, search by name, follow `[[wiki links]]`, move to the trash. |
| **Tasks** | See overdue, today, upcoming and done; complete and re-open (repeating tasks move to their next date like on the desktop); add new ones. |
| **Habits** | Mark today's habits (or any day) and see your progress. |
| **Agenda** | The day's routines, events, tasks and timed habits in one list. |
| **Finances** | Add expenses and income with categories; see the day's totals. |
| **Quick note** | Capture a line into `Inbox.md` in one tap. |
| **Reminders** | Optional local notifications for task reminders and habit times (off until you switch them on). |

Coming next: calendar editing, goals, projects, exercise, nutrition, and the Mentor.

## Install

1. Download the latest `NoteVault-<version>-build<N>.apk` from the [mobile repository's releases](https://github.com/Lessteps/notevault-mobile/releases/tag/nightly) (private while we test; ask us for access at lesstepscompany@gmail.com).
2. Open the file on your phone and allow installing from that source.
3. Open NoteVault and choose your vault folder. Android will ask you to allow access to it.

## Good to know

- **Sync is external.** The app does not sync; your sync tool moves the files. If the same file is edited on two devices, NoteVault shows a conflict and lets you choose instead of overwriting.
- **English by default**, Spanish in *Settings → Language*.
- The format is the same one documented in [`VAULT_FORMAT.md`](https://github.com/Lessteps/NoteVault/blob/main/docs/VAULT_FORMAT.md); a check in the mobile repository fails if it drifts from the desktop.
- iPhone is planned (the code already runs there; publishing needs an Apple developer account).
