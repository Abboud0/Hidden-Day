# main.py
# FastAPT app exposing POST /plan - mirrors Next.js route response

import os
import json
import logging
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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
FRONTEND_PROD = os.getenv("FRONTEND_PROD", "https://your-frontend-domain.example")

origins = [FRONTEND_LOCAL, FRONTEND_PROD]

RENDER_BACKEND = os.getenv("RENDER_BACKEND_URL")
if RENDER_BACKEND:
    origins.append(RENDER_BACKEND)

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

# per process cache (10 mins)
cache = TTLCache(ttl_seconds=600)

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
    
    # geocode
    center = await geocode(req.location)
    if not center:
        raise HTTPException(status_code=200, detail="No geocode results")
    
    start, end = build_window(req.date, req.timeframe, req.rangeStart, req.rangeEnd)
    
    # call providers
    import asyncio
    tasks = [
        fetch_yelp(center, req.interests, req.budget, req.useOpenNow, YELP_API_KEY),
        fetch_ticketmaster(center, start, end, req.interests, TICKETMASTER_API_KEY),
    ]
    if EB_ENABLED:
        tasks.append(fetch_eventbrite(center, start, end, req.interests, EVENTBRITE_TOKEN))
        
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # extract lists and swallow errors gracefully
    yelp_items, tm_items, eb_items = [], [], []
    idx = 0
    if len(results) >= 1 and not isinstance(results[0], Exception): yelp_items = results[0]
    if len(results) >= 2 and not isinstance(results[1], Exception): tm_items = results[1]
    if EB_ENABLED and len(results) >= 3 and not isinstance(results[2], Exception): eb_items = results[2]
    
    log.info("providers: yelp=%s ticketmaster=%s eventbrite=%s(EB=%s)",
            len(yelp_items), len(tm_items), len(eb_items), EB_ENABLED)
    
    items = dedupe([*yelp_items, *tm_items, *eb_items])
    items = rank(items, limit=12)
    
    resp = PlanResponse(
        date=req.date,
        budget=req.budget,
        interests=req.interests,
        location=req.location,
        center={"lat": center[0], "lon": center[1]},
        items=items
    ).model_dump()
    
    cache.set(cache_key, resp)
    return resp

@app.get("/health")
def health():
    return {"ok": True}

    