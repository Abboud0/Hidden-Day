/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";

export const runtime = "nodejs";

/** --------
 *    Types
 * ----------
 */
type PlanItem = {
    title: string;
    lat: number;
    lon: number;
    source?: "yelp" | "eventbrite" | "google" | "fallback";
    url?: string;
};

type PlanResponse = {
    date: string;
    budget: string;
    interests: string;
    location: string;
    center: { lat: number; lon: number };
    items: PlanItem[];
};

/** -----------------------
 *   in memory cache
 *   (per server instance)
 * ------------------------
 */
type CacheEntry = { expires: number; data: PlanResponse };
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 mins
const cache = new Map<string, CacheEntry>();

/** Helpers for responses */
function ok<T>(data: T, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
}

function fail(message: string, status = 400) {
    return ok({ error: message }, status);
}
const keyOf = (obj: unknown) => JSON.stringify(obj);

/** if providers return nothing, produce jittered mock items near center */
function fallbackItemsAround([lat, lon]: [number, number], n = 4): PlanItem[] {
    const names = ["Coffee spot", "City park walk", "Lunch bite", "Museum / gallery"];
    return Array.from({ length: n }).map((_, i) => ({
        title: names[i] ?? `Stop ${i + 1}`,
        lat: lat + (Math.random() - 0.5) * 0.02,
        lon: lon + (Math.random() - 0.5) * 0.02,
        source: "fallback",
    }));
}

/** Deduplicate by (title + approx coords) */
function dedupe(items: PlanItem[]) {
    const seen = new Set<string>();
    const out: PlanItem[] = [];
    for (const it of items) {
        const k = `${it.title.toLowerCase()}|${it.lat.toFixed(4)}|${it.lon.toFixed(4)}`;
        if (!seen.has(k)) {
            seen.add(k);
            out.push(it);
        }
    }
    return out;
}

/** lightweight ranking: prefer real providers over fallback */
function rank(items: PlanItem[], limit = 12) {
    const weight: Record<string, number> = { google: 3, yelp: 2, eventbrite: 2, fallback: 1 };
    return items
        .map(i => ({ i, s: (weight[i.source ?? "fallback"] ?? 0) + Math.random() * 0.2 }))
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .map(x => x.i);
}

/** build a start/end window based on date + timeframe */
function buildWindow(dateISO: string, timeframe: "day" | "weekend" | "week" | "custom", rangeStart?: Date | null, rangeEnd?: Date | null) {
    if (timeframe === "custom" && rangeStart && rangeEnd) {
        return { start: rangeStart, end: rangeEnd };
    }

    const base = new Date(dateISO); // the date that the user picked
    // normalize to local midnight for consistency
    const dayStart = new Date(base); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(base); dayEnd.setHours(23, 59, 59, 999);

    if (timeframe === "day") return { start: dayStart, end: dayEnd };

    if (timeframe === "weekend") {
        // take the weekend containing the chosen date (Sat-Sun)
        const d = new Date(base);
        const dow = d.getDay(); // 0 sun, 6 sat
        const sat = new Date(d); sat.setDate(sat.getDate() + ((6 - dow + 7) % 7)); sat.setHours(0, 0, 0, 0);
        const sun = new Date(sat); sun.setDate(sat.getDate() + 1); sun.setHours(23, 59, 59, 999);
        return { start: sat, end: sun };
    }

    // timeframe === "week"
    const d = new Date(base);
    const dow = d.getDay(); // 0...6
    const monday = new Date(d); monday.setDate(d.getDate() - ((dow + 6) % 7)); monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
}

/** --------------------------------------------------
 * Geocoding (Nominatim) might upgrade to Google later
 * ---------------------------------------------------
 */
async function geocode(q: string): Promise<[number, number] | null> {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
        headers: {
            "User-Agent": "HiddenDay/0.1 (demo)",
            "Accept-Language": "en",
        },
    });
    if (!res.ok) return null;
    const data: any[] = await res.json();
    if (!data?.length) return null;
    return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
}

/** -------------------------
 *      Yelp Fusion 
 * -------------------------
 */
