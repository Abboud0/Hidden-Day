// simple mock planner API (Next.js route handler)
// future: replace internals with calls to FastAPI / real APIs

export async function POST(req: Request) {
    const body = await req.json();
    const { date, budget, interests, location } = body as {
        date: string; budget: string; interests: string; location: string;
    };

    // geocode location with OSM nominatim
    const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`,
        { headers: { "User-Agent": "HiddenDay/0.1 (demo)" } }   
    );
    const geo = await geoRes.json();

    if (!geo.length) {
        return new Response(JSON.stringify({ error: "Location not found" }), { status: 400 });
    }

    const lat = parseFloat(geo[0].lat);
    const lon = parseFloat(geo[0].lon);

    // mock activities with jittered coords near center (+- 1 km)
    const base = [lat, lon] as [number, number];
    const activities = [
    "☕ Morning coffee at a local cafe",
    "🏞️ Visit a park nearby",
    "🍝 Lunch at a cozy restaurant",
    "🖼️ Explore a local museum or art gallery",
    ].map((title) => {
        const latOffset = (Math.random() - 0.5) * 0.02;
        const lonOffset = (Math.random() - 0.5) * 0.02;
        return {
            title,
            lat: base[0] + latOffset,
            lon: base[1] + lonOffset,
        };
    });
    
    return Response.json({
        date, budget, interests, location,
        center: { lat, lon },
        items: activities,
    });
}