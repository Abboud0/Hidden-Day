"use client";

import { useState } from "react";
import MapView from "./MapView";

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
  // backend-provided map center (normalized)
  const [mapCenter, setMapCenter] = useState<{ lat: number; lon: number } | undefined>(undefined);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!API_BASE) {
      alert("Set NEXT_PUBLIC_BACKEND_URL in .env.local to your Render URL.");
      return;
    }
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
        alert(getErrorMessage(data));
        setLoading(false);
        return;
      }

      const plan = data as PlanResponse;

      // titles + items
      setPlanTitles((plan.items || []).map((i) => `${i.title} (${formData.location})`));
      setPoints(plan.items || []);

      // store backend center (fallback to first point)
      const c = toMapCenter(plan.center);
      const fallback =
        plan.items && plan.items.length > 0
          ? { lat: plan.items[0].lat, lon: plan.items[0].lng ?? plan.items[0].lon ?? 0 }
          : undefined;
      setMapCenter(c ?? fallback);
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto mt-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 bg-white p-6 rounded-2xl shadow-lg">
        <h2 className="text-xl font-semibold text-gray-800 text-center">Plan Your Hidden Day</h2>

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
          placeholder="Interests (e.g., food, nature, art)"
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
          className={`py-2 rounded-lg transition text-white ${
            loading ? "bg-blue-300 cursor-not-allowed" : "bg-blue-500 hover:bg-blue-600"
          }`}
        >
          {loading ? "Generating..." : "Generate Plan"}
        </button>
      </form>

      {planTitles.length > 0 && (
        <>
          <div className="mt-6 bg-white p-4 rounded-xl shadow-md">
            <h3 className="text-lg font-bold mb-2 text-center text-gray-700">
              Your Hidden Day Plan ✨
            </h3>
            <ul className="list-disc pl-5 text-gray-700 mb-4 space-y-2">
              {(points ?? []).map((p, i) => (
                <li key={i}>
                  {p.url ? (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {p.title}
                    </a>
                  ) : (
                    p.title
                  )}
                  {p.source && (
                    <span className="ml-2 rounded bg-gray-100 px-2 py-0.5 text-xs uppercase">
                      {p.source}
                    </span>
                  )}
                  {(p.venue || p.whenISO || p.address) && (
                    <div className="text-sm text-gray-500">
                      {p.venue ?? ""}
                      {p.venue && p.whenISO ? " • " : ""}
                      {formatWhen(p.whenISO)}
                      {p.address ? ` • ${p.address}` : ""}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Pass backend-provided center to MapView */}
          <MapView
            location={formData.location}
            plan={planTitles}
            points={toMapPoints(points)}
            center={mapCenter}
          />
        </>
      )}
    </div>
  );
}
