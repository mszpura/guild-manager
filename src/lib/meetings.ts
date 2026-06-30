// Domena spotkań: etykiety typów + reguła „kto widzi spotkanie wśród nadchodzących”.
// Tylko importy typów z wygenerowanego klienta — bezpieczne też w komponentach klienta.
import type { Prisma, MeetingType } from "@/generated/prisma/client";

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  GENERAL_ASSEMBLY: "Walne zebranie",
  BOARD_MEETING: "Posiedzenie zarządu",
};

export const MEETING_TYPES: MeetingType[] = [
  "GENERAL_ASSEMBLY",
  "BOARD_MEETING",
];

// Próg kworum: odsetek obecnych uprawnionych wymagany do ważnego głosowania.
export const QUORUM_THRESHOLD = 50;

// Czy kworum jest spełnione przy danej obecności.
export function hasQuorum(presentCount: number, eligibleTotal: number): boolean {
  if (eligibleTotal === 0) return false;
  return (presentCount / eligibleTotal) * 100 >= QUORUM_THRESHOLD;
}

// Filtr Prisma: spotkania, w których członek o danej roli może wziąć udział.
// Pusta lista ról = spotkanie otwarte dla wszystkich członków.
export function attendableWhere(roleId: string): Prisma.MeetingWhereInput {
  return {
    OR: [{ allowedRoles: { none: {} } }, { allowedRoles: { some: { roleId } } }],
  };
}

// Formatuje datę do wartości input[type=datetime-local] („RRRR-MM-DDTHH:mm”),
// w czasie lokalnym serwera (spójnym z parsowaniem przy zapisie).
export function toDateTimeLocalValue(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
    `T${p(date.getHours())}:${p(date.getMinutes())}`
  );
}

// Skrócone i pełne nazwy miesięcy (PL) — używane na „kafelku daty" i w nagłówku.
export const MONTHS_SHORT = [
  "STY", "LUT", "MAR", "KWI", "MAJ", "CZE",
  "LIP", "SIE", "WRZ", "PAŹ", "LIS", "GRU",
];
export const MONTHS_LONG = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
];

// Krótka forma nazwiska organizatora („Jan Kowalski" → „J. Kowalski").
// Gdy brak nazwiska — samo imię; gdy brak organizatora — null.
export function organizerLabel(
  person: { firstName: string; lastName: string | null } | null,
): string | null {
  if (!person) return null;
  const initial = person.firstName.trim().charAt(0);
  return person.lastName
    ? `${initial}. ${person.lastName}`
    : person.firstName;
}

// Względny opis terminu spotkania (np. „dziś”, „jutro”, „za 5 dni”).
export function relativeDays(startsAt: Date, now: Date): string {
  const startDay = new Date(
    startsAt.getFullYear(),
    startsAt.getMonth(),
    startsAt.getDate(),
  );
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((startDay.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return days === -1 ? "wczoraj" : `${-days} dni temu`;
  if (days === 0) return "dziś";
  if (days === 1) return "jutro";
  return `za ${days} dni`;
}
