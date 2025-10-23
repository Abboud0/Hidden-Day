# utils.py
# Helpers: time windows, ranking, dedupe, simple in-memory TTL cache

from __future__ import annotations
from dataclasses import dataclass
from typing import List
from datetime import datetime, timedelta, timezone
from models import PlanItem
import re
import random
from datetime import datetime, timezone

def iso_no_ms(dt: datetime) -> str:
    """
    Ticketmaster requires ISO8601 *without* fractional seconds and in UTC.
    Example: 2025-10-25T04:00:00Z
    """
    # Ensure timezone-aware
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    # Normalize to UTC and format without microseconds
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_window(date_iso: str, timeframe: str, range_start: str | None, range_end: str | None) -> tuple[datetime, datetime]:
    """Compute start/end window from date + timeframe (UTC normalized)."""
    if timeframe == "custom" and range_start and range_end:
        return (datetime.fromisoformat(range_start), datetime.fromisoformat(range_end))

    base = datetime.fromisoformat(date_iso)
    # Day window
    day_start = base.replace(hour=0, minute=0, second=0, microsecond=0)
    # Use :59 with no fractional part; we'll strip any if present just in case
    day_end = base.replace(hour=23, minute=59, second=59, microsecond=0)

    if timeframe == "day":
        return (day_start, day_end)

    if timeframe == "weekend":
        dow = base.weekday()  # Mon=0..Sun=6
        days_to_sat = (5 - dow) % 7
        sat = (base + timedelta(days=days_to_sat)).replace(hour=0, minute=0, second=0, microsecond=0)
        sun_end = (sat + timedelta(days=1)).replace(hour=23, minute=59, second=59, microsecond=0)
        return (sat, sun_end)

    # week (Mon..Sun)
    dow = base.weekday()
    monday = (base - timedelta(days=(dow + 7 - 0) % 7)).replace(hour=0, minute=0, second=0, microsecond=0)
    sunday_end = (monday + timedelta(days=6)).replace(hour=23, minute=59, second=59, microsecond=0)
    return (monday, sunday_end)


def dedupe(items: List[PlanItem]) -> List[PlanItem]:
    """Deduplicate by (title + approx coords)."""
    seen = set()
    out: List[PlanItem] = []
    for it in items:
        k = f"{it.title.lower()}|{it.lat:.4f}|{it.lon:.4f}"
        if k not in seen:
            seen.add(k)
            out.append(it)
    return out


def rank(items: List[PlanItem], limit: int = 12) -> List[PlanItem]:
    """
    Prefer time-bound events over static places.
    Weights:
      event/eventbrite > google > yelp > fallback
    Add a tiny jitter to avoid ties.
    """
    weight = {
        "event": 4,
        "eventbrite": 4,
        "google": 3,
        "yelp": 2,
        "fallback": 1,
    }
    scored = [(it, weight.get((it.source or "fallback"), 1) + random.random() * 0.01) for it in items]
    scored.sort(key=lambda t: t[1], reverse=True)
    return [it for it, _ in scored][:limit]


@dataclass
class CacheEntry:
    expires: float
    data: dict


class TTLCache:
    """Simple in-memory TTL cache (per-process)."""

    def __init__(self, ttl_seconds: int = 600):
        self.ttl = ttl_seconds
        self._store: dict[str, CacheEntry] = {}

    def get(self, key: str) -> dict | None:
        import time
        entry = self._store.get(key)
        if not entry:
            return None
        if entry.expires < time.time():
            self._store.pop(key, None)
            return None
        return entry.data

    def set(self, key: str, value: dict) -> None:
        """
        Save value under key with TTL. (Bugfix: parameter name MUST be 'value';
        older snippet had a typo causing NameError.)
        """
        import time
        self._store[key] = CacheEntry(expires=time.time() + self.ttl, data=value)
