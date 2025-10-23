# providers/ticketmaster.py
# Ticketmaster Discovery read-only provider with micro-cache + 429 backoff.

import asyncio
import httpx
from typing import List, Tuple
from datetime import datetime
from models import PlanItem
from utils import iso_no_ms

HEADERS = {
    "User-Agent": "HiddenDay/0.1",
    "Accept": "application/json",
}

# --- Micro-cache to avoid duplicate calls within a short window (dev/HMR, double-submits)
_TM_CACHE: dict[Tuple[float, float, str, str, str], Tuple[float, List[PlanItem]]] = {}
_TM_CACHE_TTL = 30.0  # seconds


async def fetch_ticketmaster(center: tuple[float, float], start: datetime, end: datetime, interests: str, api_key: str) -> List[PlanItem]:
    if not api_key:
        return []

    lat, lon = center
    keyword = (interests or "").split(",")[0].strip()

    start_str = iso_no_ms(start)
    end_str = iso_no_ms(end)
    cache_key = (round(lat, 5), round(lon, 5), start_str, end_str, keyword or "")

    # Serve from micro-cache if fresh
    import time
    now = time.time()
    cached = _TM_CACHE.get(cache_key)
    if cached and (now - cached[0]) < _TM_CACHE_TTL:
        return cached[1]

    params = {
        "apikey": api_key,
        "latlong": f"{lat},{lon}",
        "radius": "25",
        "unit": "miles",
        "startDateTime": start_str,
        "endDateTime": end_str,
        "sort": "date,asc",
        "size": "30",
    }
    if keyword:
        params["keyword"] = keyword

    async with httpx.AsyncClient(timeout=20.0, headers=HEADERS) as client:
        # Up to 3 tries with gentle backoff on 429
        backoff = 1.2  # seconds, TM burst is ~1 rps
        for attempt in range(3):
            r = await client.get("https://app.ticketmaster.com/discovery/v2/events.json", params=params)
            if r.status_code == 200:
                js = r.json()
                events = (((js or {}).get("_embedded") or {}).get("events") or [])
                out: List[PlanItem] = []
                for ev in events:
                    venue = (((ev or {}).get("_embedded") or {}).get("venues") or [None])[0] or {}
                    loc = venue.get("location") or {}
                    try:
                        vlat = float(loc.get("latitude") or venue.get("latitude"))
                        vlon = float(loc.get("longitude") or venue.get("longitude"))
                    except Exception:
                        continue

                    venue_name = venue.get("name")
                    city = (venue.get("city") or {}).get("name")
                    state = (venue.get("state") or {}).get("stateCode") or (venue.get("state") or {}).get("name")
                    line1 = (venue.get("address") or {}).get("line1")
                    address = ", ".join([p for p in [line1, city, state] if p]) if (line1 or city or state) else None
                    when_iso = (((ev.get("dates") or {}).get("start") or {}).get("dateTime")
                                or (ev.get("dates") or {}).get("start", {}).get("localDate"))

                    out.append(PlanItem(
                        title=ev.get("name") or "Event",
                        lat=vlat,
                        lon=vlon,
                        url=ev.get("url"),
                        source="event",
                        venue=venue_name,
                        address=address,
                        whenISO=when_iso
                    ))
                # cache & return
                _TM_CACHE[cache_key] = (time.time(), out)
                return out

            if r.status_code == 429:
                # Respect spike arrest: wait then retry
                await asyncio.sleep(backoff)
                backoff *= 1.5
                continue

            # Non-200 and not 429 → give up quietly
            try:
                print("[ticketmaster] status:", r.status_code, "body:", r.text[:400])
            except Exception:
                pass
            return []

    return []
