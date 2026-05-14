export type Entry = {
  id: string;
  country: string;
  countryCode: string;
  artist: string;
  songTitle: string;
  flagUrl: string;
};

export type Criterion = {
  id: string;
  label: string;
};

export type CountryOption = {
  name: {
    common: string;
  };
  cca2: string;
};

export type Ratings = Record<string, Record<string, number>>;

export type SavedRanking = {
  displayName: string;
  ratings: Ratings;
};

export type PublicConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  configError: string;
};

export const storageKey = "eurovision-ranking-game";

export const criteria: Criterion[] = [
  { id: "vocalsSoundCatchiness", label: "Vocals / Sound / Catchiness" },
  { id: "stagingCostumesProps", label: "Staging / Costumes / Props" },
  { id: "choreographyPerformancePresence", label: "Choreography / Performance / Stage Presence" },
  { id: "wowEnergyImpact", label: "Wow factor / Energy / Impact" },
];

export const scoreOptions = Array.from({ length: 21 }, (_, index) => index * 0.5);

export function getInitialRanking(): SavedRanking {
  if (typeof window === "undefined") {
    return { displayName: "", ratings: {} };
  }

  const cached = localStorage.getItem(storageKey);

  if (!cached) {
    return { displayName: "", ratings: {} };
  }

  try {
    const parsed = JSON.parse(cached) as Partial<SavedRanking>;

    return {
      displayName: parsed.displayName ?? "",
      ratings: parsed.ratings ?? {},
    };
  } catch {
    return { displayName: "", ratings: {} };
  }
}

export function getEntryTotal(entry: Entry, ratings: Ratings) {
  return criteria.reduce((total, criterion) => total + (ratings[entry.id]?.[criterion.id] ?? 0), 0);
}

export function isEntryComplete(entryId: string, ratings: Ratings) {
  return criteria.every((criterion) => typeof ratings[entryId]?.[criterion.id] === "number");
}

export function getFlagUrl(countryCode: string) {
  return `https://flagcdn.com/${countryCode.toLowerCase()}.svg`;
}
