/* eslint-disable @typescript-eslint/no-explicit-any */
import { error } from "console";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

// -- Types --
type PlanItem = { title: string; lat: number; lon: number; source?: string; url?: string };
type PlanResponse = {
    date: string;
    budget: string;
    interests: string;
    location: string;
    center: { lat: number; lon: number };
    items: PlanItem[];
};

// -- in memory cache (per server instance) -- 
type CacheEntry = { expires: number; data: PlanResponse };
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 mins
const cache = new Map<string, CacheEntry>();

// -- helpers --
function ok<T>(data: T, init?: number) {
    return new Response(JSON.stringify(data), {
        status: init ?? 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
}
function fail(message: string, status = 400) {
    return ok({ error: message }, status);
}
function hashKey(obj: unknown) {
    return JSON.stringify(obj);
}
function jitterAround([lat, lon]: [number, number], n: number) {
    const items: PlanItem[] = [];
    for (let i = 0; i < n; i++) {
        const latOffset = (Math.random() - 0.5) * 0.02;
        const lonOffset = (Math.random() - 0.5) * 0.02;
        items.push({
            title: ["Coffee", "Park walk", "Lunch", "Museum"][i] ?? `Stop ${i + 1}`,
            lat: lat + latOffset,
            lon: lon + lonOffset,
            source: "fallback",
        });
    }
    return items;
}
function dedupe(items: PlanItem[]) {
    const seen = new Set<string>();
    const out: PlanItem[] = [];
    for (const it of items) {
        const key = `${it.title.toLowerCase()}|${it.lat.toFixed(4)}|${it.lon.toFixed(4)}`;
        if (!seen.has(key)) {
            seen.add(key);
            out.push(it);
        }
    }
    return out;
}
function pickTop(items: PlanItem[], limit = 12) {
    // naive score: prefer sources in this order & randomized within each block
    const order = { google: 3, yelp: 2, eventbrite: 2, fallback: 1 } as Record<string, number>;
    return items
        .map(i => ({ i, score: (order[i.source ?? "fallback"] ?? 0) + Math.random() * 0.25 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(x => x.i)
}

// -- Geocoding (Nominatim currently "free") might upgrading to google later --
async function geocodeLocation(q: string): Promise<[number, number] | null> {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
        headers: {
            "User-Agent": "HiddenDay/0.1 (contact: example@hidden.day)",
            "Accept-Language": "en",
        },
    });
    if (!res.ok) return null;
    const data: any[] = await res.json();
    if (!data?.length) return null;
    return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
}

// -- providers --
async function fetchGooglePlaces(
    center: [number, number],
    interests: string,
    budget: string
): Promise<PlanItem[]> {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return [];

    // using Places Nearby Search (new Places API “Nearby Search”)
    // radius ~ 6km, keyword = interests
    const [lat, lon] = center;
    const radius = 6000;
    const url =
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}` +
        `&radius=${radius}&keyword=${encodeURIComponent(interests)}&opennow=true&key=${key}`;

    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const results: any[] = data?.results ?? [];
    return results.slice(0, 10).map(place => ({
        title: place.name,
        lat: place.geometry?.location?.lat,
        lon: place.geometry?.location?.lng,
        source: "google",
        url: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
    }));
}

async function fetchYelp(center: [number, number], interests: string, budget: string): Promise<PlanItem[]> {
    const token = process.env.YELP_API_KEY;
    if (!token) return [];

    const [lat, lon] = center;
    // map budget tp yelp price filter: 1-4
    const numeric = Number(budget);
    const price = !isNaN(numeric)
        ? numeric < 25 ? "1"
            : numeric < 60 ? "1,2"
                : numeric < 120 ? "2,3"
                    : "3,4"
        : "1,2,3"

    const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        term: interests || "things to do",
        radius: "8000",
        limit: "12",
        price,
        open_now: "true",
    });

    const res = await fetch(`https://api.yelp.com/v3/businesses/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const businesses: any[] = data?.businesses ?? [];
    return businesses.map(b => ({
        title: b.name,
        lat: b.coordinates?.latitude,
        lon: b.coordinates?.longitude,
        source: "yelp",
        url: b.url,
    }));
}

async function fetchEventbrite(center: [number, number], date: string, interests: string): Promise<PlanItem[]> {
    const token = process.env.EVENTBRITE_TOKEN;
    if (!token) return [];
    const [lat, lon] = center;

    // window: same day (or weekend if date is weekend)
    const start = new Date(date || new Date());
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    const params = new URLSearchParams({
        "location.latitude": String(lat),
        "location.longitude": String(lon),
        "location.within": "10km",
        "expand": "venue",
        "sort_by": "date",
        "q": interests || "",
        "start_date.range_start": start.toISOString(),
        "start_date.range_end": end.toISOString(),
    });

    const res = await fetch(`https://www.eventbriteapi.com/v3/events/search/?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const events: any[] = data?.events ?? [];
    return events
        .filter(e => e?.venue?.latitude && e?.venue?.longitude)
        .slice(0, 10)
        .map(e => ({
            title: e.name?.text ?? "Event",
            lat: parseFloat(e.venue.latitude),
            lon: parseFloat(e.venue.longitude),
            source: "eventbrite",
            url: e.url,
        }));
}

// -- validation --
function validateBody(body: any) {
    const errors: string[] = [];
    const date = (body?.date ?? "").toString();
    const budget = (body?.budget ?? "").toString();
    const interests = (body?.interests ?? "").toString();
    const location = (body?.location ?? "").toString();

    if (!date) errors.push("date is required");
    if (!budget) errors.push("budget is required");
    if (!interests) errors.push("interests is required");
    if (!location) errors.push("location is required");
    return { valid: errors.length === 0, errors, date, budget, interests, location };
}

// -- route --
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { valid, errors, date, budget, interests, location } = validateBody(body);
        if (!valid) return fail(`Invalid payload: ${errors.join(", ")}`, 422);

        // cache
        const cacheKey = hashKey({ date, budget, interests, location });
        const now = Date.now();
        const cached = cache.get(cacheKey);
        if (cached && cached.expires > now) {
            return ok(cached.data);
        }

        // geocode location -> center
        const centerCoords = await geocodeLocation(location);
        if (!centerCoords) {
            // as a last resort, return mock items without a center
            const resp: PlanResponse = {
                date, budget, interests, location,
                center: { lat: 0, lon: 0 },
                items: [
                    { title: "Morning coffee at a local cafe",    lat: 30.3322, lon: -81.6557, source: "fallback" },
                    { title: "Visit a park nearby",               lat: 30.34,   lon: -81.67,   source: "fallback" },
                    { title: "Lunch at a cozy restaurant",        lat: 30.33,   lon: -81.64,   source: "fallback" },
                    { title: "Explore a local museum",            lat: 30.33,   lon: -81.66,   source: "fallback" },
                ],
            };
            cache.set(cacheKey, { expires: now + CACHE_TTL_MS, data: resp });
            return ok(resp);
        }

        // query providers (in parallel, keep running even if one fails)
        const [lat, lon] = centerCoords;
        const [g, y, e] = await Promise.allSettled([
            fetchGooglePlaces(centerCoords, interests, budget),
            fetchYelp(centerCoords, interests, budget),
            fetchEventbrite(centerCoords, date, interests),
        ]);

        const items: PlanItem[] = [
            ...(g.status === "fulfilled" ? g.value : []),
            ...(y.status === "fulfilled" ? y.value : []),
            ...(e.status === "fulfilled" ? e.value : []),
        ];

        let finalItems: PlanItem[] = items.length ? pickTop(dedupe(items), 12) : [];

        // fallback if nothing came back
        if (finalItems.length === 0) {
            finalItems = jitterAround([lat, lon], 4);
        }

        const resp: PlanResponse = {
            date,
            budget,
            interests,
            location,
            center: { lat, lon },
            items: finalItems,
        };

        cache.set(cacheKey, { expires: now + CACHE_TTL_MS, data: resp });
        return ok(resp);
    } catch (err: any) {
        console.error("[/api/plan] error:", err);
        return fail("Server error while generating the plan", 500);
    }
}
