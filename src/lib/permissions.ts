// Model uprawnień: obszary (jak menu boczne) × poziomy. Trzymane na roli jako JSON.

export const AREAS = [
  "MEMBERS",
  "APPLICATIONS",
  "MEETINGS",
  "RESOLUTIONS",
  "SETTINGS",
] as const;
export type Area = (typeof AREAS)[number];

export const LEVELS = ["NONE", "READ", "WRITE"] as const;
export type Level = (typeof LEVELS)[number];

export type Permissions = Record<Area, Level>;

export const AREA_LABELS: Record<Area, string> = {
  MEMBERS: "Członkowie",
  APPLICATIONS: "Zgłoszenia",
  MEETINGS: "Spotkania",
  RESOLUTIONS: "Uchwały",
  SETTINGS: "Ustawienia",
};

export const LEVEL_LABELS: Record<Level, string> = {
  NONE: "Brak",
  READ: "Odczyt",
  WRITE: "Odczyt i zapis",
};

const LEVEL_RANK: Record<Level, number> = { NONE: 0, READ: 1, WRITE: 2 };

// Domyślne zestawy uprawnień dla ról systemowych.
export const OWNER_PERMISSIONS: Permissions = Object.fromEntries(
  AREAS.map((a) => [a, "WRITE"]),
) as Permissions;

export const MEMBER_PERMISSIONS: Permissions = {
  MEMBERS: "READ",
  APPLICATIONS: "NONE",
  MEETINGS: "NONE",
  RESOLUTIONS: "NONE",
  SETTINGS: "NONE",
};

// Bezpiecznie odczytuje poziom dla obszaru z dowolnego JSON-a (domyślnie NONE).
export function getLevel(permissions: unknown, area: Area): Level {
  if (permissions && typeof permissions === "object") {
    const value = (permissions as Record<string, unknown>)[area];
    if (value === "READ" || value === "WRITE" || value === "NONE") return value;
  }
  return "NONE";
}

// Czy rola ma co najmniej wymagany poziom w danym obszarze.
// Rola właściciela ma zawsze pełnię praw.
export function can(
  role: { isOwner: boolean; permissions: unknown },
  area: Area,
  level: Level,
): boolean {
  if (role.isOwner) return true;
  return LEVEL_RANK[getLevel(role.permissions, area)] >= LEVEL_RANK[level];
}

// Buduje macierz uprawnień z pól formularza `perm_<AREA>` (nieznane → NONE).
export function parsePermissions(formData: FormData): Permissions {
  return Object.fromEntries(
    AREAS.map((area) => {
      const raw = String(formData.get(`perm_${area}`) ?? "NONE");
      const level: Level =
        raw === "READ" || raw === "WRITE" ? raw : "NONE";
      return [area, level];
    }),
  ) as Permissions;
}
