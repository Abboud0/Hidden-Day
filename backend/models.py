# models.py
# typed request/response models and shared PlanItem definition

from pydantic import BaseModel, Field
from typing import List, Literal, Optional

class PlanItem(BaseModel):
    title: str
    lat: float
    lon: float
    url: Optional[str] = None
    # keep sources consistent with frontend
    source: Optional[Literal["yelp", "eventbrite", "google", "fallback", "event"]] = None
    venue: Optional[str] = None
    address: Optional[str] = None
    whenISO: Optional[str] = None


class PlanRequest(BaseModel):
    date: str
    budget: str
    interests: str
    location: str
    timeframe: Literal["day", "weekend", "week", "custom"] = "day"
    useOpenNow: bool = False
    rangeStart: Optional[str] = None
    rangeEnd: Optional[str] = None


class PlanResponse(BaseModel):
    date: str
    budget: str
    interests: str
    location: str
    center: dict = Field(..., description="{'lat': number, 'lon': number}")
    items: List[PlanItem]