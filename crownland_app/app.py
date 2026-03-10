"""
CrownClaw — FastAPI backend for the NL Crown Land Finder app.

Run with:
    cd crownland_app
    ANTHROPIC_API_KEY=your-key uvicorn app:app --reload --port 8000
"""

import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from ai import stream_chat
from scraper import get_kb_section

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).parent

app = FastAPI(title="CrownClaw — NL Crown Land Finder", version="1.0.0")

static_dir = BASE_DIR / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _kb_response(key: str) -> JSONResponse:
    """Return a JSONResponse for a top-level knowledge-base section."""
    return JSONResponse(get_kb_section(key))

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/guide")
async def get_guide():
    """Return the step-by-step application wizard data."""
    return JSONResponse({"steps": get_kb_section("application_steps")["general"]})


@app.get("/api/tenure-types")
async def get_tenure_types():
    return _kb_response("tenure_types")


@app.get("/api/fees")
async def get_fees():
    return _kb_response("fees")


@app.get("/api/offices")
async def get_offices():
    return _kb_response("regional_offices")


@app.get("/api/restrictions")
async def get_restrictions():
    return _kb_response("restrictions")


@app.get("/api/resources")
async def get_resources():
    return _kb_response("online_resources")


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
