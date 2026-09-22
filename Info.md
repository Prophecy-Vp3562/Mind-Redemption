# Mind Redemption

> **A local-first, privacy-native metacognition & knowledge architecture workspace.**

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![ES6+](https://img.shields.io/badge/JavaScript-Vanilla%20ES6%2B-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Storage](https://img.shields.io/badge/Storage-100%25%20Local%20Disk-4CAF50?style=flat-square&logo=databricks&logoColor=white)](#privacy-first-architecture)
[![License](https://img.shields.io/badge/License-MIT-gray?style=flat-square)](LICENSE)

---

Mind Redemption is a local-first, distraction-free thinking and metacognition environment engineered for deep work, non-linear reasoning, structured card notes, and chronological session tracking. It couples an asynchronous vanilla ES6 client with an isolated local Python FastAPI companion server to ensure zero external cloud exposure, absolute data ownership, and sub-millisecond atomic disk persistence.

---

## Core Features

- **Mind Flow (Cognitive Cross Layout)**  
  Deconstruct complex thinking across an adaptive multi-branch canvas. A central **Main Branch** holds your core thesis or continuous line of inquiry, surrounded by dynamically configured satellite blocks (0 to 4 quadrants: *Assumptions & Biases*, *Counterarguments*, *Nuance / Emotional Context*, and *Consequences / Alternative Hypotheses*). Uses numbered footnote anchors (`¹`, `²`) to maintain cross-quadrant reference parity without fragmenting primary thought flow.

- **All-Time & Daily Notes**  
  Fluidly switch between quick thought capture and systematic long-form reference. Provides an auto-expanding quick-note surface alongside a multi-column masonry wall with instant full-text filtering, card color-tagging, and sticky note pinning.

- **Dual Editorial Theme System**  
  Calibrated typography and color palettes designed to minimize cognitive strain during prolonged focus:
  - **Light Mode ("Nordic Sage & Biophilic Editorial")**: Soft lichen washes, warm stone mist (`#f2f4f2`), peat graphite ink, and forest pine accents.
  - **Dark Mode ("Smoked Obsidian & Typographic Monolith")**: Deep charcoal slate (`#0d0f14`), obsidian card slabs (`#151922`), and high-legibility muted amber accents.

- **Hierarchical Daily Timeline & Telemetry**  
  Tracks active cognitive effort without invasive background daemons. Session events and focus intervals are persisted into a date-partitioned filesystem hierarchy (`YYYY/MM/DD.json`), enabling an interactive calendar matrix, day chronicle inspection, and a non-destructive **Time Machine** review mode.

- **Privacy-First Architecture**  
  100% of state, notes, slides, and logs reside solely on the local filesystem (`~/Documents/Mind Redemption Data`). Zero cloud telemetry, zero remote analytics, zero third-party script injection, and built-in atomic write safety with temp-file swaps to prevent corruptions during power failures.

---

## Architecture & Directory Layout

Mind Redemption operates via a decoupled architecture: an ES6 modular single-page interface served without caching on port `3000`, communicating over REST endpoints with a local FastAPI companion daemon bound to `127.0.0.1:8000`.

```
Mind Redemption/
├── css/
│   └── style.css                 # Unified design system tokens, typography & themes
├── js/
│   ├── app.js                    # Core bootstrap, view routing, tabs & global shortcuts
│   ├── mindflow.js               # Cross-layout canvas, slide strip & footnote engine
│   ├── notes.js                  # Masonry layout, quick capture, search & card modals
│   ├── diary.js                  # Chronological reflection stream & daily entries
│   ├── timeline.js               # Activity recorder, session tracker & calendar modal
│   ├── fs-storage.js             # HTTP client sync layer with debounce & atomic fallback
│   ├── cloak.js                  # Chameleon masking buffer & privacy keybind engine
│   └── cloak-corpus.js           # Decoy text corpus for live writing camouflage
├── frontend_server.py            # Zero-cache HTTP server for local UI assets (Port 3000)
├── server.py                     # FastAPI local companion server (Port 8000)
├── requirements.txt              # Companion Python dependencies
├── run.bat                       # Windows one-click dual-server launcher
├── stop.bat                      # Windows clean shutdown script
└── index.html                    # Semantic HTML5 shell and modal containers
```

### Local Storage Layout Contract

All data persists outside the source repository within the user's OS profile:

```
~/Documents/Mind Redemption Data/
├── mind-redemption-data.json     # Primary store (active workspace, books, slides, notes)
└── timeline/                     # Hierarchical activity telemetry partition
    └── YYYY/
        └── MM/
            ├── 01.json
            ├── 02.json
            └── ...
```

---

## Quick Start Guide

### Prerequisites

- **Python 3.10+** installed and available on your system `PATH`.
- Modern web browser (Chrome, Chromium, Edge, Firefox, or Safari).

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/Prophecy-Vp3562/Mind-Redemption.git
cd Mind-Redemption

# Install companion dependencies
pip install -r requirements.txt
```

### 2. Launching Mind Redemption

#### Windows (One-Click)
Double-click `run.bat` or run:
```bat
run.bat
```
*This verifies port availability, starts the FastAPI companion on port 8000, launches the zero-cache frontend server on port 3000, and opens your default browser automatically.*

To gracefully terminate all running companion instances:
```bat
stop.bat
```

---

#### Manual Terminal Startup (Windows, macOS & Linux)

Start both services in separate terminal tabs:

**Terminal 1 — Backend Companion (Port 8000):**
```bash
# macOS / Linux
python3 server.py

# Windows
python server.py
```

**Terminal 2 — Frontend Asset Server (Port 3000):**
```bash
# macOS / Linux
python3 frontend_server.py 3000

# Windows
python frontend_server.py 3000
```

Once running, navigate to:
```
http://localhost:3000
```

---

## Keyboard Shortcuts & Workflow Navigation

| Shortcut | Scope | Action |
| :--- | :--- | :--- |
| `Ctrl` / `Cmd` + `1` | Global | Switch to **Mind Flow** canvas view |
| `Ctrl` / `Cmd` + `2` | Global | Switch to **Notes** masonry view |
| `Ctrl` / `Cmd` + `3` | Global | Switch to **Diary** daily reflection view |
| `Escape` | Global | Close active modal / Dismiss focus zoom / Exit layout edit |
| `Double-Click` | Mind Flow Card | Enter **Fullscreen Deep Focus** zoom for active block |
| `Alt` + `1` / `Ctrl` + `~` | Writing Fields | Toggle **Chameleon Masking Mode** (decoy typing stream) |
| `Alt` + `0` | Writing Fields | Reveal genuine text buffer from masking mode |
| `Ctrl` + `F` / Input Focus | Notes | Jump straight to real-time search filter |

---

## Technical Specifications

- **Companion Backend**: FastAPI, Uvicorn, Python `pathlib`, Atomic File Swaps (`shutil` / temporary file handles).
- **Client Runtime**: Vanilla ECMAScript 2022 Modules (`<script type="module">`). Zero npm/webpack bundling overhead.
- **Typography**: Google Fonts CDN (`Newsreader` serif, `Plus Jakarta Sans` sans-serif, `JetBrains Mono` monospace).
- **Telemetry**: Idle-aware heuristic recording. Heartbeat telemetry increments active work duration only while mouse, scroll, or keyboard interactions take place.

---

## License

Mind Redemption is released under the [MIT License](LICENSE).
All personal thought data created remains 100% strictly yours, located locally on your physical machine.
