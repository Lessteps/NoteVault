# Changelog

*[Leer en español](translations/es/CHANGELOG.md)*

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/).

## [Unreleased]

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
