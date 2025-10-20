"use client";
import React, { useState } from "react";
import MapView from "./MapView";
import { it } from "node:test";

export default function UserForm() {
    const [formData, setFormData] = useState({
        date: "",
        budget: "",
        interests: "",
        location: "",
    });

    const [plan, setPlan] = useState<string[]>([]);

    function handleChange(
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        const res = await fetch("/api/plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData),
        });

        const data = await res.json();
        if (!res.ok) {
            alert(data.error ?? "Failed to generate plan.");
            return;
        }

        // display list + pass titles to UI list
        setPlan(data.items.map((it: any) => it.title + ` (${formData.location})`));
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
                    className="bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition"
                >
                    Generate Plan
                </button>
            </form>

            {/* show generated plan */}
            {plan.length > 0 && (
                <>
                    <div className="mt-6 bg-white p-4 rounded-xl shadow-md">
                        <h3 className="text-lg font-bold mb-2 text-center text-gray-700">
                            Your Hidden Day Plan ✨
                        </h3>
                        <ul className="list-disc pl-5 text-gray-700 mb-4">
                            {plan.map((item, i) => (
                                <li key={i}>{item}</li>
                            ))}
                        </ul>
                    </div>
                    <MapView location={formData.location} plan={plan} />
                </>
            )}
        </div>
    );
}
