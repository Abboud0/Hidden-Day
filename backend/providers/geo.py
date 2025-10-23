# providers/geo.py
# nominatim geocoding (read-only, no key) (might be replaced with google places later)

import httpx

HEADERS = {
    "User-Agent": "HiddenDay/SmartWeekendPlanner (https://hidden.day)",
    "Accept-Language": "en",
    "Accept": "application/json",
}

async def geocode(q: str) -> tuple[float, float] | None:
    url = "https://nominatim.openstreetmap.org/search"
    params = {"format": "jsonv2", "q": q, "limit": 1}
    async with httpx.AsyncClient(timeout=20.0, headers=HEADERS) as client:
        r = await client.get(url, params=params)
        if r.status_code != 200:
            return None
        data = r.json()
        if not data:
            return None
        return (float(data[0]["lat"]), float(data[0]["lon"]))
