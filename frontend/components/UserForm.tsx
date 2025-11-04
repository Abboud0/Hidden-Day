"use client";

import { useState } from "react";
import MapView from "./MapView";
import { LineSkeleton, BlockSkeleton } from "./Skeleton";

// Base backend URL (read from .env.local)
const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "";

// --- types ---
type PlanItem = {
  title: string;
  lat: number;
  lon?: number;
  lng?: number;
  url?: string;
  source?: string;
  venue?: string;
  address?: string;
  whenISO?: string;
};

type PlanResponse = {
  date: string;
  budget: string;
  interests: string;
  location: string;
  center: { lat: number; lon?: number; lng?: number };
  items: PlanItem[];
};

// MapView wants {lat, lon, title}
type MapPoint = { lat: number; lon: number; title: string };
function toMapPoints(items: PlanItem[] | null): MapPoint[] | undefined {
  if (!items) return undefined;
  return items
    .map((i) => {
      const lonVal = typeof i.lng === "number" ? i.lng : i.lon;
      if (typeof i.lat !== "number" || typeof lonVal !== "number") return null;
      return { lat: i.lat, lon: lonVal, title: i.title ?? "Place" };
    })
    .filter((p): p is MapPoint => !!p);
}

// --- normalize center to {lat, lon} regardless of {lng|lon} ---
type Center = { lat: number; lon?: number; lng?: number };
function toMapCenter(c?: Center): { lat: number; lon: number } | undefined {
  if (!c || typeof c.lat !== "number") return undefined;
  const lonVal = typeof c.lng === "number" ? c.lng : c.lon;
  if (typeof lonVal !== "number") return undefined;
  return { lat: c.lat, lon: lonVal };
}

// Extract a readable error message without using any
function getErrorMessage(x: unknown): string {
  if (!x) return "Unknown error";
  if (typeof x === "string") return x;
  if (typeof x === "object") {
    const o = x as Record<string, unknown>;
    if (typeof o.error === "string") return o.error;
    if (typeof o.message === "string") return o.message;
    if (Array.isArray(o.detail)) return JSON.stringify(o.detail);
    if (typeof o.detail === "string") return o.detail;
  }
  return "Request failed";
}

