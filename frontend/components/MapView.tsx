"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
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
  points?: Point[];
  center?: { lat: number; lon: number };
  loading?: boolean;
}

export default function MapView({ location, plan, points, center }: MapViewProps) {
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [markers, setMarkers] = useState<[number, number][]>([]);
  const [defaultIcon, setDefaultIcon] = useState<import("leaflet").Icon | null>(null);

  // Create Leaflet icon on the client only (no require, no any)
  useEffect(() => {
    let alive = true;
    if (typeof window === "undefined") return;
    (async () => {
      const L = await import("leaflet");
      const icon = L.icon({
        iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
        iconAnchor: [12, 41],
      });
      if (alive) setDefaultIcon(icon);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Prefer backend center; fallback to geocoding only if missing
  useEffect(() => {
    async function updateMap() {
      if (center) {
        // Use backend-supplied center first
        const base: [number, number] = [center.lat, center.lon];
        setMapCenter(base);
      } else if (location) {
        // Fallback: geocode location if backend center missing
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`,
            { headers: { "User-Agent": "HiddenDay/0.1 (demo)" } }
          );
          const data = (await r.json()) as Array<{ lat: string; lon: string }>;
          if (data?.length) {
            const base: [number, number] = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
            setMapCenter(base);
          }
        } catch {
          /* ignore geocode errors */
        }
      }

      // Always set markers when points change
      if (points && points.length) {
        setMarkers(points.map(p => [p.lat, p.lon] as [number, number]));
      } else if ((center || mapCenter) && plan.length) {
        // fallback jitter if no points
        const base = center
          ? [center.lat, center.lon]
          : mapCenter ?? [0, 0];
        const jittered = plan.map(() => {
          const latOffset = (Math.random() - 0.5) * 0.02; // ~±1km
          const lonOffset = (Math.random() - 0.5) * 0.02;
          return [base[0] + latOffset, base[1] + lonOffset] as [number, number];
        });
        setMarkers(jittered);
      }
    }

    updateMap();
  }, [center, location, plan, points]);

  if (!mapCenter)
    return (
      <p className="text-center text-gray-600 mt-4">
        🗺️ Generating map for “{location}”...
      </p>
    );

  return (
    <div className="mt-6 w-full max-w-2xl mx-auto rounded-xl overflow-hidden shadow-lg">
      {typeof window !== "undefined" && (
        <MapContainer center={mapCenter} zoom={13} style={{ height: "400px", width: "100%" }}>
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
