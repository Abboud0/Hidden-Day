// favorites manager backed by localStorage

import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "hidden-day:favorites:v1";

// unique key for any item (stable across sessions)
export type FavKey = string;

export function makeFavKey(provider: string, id: string): FavKey {
    return `${provider}:${id}`;
}

export function useFavorites() {
    const [setStateGuard, setSetStateGuard] = useState(0); // bumps to trigger rerender after external storage changes

    // read favorites once on mount
    const initial = useMemo<Set<FavKey>>(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return new Set();
            const arr = JSON.parse(raw) as string[];
            return new Set(arr);
        } catch {
            return new Set();
        }
    }, []);

    const [favorites, setFavorites] = useState<Set<FavKey>>(initial);

    // persist whenever the set changes
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(favorites)));
        } catch {
            // ignore errors
        }
    }, [favorites]);

    // react to storage events from other tabs
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY) {
                setFavorites(() => {
                    try {
                        const raw = localStorage.getItem(STORAGE_KEY);
                        if (!raw) return new Set();
                        const arr = JSON.parse(raw) as string[];
                        return new Set(arr);
                    } catch {
                        return new Set();
                    }
                });
                setSetStateGuard((n) => n + 1);
            }
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    const isFavorite = (key: FavKey) => favorites.has(key);

    const toggleFavorite = (key: FavKey) => {
        setFavorites((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    return { favorites, isFavorite, toggleFavorite, _r: setStateGuard };
}