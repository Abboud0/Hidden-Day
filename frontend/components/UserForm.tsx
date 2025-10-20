"use client";

import { useState } from "react";
import MapView from "./MapView";

// Keep types local to this file for simplicity
type PlanItem = { title: string; lat: number; lon: number };
type PlanResponse = {
  date: string;
  budget: string;
  interests: string;
  location: string;
  center: { lat: number; lon: number };
  items: PlanItem[];
};

export default function UserForm() {
  const [formData, setFormData] = useState({
    date: "",
    budget: "",
    interests: "",
    location: "",
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
      const res = await fetch("/api/plan", {
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

      setPlanTitles(
        data.items.map((i) => `${i.title} (${formData.location})`)
      );
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

        <button
          type="submit"
          disabled={loading}
          className={`py-2 rounded-lg transition text-white ${
            loading
              ? "bg-blue-300 cursor-not-allowed"
              : "bg-blue-500 hover:bg-blue-600"
          }`}
        >
          {loading ? "Generating..." : "Generate Plan"}
        </button>
      </form>

      {/* Results */}
      {planTitles.length > 0 && (
        <>
          <div className="mt-6 bg-white p-4 rounded-xl shadow-md">
            <h3 className="text-lg font-bold mb-2 text-center text-gray-700">
              Your Hidden Day Plan ✨
            </h3>
            <ul className="list-disc pl-5 text-gray-700 mb-4">
              {planTitles.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>

          {/* Pass API points to the map; falls back to jitter mode if null */}
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
