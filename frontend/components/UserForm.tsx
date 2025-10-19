"use client";
import React, { useState } from "react";

export default function UserForm() {
    const [formData, setFormData] = useState ({
        date: "",
        budget: "",
        interests: "",
        location: "",
    });

    function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        alert(`📅 Date: ${formData.date}\n💰 Budget: ${formData.budget}\n❤️ Interests: ${formData.interests}\n📍 Location: ${formData.location}`);
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="lex flex-col gap-4 bg-white p-6 rounded-2xl shadow-lg w-full max-w-md mx-auto mt-8"
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
    );
}
