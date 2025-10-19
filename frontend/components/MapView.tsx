"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useState } from "react";

const defaultIcon = L.icon ({
    iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
    iconAnchor: [12, 41]
});

interface MapViewProps {
    location: string;
    plan: string[];
}

export default function MapView ({ location, plan }: MapViewProps) {
    const [coords, setCoords] = useState<[number, number] | null>(null);

    // fetch coordinates for the user's location using OpenStreetMap
    useEffect(() => {
        if (!location) return;

        fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
                location
            )}`
        )
            .then((res) => res.json())
            .then((data) => {
                if (data && data.length > 0) {
                    setCoords([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
                }
            });
    }, [location]);

    if (!coords) {
        return (
            <p className="text-center text-gray-600 mt-4">
                🗺️ Generating map for "{location}"...
            </p>
        );
    }

    return (
        <div className="mt-6 w-full max-w-2xl mx-auto rounded-xl overflow-hidden shadow-lg">
            <MapContainer
               center={coords}
               zoom={13}
               style={{ height: "400px", width: "100%" }} 
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {plan.map((item, i) => (
                    <Marker key={i} position={coords} icon={defaultIcon}>
                        <Popup>{item}</Popup>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
}