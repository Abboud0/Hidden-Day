# providers/yelp.py
# Yelp Fusion search with strict/relaxed open_now fallback

import httpx
from typing import List
from models import PlanItem

def _price_band(budget: str) -> str:
    try:
        b = int(budget)
    except Exception:
        return "1,2,3"
    if b < 25: return "1"
    if b < 60: return "1,2"
    if b < 120: return "2,3"
    return "3,4"

async def fetch_yelp(center: tuple[float, float], interests: str, budget: str, use_open_now: bool, api_key: str) -> List[PlanItem]:
    if not api_key:
        return []
    lat, lon = center
    term = (interests or "things to do").split(",")[0].strip() or "fun"
    price = _price_band(budget)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "HiddenDay/0.1",
        "Accept": "application/json",
    }

    async def query(params: dict) -> List[PlanItem]:
        async with httpx.AsyncClient(timeout=20.0, headers=headers) as client:
            r = await client.get("https://api.yelp.com/v3/businesses/search", params=params)
            if r.status_code != 200:
                return []
            js = r.json()
            out: List[PlanItem] = []
            for b in js.get("businesses", []):
                coords = b.get("coordinates") or {}
                if not coords.get("latitude") or not coords.get("longitude"):
                    continue
                # Optional address preview
                addr_parts = (b.get("location", {}) or {}).get("display_address") or []
                address = ", ".join(addr_parts) if addr_parts else None
                out.append(PlanItem(
                    title=b.get("name", "Place"),
                    lat=float(coords["latitude"]),
                    lon=float(coords["longitude"]),
                    url=b.get("url"),
                    source="yelp",
                    address=address
                ))
            return out

    # pass 1: strict (if desired)
    if use_open_now:
        strict = {
            "latitude": lat,
            "longitude": lon,
            "term": term,
            "radius": 8000,
            "limit": 12,
            "price": price,
            "open_now": True,
        }
        items = await query(strict)
        if items:
            return items

    # pass 2: relaxed
    relaxed = {
        "latitude": lat,
        "longitude": lon,
        "term": term,
        "radius": 12000,
        "limit": 12,
        "price": "1,2,3,4",
    }
    return await query(relaxed)
