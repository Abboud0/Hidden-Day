"use client";

// small skeletons with shimmer effect
export function LineSkeleton({ w = "w-full" }: { w?: string }) {
    return <div className={`h-3 ${w} rounded bg-gray-200 animate-pulse`} />;
}

export function BlockSkeleton({ h = 160 }: { h?: number }) {
    return (
        <div
            className="w-full rounded-xl bg-gray-200 animate-pulse"
            style={{ height: `${h}px` }}
            aria-hidden
        />
    );
}