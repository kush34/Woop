# Woop 

Launch, switch, and run your projects directly from the VS Code status bar.

---

## Features

- **Project Switcher** — quickly open any project in the current window
- **Status Bar Commands** — run dev servers, build tools, or any shell command from the status bar
- **Auto-detect** — Woop scans your project and suggests commands based on your stack (Node, Python, Go, Rust, etc.)
- **Live State Indicators** — see if a server is running, stopped, or errored at a glance
- **One-click Stop / Restart** — kill or restart a process directly from the status bar

---

## Status Bar States

| Icon | Meaning | Click Action |
|---|---|---|
| `$(terminal) Label` | Idle | Run command |
| `$(stop-circle) Label` | Running | Stop (Ctrl+C) |
| `$(warning) Label` | Errored / Crashed | Restart |

---

## Usage

### Dash — Switch Projects
Open any saved project in the current window.

1. `Ctrl+Shift+P` → `woop.dash`
2. Select a project from the list
3. Press Enter — project opens in current window

![Dash](https://raw.githubusercontent.com/kush34/Woop/refs/heads/main/public/dash.gif)

---

### Set Project Directory
Point Woop to the folder where your projects live.

1. `Ctrl+Shift+P` → `woop.setDash`
2. Paste the absolute path to your projects folder

![Set Dir](https://raw.githubusercontent.com/kush34/Woop/refs/heads/main/public/setDir.gif)

---

### View Saved Directories
1. `Ctrl+Shift+P` → `woop.view`
2. A notification shows all saved directories

![View](https://raw.githubusercontent.com/kush34/Woop/refs/heads/main/public/view.gif)

---

### Auto-detect Commands
When you open a project, Woop scans for known config files and suggests run commands.

- Supports: Node/npm, React, Python (Django, Flask, FastAPI), Go, Rust, Laravel, Rails, Docker, and more
- Detects subfolders like `/backend`, `/frontend`, `/api`, `/client` automatically
- Select which commands to add → they appear in the status bar instantly

---

### Add Commands Manually
1. Click `$(send)` in the status bar → **Add Command (manual)**
2. Enter a label, command, and directory
3. Command appears in the status bar

---

### Menu
Click the `$(send)` icon in the bottom-right status bar to access all Woop actions.

---

## Supported Stacks (Auto-detect)

| Stack | Detected File | Suggested Command |
|---|---|---|
| Node / npm | `package.json` | `npm run dev` / `npm start` |
| Django | `manage.py` | `python manage.py runserver` |
| Flask | `app.py` | `python app.py` |
| FastAPI | `pyproject.toml` | `uvicorn main:app --reload` |
| Go | `go.mod` | `go run .` |
| Rust | `Cargo.toml` | `cargo run` |
| Spring Boot | `pom.xml` | `mvn spring-boot:run` |
| Laravel | `artisan` | `php artisan serve` |
| Rails | `Gemfile` | `bundle exec rails server` |
| Docker | `docker-compose.yml` | `docker-compose up` |