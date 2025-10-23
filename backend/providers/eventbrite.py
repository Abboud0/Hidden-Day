# providers/eventbrite.py
# Eventbrite Discovery (gated). Feature-flag via EB_ENABLE

import httpx
from typing import List
from datetime import datetime
from models import PlanItem
from utils import iso_no_ms

HEADERS = {
    "User-Agent": "HiddenDay/0.1",
    "Accept": "application/json",
}

async def fetch_eventbrite(center: tuple[float, float], start: datetime, end: datetime, interests: str, token: str) -> List[PlanItem]:
    if not token:
        return []
    lat, lon = center

    async def q(params: dict) -> List[PlanItem]:
        async with httpx.AsyncClient(timeout=20.0, headers={**HEADERS, "Authorization": f"Bearer {token}"}) as client:
            r = await client.get("https://www.eventbriteapi.com/v3/events/search/", params=params)
            if r.status_code != 200:
                return []
            data = r.json()
            events = data.get("events") or []
            out: List[PlanItem] = []
            for ev in events[:20]:
                venue = ev.get("venue") or {}
                try:
                    vlat = float(venue.get("latitude"))
                    vlon = float(venue.get("longitude"))
                except Exception:
                    continue
                out.append(PlanItem(
                    title=(ev.get("name") or {}).get("text") or "Event",
                    lat=vlat,
                    lon=vlon,
                    url=ev.get("url"),
                    source="eventbrite"
                ))
            return out

    base = {
        "start_date.range_start": iso_no_ms(start),
        "start_date.range_end": iso_no_ms(end),
        "location.latitude": str(lat),
        "location.longitude": str(lon),
        "location.within": "10km",
        "expand": "venue",
        "virtual_events": "false",
        "include_all_series_instances": "true",
        "sort_by": "date",
    }

    # Try with interest query first, then broaden
    items = await q({**base, "q": interests or ""})
    if items:
        return items
    items = await q({**base})
    if items:
        return items
    items = await q({**base, "location.within": "25km"})
    return items
