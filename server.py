from pathlib import Path
import json
import tempfile
import os
from typing import Any, Dict

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Initialize Storage Directory
STORAGE_DIR = Path.home() / "Documents" / "Thought Redemption Data"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
DATA_FILE = STORAGE_DIR / "thought-redemption-data.json"

DEFAULT_SCHEMA: Dict[str, Any] = {
    "version": "1.0.0",
    "activeWorkspace": {"currentTab": "mindflow", "activeBookId": None, "activePageId": None},
    "mindFlow": {
        "books": [
            {
                "id": "starter-book-1",
                "title": "Metacognitive Thinking: Welcome & Guide",
                "createdAt": "2026-09-20T00:00:00.000Z",
                "updatedAt": "2026-09-20T00:00:00.000Z",
                "pages": [
                    {
                        "id": "page-1",
                        "sideBlockCount": 4,
                        "blocks": {
                            "main": {
                                "id": "main",
                                "title": "Core Thesis & Central Thought",
                                "content": "Welcome to Mind Flow.\n\nThe central block is your Main Branch ¹. This is where your primary argument, stream-of-consciousness, or core problem statement develops continuously.\n\nNotice the footnote marker ¹ right above? You can insert footnote markers using the \"+ Marker\" button in the toolbar. The surrounding side blocks can reference these markers (like \"re: ¹\") to create parallel metacognitive tracks without fragmenting your central flow ².\n\nDouble-click any block to enter Fullscreen Deep Focus mode. Double-click again or press Esc to return to this overview.",
                                "markers": ["¹", "²"]
                            },
                            "side1": {
                                "id": "side1",
                                "title": "Assumptions & Biases (Top)",
                                "content": "Side Block 1 (Top):\nWhat implicit assumptions am I making in the main thesis? Am I anchoring to early conclusions?",
                                "reference": "¹"
                            },
                            "side2": {
                                "id": "side2",
                                "title": "Counter-Arguments (Right)",
                                "content": "Side Block 2 (Right):\nWhat would someone who completely disagrees with my thesis say? How might this fail?",
                                "reference": "²"
                            },
                            "side3": {
                                "id": "side3",
                                "title": "Emotional Context (Bottom)",
                                "content": "Side Block 3 (Bottom):\nHow do I feel while writing this? Is there anxiety, impatience, or cognitive dissonance?",
                                "reference": ""
                            },
                            "side4": {
                                "id": "side4",
                                "title": "Alternative Hypotheses (Left)",
                                "content": "Side Block 4 (Left):\nWhat is the simplest explanation I have not considered yet?",
                                "reference": ""
                            }
                        }
                    }
                ]
            }
        ]
    },
    "notes": {
        "items": [
            {
                "id": "starter-note-1",
                "title": "Welcome to Notes",
                "content": "This is the Notes tab — a traditional single-flow note-taking space inspired by Google Keep.\n\nEach note here is a single continuous writing space. It is completely isolated from your Mind Flow workspace.\n\nPin notes, color-code them, search instantly, and let your thoughts autosave straight to your local companion server.",
                "color": "var(--card-bg)",
                "pinned": True,
                "createdAt": "2026-09-20T00:00:00.000Z",
                "updatedAt": "2026-09-20T00:00:00.000Z"
            }
        ]
    },
    "diary": {"entries": {}},
}

app = FastAPI(title="Thought Redemption Local Companion Server")

# CORS Middleware for local web frontends
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:8000",
        "http://localhost:8080",
        "http://localhost:8085",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:8085",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/load")
async def load_data():
    try:
        if not DATA_FILE.exists():
            # Generate file with default schema if missing
            atomic_write(DATA_FILE, DEFAULT_SCHEMA)
            return DEFAULT_SCHEMA

        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to read data file: {str(e)}"
        )


@app.post("/api/save")
async def save_data(payload: Dict[str, Any] = Body(...)):
    try:
        atomic_write(DATA_FILE, payload)
        return {"status": "success", "message": "Data saved successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to save data file: {str(e)}"
        )


def atomic_write(target_path: Path, data: Dict[str, Any]):
    """
    Performs an atomic write to prevent corruption:
    Writes JSON to a temporary file in the same directory, then replaces target.
    """
    temp_file = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=target_path.parent,
            delete=False,
            suffix=".tmp",
        ) as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            temp_file = Path(f.name)

        # Atomic replacement on POSIX and Windows (Python 3.3+)
        os.replace(temp_file, target_path)
    except Exception:
        if temp_file and temp_file.exists():
            try:
                temp_file.unlink()
            except OSError:
                pass
        raise


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
