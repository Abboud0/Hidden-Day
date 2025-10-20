"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";

// Load react-leaflet only on the client (prevents `window is not defined`)
const MapContainer = dynamic(() => import("react-leaflet").then(m => m.MapContainer), { ssr: false });
const TileLayer    = dynamic(() => import("react-leaflet").then(m => m.TileLayer),    { ssr: false });
const Marker       = dynamic(() => import("react-leaflet").then(m => m.Marker),       { ssr: false });
const Popup        = dynamic(() => import("react-leaflet").then(m => m.Popup),        { ssr: false });

type Point = { lat: number; lon: number; title: string };

interface MapViewProps {
  location: string;
  plan: string[];
  /** Optional: points from your /api/plan (uses these coords if provided) */
  points?: Point[];
}

export default function MapView({ location, plan, points }: MapViewProps) {
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [markers, setMarkers] = useState<[number, number][]>([]);

  // Create Leaflet icon on the client only
  const defaultIcon = useMemo(() => {
    if (typeof window === "undefined") return undefined as any;
    const L = require("leaflet"); // lazy require avoids SSR issues
    return L.icon({
      iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
      iconAnchor: [12, 41],
    });
  }, []);

  // Get base lat/lon for the entered location, then choose markers
  useEffect(() => {
    if (!location) return;

    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`,
      { headers: { "User-Agent": "HiddenDay/0.1 (demo)" } }
    )
      .then(r => r.json())
      .then(data => {
        if (!data?.length) return;
        const base: [number, number] = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
        setCenter(base);

        if (points && points.length) {
          setMarkers(points.map(p => [p.lat, p.lon] as [number, number]));
        } else {
          // fallback: slight random spread so the map looks alive
          const jittered = plan.map(() => {
            const latOffset = (Math.random() - 0.5) * 0.02; // ~±1km
            const lonOffset = (Math.random() - 0.5) * 0.02;
            return [base[0] + latOffset, base[1] + lonOffset] as [number, number];
          });
          setMarkers(jittered);
        }
      });
  }, [location, plan, points]);

  if (!center) return <p className="text-center text-gray-600 mt-4">🗺️ Generating map for “{location}”...</p>;

  return (
    <div className="mt-6 w-full max-w-2xl mx-auto rounded-xl overflow-hidden shadow-lg">
      {typeof window !== "undefined" && (
        <MapContainer center={center} zoom={13} style={{ height: "400px", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {markers.map((pos, i) => (
            <Marker key={i} position={pos} {...(defaultIcon ? { icon: defaultIcon } : {})}>
              <Popup>{points ? points[i]?.title : plan[i]}</Popup>
            </Marker>
          ))}
        </MapContainer>
      )}
    </div>
  );
}