async function fetchYelp(center: [number, number], interests: string, budget: string, useOpenNow: boolean): Promise<PlanItem[]> {
    const token = process.env.YELP_API_KEY;
    if (!token) return [];

    const [lat, lon] = center;
    const b = Number(budget);
    const priceStrict = isNaN(b) ? "1,2,3" : b < 25 ? "1" : b < 60 ? "1,2" : b < 120 ? "2,3" : "3,4";
    const term = (interests || "things to do").split(",")[0].trim();

    async function query(params: URLSearchParams) {
        const res = await fetch(`https://api.yelp.com/v3/businesses/search?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return [];
        const data = await res.json();
        const businesses: any[] = data?.businesses ?? [];
        return businesses
            .filter(b => b?.coordinates?.latitude && b?.coordinates?.longitude)
            .map(b => ({
                title: b.name,
                lat: b.coordinates.latitude,
                lon: b.coordinates.longitude,
                source: "yelp" as const,
                url: b.url,
            }));
    }

    // pass 1: strict (only if user wants "open now")
    if (useOpenNow) {
        const strictParams = new URLSearchParams({
            latitude: String(lat),
            longitude: String(lon),
            term,
            radius: "8000",
            limit: "12",
            price: priceStrict,
            open_now: "true",
        });
        const items = await query(strictParams);
        if (items.length) return items;
    }

    // pass 2: relaxed (no open_now, broaden prices)
    const relaxedParams = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        term,
        radius: "12000",
        limit: "12",
        price: "1,2,3,4",
    });
    return await query(relaxedParams);
}

/** ------------------------------------
 * Eventbrite integration
 * - uses selected date
 * - filters by location (10 km radius)
 * - expnads venue to get lan n lon
 * -------------------------------------
 */
async function fetchEventbrite(
    center: [number, number],
    start: Date,
    end: Date,
    interests: string
): Promise<PlanItem[]> {
    const token = process.env.EVENTBRITE_TOKEN;
    if (!token) return [];
    const [lat, lon] = center;

    async function query(params: URLSearchParams) {
        const res = await fetch(`https://www.eventbriteapi.com/v3/events/search/?${params.toString()}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                "User-Agent": "HiddenDay/0.1",
                Accept: "application/json",
            },
        });
        if (!res.ok) {
            console.warn("[eventbrite] non-200:", res.status);
            return [];
        }
        const data = await res.json();
        const events: any[] = data?.events ?? [];
        return events
            .filter(e => e?.venue?.latitude && e?.venue?.longitude)
            .slice(0, 20)
            .map(e => ({
                title: e.name?.text ?? "Event",
                lat: parseFloat(e.venue.latitude),
                lon: parseFloat(e.venue.longitude),
                source: "eventbrite" as const,
                url: e.url,
            }));
    }

    const baseParams = {
        "start_date.range_start": start.toISOString(),
        "start_date.range_end": end.toISOString(),
        "location.latitude": String(lat),
        "location.longitude": String(lon),
        "location.within": "10km",
        "expand": "venue",
        "virtual_events": "false",
        "include_all_series_instances": "true",
        "sort_by": "date",
    } as const;

    // Pass 1: with query (your interests)
    const p1 = new URLSearchParams({ ...baseParams, q: interests || "" } as any);
    let items = await query(p1);
    if (items.length) return items;

    // Pass 2: drop q (broad search)
    const p2 = new URLSearchParams({ ...baseParams } as any);
    items = await query(p2);
    if (items.length) return items;

    // Pass 3: widen radius to 25km
    const p3 = new URLSearchParams({ ...baseParams, "location.within": "25km" } as any);
    items = await query(p3);
    return items;
}

/** ---------------------
 *   payload validation
 * ----------------------
 */
function validate(body: any) {
    const errors: string[] = [];
    const date = String(body?.date ?? "");
    const budget = String(body?.budget ?? "");
    const interests = String(body?.interests ?? "");
    const location = String(body?.location ?? "");
    const timeframe = (body?.timeframe ?? "day") as "day" | "weekend" | "week" | "custom";
    const rangeStart = body?.rangeStart ? new Date(String(body.rangeStart)) : null;
    const rangeEnd = body?.rangeEnd ? new Date(String(body.rangeEnd)) : null;
    const useOpenNow = Boolean(body?.useOpenNow ?? false);

    if (!date) errors.push("date is required");
    if (!budget) errors.push("budget is required");
    if (!interests) errors.push("interests is required");
    if (!location) errors.push("location is required");
    if (timeframe === "custom" && (!rangeStart || !rangeEnd)) {
        errors.push("rangeStart and rangeEnd required when timeframe=custom");
    }

    return { ok: errors.length === 0, errors, date, budget, interests, location, timeframe, rangeStart, rangeEnd, useOpenNow };
}

/** -------------------------
 *  Route: POST /api/plan
 * -------------------------
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const {
            ok: valid, errors, date, budget, interests, location,
            timeframe, rangeStart, rangeEnd, useOpenNow
        } = validate(body);
        if (!valid) return fail(`Invalid payload: ${errors.join(", ")}`, 422);

        const cacheKey = JSON.stringify({ date, budget, interests, location, timeframe, rangeStart, rangeEnd, useOpenNow });
        const now = Date.now();
        const hit = cache.get(cacheKey);
        if (hit && hit.expires > now) return ok(hit.data);

        const center = await geocode(location);
        if (!center) {
            const resp: PlanResponse = {} as any;
            cache.set(cacheKey, { expires: now + CACHE_TTL_MS, data: resp });
            return ok(resp);
        }

        // build time window for Eventbrite
        const { start, end } = buildWindow(date, timeframe, rangeStart, rangeEnd);

        const [yelpRes, ebRes] = await Promise.allSettled([
            fetchYelp(center, interests, budget, useOpenNow),
            fetchEventbrite(center, start, end, interests),
        ]);

        console.log(
            "Yelp:", yelpRes.status === "fulfilled" ? yelpRes.value.length : `ERR ${yelpRes.status}`,
            "Eventbrite:", ebRes.status === "fulfilled" ? ebRes.value.length : `ERR ${ebRes.status}`
        );


        const items = [
            ...(yelpRes.status === "fulfilled" ? yelpRes.value : []),
            ...(ebRes.status === "fulfilled" ? ebRes.value : []),
        ];

        const final = items.length ? rank(dedupe(items), 12) : fallbackItemsAround(center, 4);
        const [lat, lon] = center;

        const resp: PlanResponse = {
            date, budget, interests, location,
            center: { lat, lon },
            items: final,
        };

        console.log("EB token present?", !!process.env.EVENTBRITE_TOKEN);

        cache.set(cacheKey, { expires: now + CACHE_TTL_MS, data: resp });
        return ok(resp);
    } catch (e) {
        console.error(e);
        return fail("Server error while generating the plan", 500);
    }
}
