"use client";

import { useState } from "react";
import MapView from "./MapView";

// Base backend URL (read from .env.local)
const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "";

// Keep types local to this file for simplicity
type PlanItem = {
  title: string;
  lat: number;
  lon: number;
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
  center: { lat: number; lon: number };
  items: PlanItem[];
};

// helper to format ISO times if present
function formatWhen(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  // Localized short “Sat 7:00 PM”
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
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

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data: PlanResponse = await res.json();

      if (!res.ok) {
        alert((data as any)?.error ?? "Failed to generate plan");
        setLoading(false);
        return;
      }

      setPlanTitles(data.items.map((i) => `${i.title} (${formData.location})`));
      setPoints(data.items);
    } catch (err) {
      console.error(err);
      alert("Network error while generating the plan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto mt-8">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 bg-white p-6 rounded-2xl shadow-lg"
      >
        <h2 className="text-xl font-semibold text-gray-800 text-center">
          Plan Your Hidden Day
        </h2>

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

        {/* timeframe select */}
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

        {/* custom range (shown only if timeframe=custom) */}
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

        {/* yelp open now toggle */}
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

      {/* results */}
      {planTitles.length > 0 && (
        <>
          <div className="mt-6 bg-white p-4 rounded-xl shadow-md">
            <h3 className="text-lg font-bold mb-2 text-center text-gray-700">
              Your Hidden Day Plan ✨
            </h3>
            <ul className="list-disc pl-5 text-gray-700 mb-4 space-y-2">
              {points && points.length > 0 ? (
                points.map((p, i) => (
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
                    {/* compact preview line (only shows if data is present) */}
                    {(p.venue || p.whenISO || p.address) && (
                      <div className="text-sm text-gray-500">
                        {p.venue ?? ""}
                        {p.venue && p.whenISO ? " • " : ""}
                        {formatWhen(p.whenISO)}
                        {p.address ? ` • ${p.address}` : ""}
                      </div>
                    )}
                  </li>
                ))
              ) : (
                planTitles.map((item, i) => <li key={i}>{item}</li>)
              )}
            </ul>
          </div>

          {/* pass API points to the map falls back to jitter mode if null */}
          <MapView
            location={formData.location}
            plan={planTitles}
            points={points ?? undefined}
          />
        </>
      )}
    </div>
  );
}
