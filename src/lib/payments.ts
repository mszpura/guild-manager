// Domena składek członkowskich. Na razie obsługujemy wyłącznie składki roczne,
// więc termin opłacenia to powtarzalny co roku dzień + miesiąc (bez roku).

// Mianownik — do listy wyboru miesiąca.
export const MONTHS_NOM = [
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
  "Lipiec",
  "Sierpień",
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
] as const;

// Dopełniacz — do złożenia daty „31 stycznia".
const MONTHS_GEN = [
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
] as const;

// Maksymalna liczba dni w miesiącu. Luty = 29 (dopuszczamy termin 29 lutego).
export function daysInMonth(month: number): number {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

export function isValidFeeDueDate(month: number, day: number): boolean {
  return (
    Number.isInteger(month) &&
    month >= 1 &&
    month <= 12 &&
    Number.isInteger(day) &&
    day >= 1 &&
    day <= daysInMonth(month)
  );
}

// „31 stycznia" — czytelny termin roczny. null, gdy nieustawiony lub niepoprawny.
export function formatFeeDueDate(
  month: number | null | undefined,
  day: number | null | undefined,
): string | null {
  if (month == null || day == null) return null;
  if (!isValidFeeDueDate(month, day)) return null;
  return `${day} ${MONTHS_GEN[month - 1]}`;
}

// Status nieopłaconej składki: minął już tegoroczny termin opłacenia? Bez ustawionego
// terminu nie da się stwierdzić zaległości — wtedy false (składka „do zapłaty").
export function isFeeOverdue(
  month: number | null | undefined,
  day: number | null | undefined,
  year: number,
  now: Date,
): boolean {
  if (month == null || day == null) return false;
  if (!isValidFeeDueDate(month, day)) return false;
  const due = new Date(year, month - 1, day, 23, 59, 59, 999);
  return now.getTime() > due.getTime();
}
