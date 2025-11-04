# main.py
# FastAPT app exposing POST /plan - mirrors Next.js route response

import os
import json
import logging
import asyncio
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from models import PlanRequest, PlanResponse, PlanItem
from utils import TTLCache, build_window, dedupe, rank
from providers.geo import geocode
from providers.yelp import fetch_yelp
from providers.ticketmaster import fetch_ticketmaster
from providers.eventbrite import fetch_eventbrite

load_dotenv()

app = FastAPI(title="Hidden Day Planner API", version ="0.4.0")
# CORS origins
FRONTEND_LOCAL = "http://localhost:3000"
FRONTEND_PROD = os.getenv("FRONTEND_PROD", "")

origins = [FRONTEND_LOCAL]
if FRONTEND_PROD:
    origins.append(FRONTEND_PROD)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# logging
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("hidden-day")

# config / env
YELP_API_KEY = os.getenv("YELP_API_KEY", "")
EVENTBRITE_TOKEN = os.getenv("EVENTBRITE_TOKEN", "")
EB_ENABLED = (os.getenv("EB_ENABLE", "0").lower() not in ["0", "false", "no"])
TICKETMASTER_API_KEY = os.getenv("TICKETMASTER_API_KEY", "")

# provider timeout (seconds)
PROVIDER_TIMEOUT_S = int(os.getenv("PROVIDER_TIMEOUT_S", "12"))
GEOCODE_TIMEOUT_S = int(os.getenv("GEOCODE_TIMEOUT_S", "10"))  # default 10s

# per process cache (10 mins)
cache = TTLCache(ttl_seconds=600)

# global JSON error handling
# - HTTPException -> { "error": <detail> }
# - any other exception -> { "error": "Server error" }
@app.exception_handler(HTTPException)
async def http_error_handler(request: Request, exc: HTTPException):
    # concise log. frontend expects JSON only
    log.warning("HTTP %s: %s", exc.status_code, exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})

@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    # log stack once. do not leak details to client
    log.exception("Unhandled exception")
    return JSONResponse(status_code=500, content={"error": "Server error"})

# timeout wrapper for providers
# returns (items, errstr) and never raises
async def run_with_timeout(coro, seconds: int, label: str):
    try:
        items = await asyncio.wait_for(coro, timeout=seconds)
        return items, None
    except asyncio.TimeoutError:
        msg = f"{label} timed out after {seconds}s"
        log.warning(msg)
        return [], msg
    except Exception as e:
        msg = f"{label} error: {e}"
        log.warning(msg)
        return [], msg

@app.post("/plan", response_model=PlanResponse)
async def create_plan(req: PlanRequest):
    """
    Build a plan by querying providers (Yelp, Ticketmaster, *Eventbrite*),
    merging, deduping, ranking, and returning items + center coords.
    """
    # validate minimal inputs (pydantic already ensures required fields)
    cache_key = json.dumps(req.model_dump() | {"EB_ENABLED": EB_ENABLED})
    hit = cache.get(cache_key)
    if hit:
        return PlanResponse(**hit)

    # ---- geocode with timeout (FIX) ----
    center, geo_err = await run_with_timeout(
        geocode(req.location), GEOCODE_TIMEOUT_S, "geocode"
    )
    if geo_err or not center:
        # real client error so frontend shows a friendly message
        raise HTTPException(status_code=400, detail="Geocoding failed or timed out")

    start, end = build_window(req.date, req.timeframe, req.rangeStart, req.rangeEnd)

    # call providers (unchanged except we already wrap with timeouts)
    tasks = []
    labels = []
    if YELP_API_KEY:
        tasks.append(run_with_timeout(
            fetch_yelp(center, req.interests, req.budget, req.useOpenNow, YELP_API_KEY),
            PROVIDER_TIMEOUT_S, "yelp"))
        labels.append("yelp")
    if TICKETMASTER_API_KEY:
        tasks.append(run_with_timeout(
            fetch_ticketmaster(center, start, end, req.interests, TICKETMASTER_API_KEY),
            PROVIDER_TIMEOUT_S, "ticketmaster"))
        labels.append("ticketmaster")
    if EB_ENABLED and EVENTBRITE_TOKEN:
        tasks.append(run_with_timeout(
            fetch_eventbrite(center, start, end, req.interests, EVENTBRITE_TOKEN),
            PROVIDER_TIMEOUT_S, "eventbrite"))
        labels.append("eventbrite")

    if not tasks:
        raise HTTPException(status_code=500, detail="No providers configured")

    results = await asyncio.gather(*tasks)

    # extract lists and collect non-fatal errors (partial results allowed)
    items_all = []
    errors = []
    for (items, err), label in zip(results, labels):
        if items:
            items_all.extend(items)
        if err:
            errors.append(err)
    log.info("providers: %s", ", ".join(f"{lbl}={sum(1 for (its,_) in [r] for r in [])}" for lbl in labels))  # (kept simple)
    if errors:
        for e in errors:
            log.warning("provider issue: %s", e)
    
    items = dedupe(items_all)
    items = rank(items, limit=12)
    
    resp = PlanResponse(
        date=req.date,
        budget=req.budget,
        interests=req.interests,
        location=req.location,
        center={"lat": center[0], "lng": center[1]},
        items=items
    ).model_dump()
    
    cache.set(cache_key, resp)
    # if every provider failed and we have zero items, surface a JSON error
    if not items:
        # still use 500 so frontend can show friendly message
        raise HTTPException(status_code=500, detail=errors[0] if errors else "No results")
    return resp

@app.get("/health")
def health():
    return {"ok": True}
