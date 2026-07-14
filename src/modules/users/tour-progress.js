const TOUR_IDS = new Set(['dashboard', 'websiteBuilder']);

// Merge a single tour's progress update into the user's tours JSON without
// disturbing the other tour. Pure — no I/O.
export function mergeTourProgress(prev, tourId, update) {
  if (!TOUR_IDS.has(tourId)) throw new Error(`Unknown tour: ${tourId}`);
  const base = prev && typeof prev === 'object' ? prev : {};
  const current = base[tourId] && typeof base[tourId] === 'object' ? base[tourId] : {};

  const merged = { ...current };
  if (Array.isArray(update.completedChapters)) {
    const combined = new Set([
      ...(Array.isArray(current.completedChapters) ? current.completedChapters : []),
      ...update.completedChapters,
    ]);
    merged.completedChapters = [...combined].sort((a, b) => a - b);
  }
  if (typeof update.done === 'boolean') merged.done = update.done;

  return { ...base, [tourId]: merged };
}
