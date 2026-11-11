# Change Log

All notable changes to the "dash" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.11] - 2026-11-11
### Added
- `woop.perf` command (Woop Menu → Show Performance) reporting in-memory timings for dash, next project and previous project
- Refresh button on the dash picker that clears the directory cache and re-indexes the project roots
- `bench/` harness: `npm run bench` measures HEAD vs working tree, `npm run smoke` executes every command

### Changed
- `woop.dash` now shows the picker immediately and fills it in the background instead of waiting for every root to be scanned
- Project directory listings are cached per session and shared by `dash`, `nextProject` and `prevProject`
- Root scans run in parallel, and the redundant `stat` before each `readDirectory` is gone

### Fixed
- Pressing Enter in the dash picker while it was still empty closed it without opening anything

## [Unreleased]
### Added
- Keyboard shortcut `Ctrl+Shift+Alt+Right` to switch to the next project in the project directory
- Keyboard shortcut `Ctrl+Shift+Alt+Left` to switch to the previous project in the project directory
- `woop.nextProject` and `woop.prevProject` commands for cycling through saved projects