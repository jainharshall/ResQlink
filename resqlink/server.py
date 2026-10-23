"""ResQLink prototype backend: static hosting, /api/ask (Gemini + local fallback), /sos relay sink."""
import os, re, json, time, secrets
from pathlib import Path
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE = Path(__file__).parent
STATIC = BASE / "static"
GUIDES = json.loads((STATIC / "data" / "firstaid.json").read_text(encoding="utf-8"))
GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
GEMINI_BASE = os.getenv("GEMINI_BASE", "https://generativelanguage.googleapis.com/v1beta")
SOS_FILE = BASE / "sos_store.json"

STOP = set("a an the is are was were be to of in on at for and or my me i we you he she it this that with what how do does can should someone some please help need".split())

def stem(w):
    for suf in ("ing", "ed", "es", "s"):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            return w[: -len(suf)]
    return w

def toks(text):
    return [stem(w) for w in re.findall(r"[a-z]+", text.lower()) if w not in STOP]

for g in GUIDES:
    g["_kw"] = set(toks(g["keywords"]))
    g["_title"] = set(toks(g["title"]))
    g["_body"] = set(toks(" ".join(g["steps"])))

def retrieve(q, k=3, min_score=2):
    qs = set(toks(q))
    scored = []
    for g in GUIDES:
        s = sum(3 for t in qs if t in g["_kw"]) + sum(2 for t in qs if t in g["_title"]) + sum(1 for t in qs if t in g["_body"])
        if s >= min_score:
            scored.append((s, g))
    scored.sort(key=lambda x: -x[0])
    return [g for _, g in scored[:k]]

SYSTEM = ("You are ResQLink, an emergency first-aid assistant for disaster situations. "
          "Answer ONLY using the GUIDES provided. Reply in the same language as the user's question. "
          "Give at most 6 short numbered steps. If the guides do not cover the question, say so and tell the user to call 112. "
          "Never invent medicines, doses or procedures. End with: Call 112 if the person is in danger.")

async def gemini_answer(question, hits):
    guides = "\n\n".join(f"[{i+1}] {g['title']}\n" + "\n".join(f"- {s}" for s in g["steps"]) for i, g in enumerate(hits))
    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": f"GUIDES:\n{guides}\n\nQUESTION: {question}"}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 600},
    }
    url = f"{GEMINI_BASE}/models/{GEMINI_MODEL}:generateContent"
    async with httpx.AsyncClient(timeout=12) as c:
        r = await c.post(url, headers={"x-goog-api-key": GEMINI_KEY, "Content-Type": "application/json"}, json=body)
        r.raise_for_status()
        data = r.json()
    parts = data["candidates"][0]["content"]["parts"]
    text = "".join(p.get("text", "") for p in parts).strip()
    if not text:
        raise ValueError("empty answer")
    return text

app = FastAPI(title="ResQLink prototype")

class Ask(BaseModel):
    question: str

class SOS(BaseModel):
    id: str
    type: str
    people: int = 1
    note: str = ""
    lat: float | None = None
    lng: float | None = None
    ts: int
    hops: list[str] = []

class LiveUpdate(BaseModel):
    lat: float
    lng: float
    updatedAt: int

def _active_live_session(token):
    session = LIVE_LOCATIONS.get(token)
    if session is None or session["expiresAt"] <= int(time.time() * 1000):
        LIVE_LOCATIONS.pop(token, None)
        raise HTTPException(status_code=404, detail="Live location session not found or expired")
    return session

@app.get("/api/health")
def health():
    return {"ok": True, "gemini_configured": bool(GEMINI_KEY), "model": GEMINI_MODEL}

@app.post("/api/ask")
async def ask(body: Ask):
    q = body.question.strip()[:500]
    hits = retrieve(q)
    if not hits:
        return {"mode": "none", "answer": None, "sources": []}
    if GEMINI_KEY:
        try:
            text = await gemini_answer(q, hits)
            return {"mode": "gemini", "answer": text, "sources": [g["title"] for g in hits]}
        except Exception:
            pass  # fall through to local answer; never expose key or upstream errors
    g = hits[0]
    ans = "\n".join(f"{i+1}. {s}" for i, s in enumerate(g["steps"])) + "\nCall 112 if the person is in danger."
    return {"mode": "local", "answer": ans, "sources": [g["title"]]}

def _load():
    try:
        return json.loads(SOS_FILE.read_text())
    except Exception:
        return {}
STORE = _load()
LIVE_LOCATIONS = {}
LIVE_TTL_SECONDS = 60 * 60

@app.post("/sos")
def add_sos(s: SOS):
    STORE[s.id] = s.model_dump()
    SOS_FILE.write_text(json.dumps(STORE))
    return {"ok": True, "count": len(STORE)}

@app.get("/sos")
def list_sos():
    return sorted(STORE.values(), key=lambda x: -x["ts"])

@app.post("/api/live")
def start_live_location():
    token = secrets.token_urlsafe(32)
    now = int(time.time() * 1000)
    LIVE_LOCATIONS[token] = {
        "lat": None,
        "lng": None,
        "updatedAt": None,
        "createdAt": now,
        "expiresAt": now + LIVE_TTL_SECONDS * 1000,
    }
    return {"token": token, "expiresAt": LIVE_LOCATIONS[token]["expiresAt"]}

@app.put("/api/live/{token}")
def update_live_location(token: str, update: LiveUpdate):
    session = _active_live_session(token)
    session.update({"lat": update.lat, "lng": update.lng, "updatedAt": update.updatedAt})
    return {"ok": True}

@app.get("/api/live/{token}")
def get_live_location(token: str):
    return _active_live_session(token)

@app.delete("/api/live/{token}")
def stop_live_location(token: str):
    _active_live_session(token)
    del LIVE_LOCATIONS[token]
    return {"ok": True}

app.mount("/", StaticFiles(directory=STATIC, html=True), name="static")
