# Changelog

*[Leer en español](translations/es/CHANGELOG.md)*

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Added
- Mentor: an always-current **master syllabus** for AIs and people — `00 Master syllabus.md` and its JSON twin in each study space. One file with every route (plan) → area → subject → topic → piece, with number, time, plan week and state (theory, map, practice, exercises, done), plus the library of topics not in any plan. It is rewritten by the app every time the plan syncs (only when its content changed) and can be regenerated with `mentor_master_syllabus`.

### Fixed
- Mentor: the plan sync now detects the new pieces of **language** areas (`2.1 Python`, `2.2 JavaScript`, `2.3 TypeScript`) and of any area already in the plan, and adds them next to their siblings (same subplan and group as their chapter). Before, the “coarse chapters” notice never went away after breaking a language into pieces.
- Mentor: the sync no longer marks as “offered” the topics that did not fit in its 400-per-pass cap, so the rest are added on the next pass instead of being lost.

### Added
- Mentor: create a plan with another AI (Antigravity or a chat) with no API key or local model. NoteVault writes the request into the vault and validates the answer before creating the plan.

## [0.1.0] - 2026-11-01

### Added
- First public release of the code under GPL-3.0-or-later.
- Public documentation with MkDocs, a website and community files.
- Skills: panel to view and edit the generation instructions, with a 3-version history and automatic detection of outdated pieces.
- Mentor: the plan always fits the start and end dates, and each subject shows the pace needed.
- Topic theory organized into three functional modules: what it is, how it is organized and how it acts in the real world.

### Changed
- License: from Apache-2.0 to GPL-3.0-or-later.
- Overview: the streak, savings and charts show real data (they used to show sample values).
- Windows installer with an icon and the name `NoteVault-Setup-<version>.exe`.

### Fixed
- The JavaScript step-by-step debugger no longer times out on long programs.