// helper to format ISO times if present
function formatWhen(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

// badge styling per source
function sourceBadgeClass(src?: string): string {
  if (!src) return "bg-gray-100 text-gray-700";
  const s = src.toUpperCase();
  if (s.includes("YELP")) return "bg-rose-100 text-rose-700";
  if (s.includes("TICKET") || s.includes("EVENT")) return "bg-indigo-100 text-indigo-700";
  return "bg-gray-100 text-gray-700";
}

// util: open in maps URL
function mapsHref(title: string, addr?: string, lat?: number, lon?: number): string {
  if (typeof lat === "number" && typeof lon === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}&query_place_id=@${lat},${lon}`;
  }
  const q = `${title}${addr ? " " + addr : ""}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

// util: copy helper with graceful fallback
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

export default function UserForm() {
  const [formData, setFormData] = useState({
    date: "",
    budget: "",
    interests: "",
    location: "",
    timeframe: "day", // "day" | "weekend" | "week" | "custom"
    useOpenNow: false,
    rangeStart: "",
    rangeEnd: "",
  });

  const [planTitles, setPlanTitles] = useState<string[]>([]);
  const [points, setPoints] = useState<PlanItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lon: number } | undefined>(undefined);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!API_BASE) {
      setErrorMsg("Set NEXT_PUBLIC_BACKEND_URL in .env.local to your Render URL.");
      return;
    }
    setErrorMsg(null);
    setInfoMsg("Waking server… this can take ~10–20s on the first request.");
    setLoading(true);

    try {
      const payload = {
        ...formData,
        budget: String(formData.budget ?? ""),
        interests: String(formData.interests ?? ""),
        location: String(formData.location ?? ""),
      };

      const res = await fetch(`${API_BASE}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data: unknown = await res.json();

      if (!res.ok) {
        setErrorMsg(getErrorMessage(data));
        setLoading(false);
        return;
      }

      const plan = data as PlanResponse;

      // titles + items
      setPlanTitles((plan.items || []).map((i) => `${i.title} (${formData.location})`));
      setPoints(plan.items || []);

      // map center
      const c = toMapCenter(plan.center);
      const fallback =
        plan.items && plan.items.length > 0
          ? { lat: plan.items[0].lat, lon: plan.items[0].lng ?? plan.items[0].lon ?? 0 }
          : undefined;
      setMapCenter(c ?? fallback);
    } catch (err) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setLoading(false);
      setTimeout(() => setInfoMsg(null), 1200);
    }
  }

  // simple About/How it works card
  const [showAbout, setShowAbout] = useState(false);

  return (
    <div className="w-full max-w-xl mx-auto mt-8">
      {/* Header */}
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Plan Your Hidden Day</h1>
        <p className="text-gray-600">Discover local gems. We blend places + events, ranked smartly.</p>
        <button
          className="mt-2 text-sm text-blue-600 hover:underline"
          onClick={() => setShowAbout((v) => !v)}
        >
          {showAbout ? "Hide details" : "About / How it works"}
        </button>
        {showAbout && (
          <div className="mt-3 text-sm bg-white border border-gray-200 rounded-xl p-3 text-left shadow-sm">
            <p className="text-gray-700">
              We query Yelp + Ticketmaster (Eventbrite optional), dedupe and rank with distance
              and category diversity, then cache for 10 minutes. Times are in UTC ISO (no ms).
            </p>
            <p className="mt-2 text-gray-600">
              First call may wake the server; retries/backoff handle it. Your map centers from the
              backend, and partial results show even if a provider stalls.
            </p>
          </div>
        )}
      </div>

      {/* Info / Error banners */}
      {infoMsg && (
        <div className="mb-3 rounded-lg bg-blue-50 text-blue-800 px-3 py-2 text-sm border border-blue-200">
          {infoMsg}
        </div>
      )}
      {errorMsg && (
        <div className="mb-3 rounded-lg bg-rose-50 text-rose-800 px-3 py-2 text-sm border border-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 bg-white p-5 rounded-2xl shadow-lg">
        <input
          type="date"
          name="date"
          value={formData.date}
          onChange={handleChange}
          className="border border-gray-300 rounded-lg p-2"
          required
        />

        <input
          type="number"
          name="budget"
          value={formData.budget}
          onChange={handleChange}
          placeholder="Budget ($)"
          className="border border-gray-300 rounded-lg p-2"
          min={0}
          step="1"
          required
        />

        <input
          type="text"
          name="interests"
          value={formData.interests}
          onChange={handleChange}
          placeholder="Interests (e.g., coffee, art, live music)"
          className="border border-gray-300 rounded-lg p-2"
          required
        />

        <input
          type="text"
          name="location"
          value={formData.location}
          onChange={handleChange}
          placeholder="Your city or area"
          className="border border-gray-300 rounded-lg p-2"
          required
        />

        <select
          name="timeframe"
          value={formData.timeframe}
          onChange={(e) => setFormData((f) => ({ ...f, timeframe: e.target.value }))}
          className="border border-gray-300 rounded-lg p-2"
        >
          <option value="day">Selected day only</option>
          <option value="weekend">Weekend of selected date</option>
          <option value="week">Week of selected date</option>
          <option value="custom">Custom range</option>
        </select>

        {formData.timeframe === "custom" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              type="datetime-local"
              name="rangeStart"
              value={formData.rangeStart}
              onChange={(e) => setFormData((f) => ({ ...f, rangeStart: e.target.value }))}
              className="border border-gray-300 rounded-lg p-2"
              placeholder="Start"
            />
            <input
              type="datetime-local"
              name="rangeEnd"
              value={formData.rangeEnd}
              onChange={(e) => setFormData((f) => ({ ...f, rangeEnd: e.target.value }))}
              className="border border-gray-300 rounded-lg p-2"
              placeholder="End"
            />
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={formData.useOpenNow}
            onChange={(e) => setFormData((f) => ({ ...f, useOpenNow: e.target.checked }))}
          />
          Only show places open now (Yelp)
        </label>

        <button
          type="submit"
          disabled={loading}
          className={`py-2 rounded-lg transition text-white ${loading ? "bg-blue-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
            }`}
        >
          {loading ? "Generating..." : "Generate Plan"}
        </button>
      </form>

      {/* Results */}
      {loading && (
        <div className="mt-6 bg-white p-4 rounded-xl shadow-md space-y-3">
          <LineSkeleton w="w-1/3" />
          <LineSkeleton />
          <LineSkeleton w="w-2/3" />
          <div className="mt-4">
            <BlockSkeleton h={320} />
          </div>
        </div>
      )}

      {!loading && planTitles.length > 0 && (
        <>
          {/* List card */}
          <div className="mt-6 bg-white p-4 rounded-xl shadow-md">
            <h3 className="text-lg font-bold mb-2 text-center text-gray-700">
              Your Hidden Day Plan ✨
            </h3>

            {/* Empty state */}
            {(!points || points.length === 0) && (
              <div className="text-center text-gray-600 py-6">
                <p className="font-medium">No results found.</p>
                <p className="text-sm">
                  Try fewer filters, widen the time window, or turn off “Open now”.
                </p>
              </div>
            )}

            {/* Items */}
            <ul className="list-disc pl-5 text-gray-700 mb-4 space-y-3">
              {(points ?? []).map((p, i) => {
                const lonVal = p.lng ?? p.lon;
                const isEvent =
                  (p.source ?? "").toUpperCase().includes("TICKET") ||
                  (p.source ?? "").toUpperCase().includes("EVENT");

                return (
                  <li key={i} className="marker:text-gray-400">
                    {/* Title + source badge */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {p.url ? (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {p.title}
                        </a>
                      ) : (
                        <span className="font-medium">{p.title}</span>
                      )}

                      {p.source && (
                        <span
                          className={`ml-1 rounded px-2 py-0.5 text-xs uppercase ${sourceBadgeClass(
                            p.source
                          )}`}
                        >
                          {isEvent ? "EVENT" : "YELP"}
                        </span>
                      )}
                    </div>

                    {/* Meta line */}
                    {(p.venue || p.whenISO || p.address) && (
                      <div className="text-sm text-gray-500">
                        {p.venue ?? ""}
                        {p.venue && p.whenISO ? " • " : ""}
                        {formatWhen(p.whenISO)}
                        {p.address ? ` • ${p.address}` : ""}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-1 flex gap-3 text-sm">
                      {p.url && (
                        <button
                          type="button"
                          className="text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline"
                          onClick={async () => {
                            const ok = await copyToClipboard(p.url!);
                            if (!ok) alert("Copy failed");
                          }}
                        >
                          Copy link
                        </button>
                      )}
                      <a
                        href={mapsHref(p.title, p.address, p.lat, typeof lonVal === "number" ? lonVal : undefined)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline"
                      >
                        Open in Maps
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Map with loading overlay */}
          <MapView
            location={formData.location}
            plan={planTitles}
            points={toMapPoints(points)}
            center={mapCenter}
            loading={loading}
          />
        </>
      )}
    </div>
  );
}