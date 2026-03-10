"""
CrownClaw — FastAPI backend for the NL Crown Land Finder app.

Run with:
    cd crownland_app
    ANTHROPIC_API_KEY=your-key uvicorn app:app --reload --port 8000
"""

import json
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from ai import stream_chat
from scraper import get_knowledge_base, KNOWLEDGE_BASE

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).parent

app = FastAPI(title="CrownClaw — NL Crown Land Finder", version="1.0.0")

# Static assets (CSS, JS, images)
static_dir = BASE_DIR / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/guide")
async def get_guide():
    """Return the step-by-step application wizard data."""
    kb = get_knowledge_base()
    steps = kb.get("application_steps", KNOWLEDGE_BASE["application_steps"])["general"]
    return JSONResponse({"steps": steps})


@app.get("/api/tenure-types")
async def get_tenure_types():
    """Return all tenure type definitions."""
    kb = get_knowledge_base()
    return JSONResponse(kb.get("tenure_types", KNOWLEDGE_BASE["tenure_types"]))


@app.get("/api/fees")
async def get_fees():
    """Return current fee schedule."""
    kb = get_knowledge_base()
    return JSONResponse(kb.get("fees", KNOWLEDGE_BASE["fees"]))


@app.get("/api/offices")
async def get_offices():
    """Return regional office contact details."""
    kb = get_knowledge_base()
    return JSONResponse(kb.get("regional_offices", KNOWLEDGE_BASE["regional_offices"]))


@app.get("/api/restrictions")
async def get_restrictions():
    """Return common restrictions that apply to Crown Land applications."""
    kb = get_knowledge_base()
    return JSONResponse(kb.get("restrictions", KNOWLEDGE_BASE["restrictions"]))


@app.get("/api/resources")
async def get_resources():
    """Return helpful online links."""
    kb = get_knowledge_base()
    return JSONResponse(kb.get("online_resources", KNOWLEDGE_BASE["online_resources"]))


@app.post("/api/chat")
async def chat(request: Request):
    """
    Streaming SSE endpoint.
    Body: { "messages": [...] }  — OpenAI-style message history.
    """
    body = await request.json()
    messages = body.get("messages", [])
    if not messages:
        return JSONResponse({"error": "No messages provided"}, status_code=400)

    return StreamingResponse(
        stream_chat(messages),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/health")
async def health():
    has_key = bool(os.environ.get("ANTHROPIC_API_KEY"))
    return JSONResponse({"status": "ok", "ai_ready": has_key})
