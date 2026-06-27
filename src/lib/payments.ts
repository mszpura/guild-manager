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

// Bieżący okres składkowy. Gdy ustawiono dzień rozliczeniowy (feeDueMonth/feeDueDay),
// okres to 12-miesięczne okno KOŃCZĄCE się w tym dniu — czyli dzień ten jest zarazem
// terminem płatności i granicą, na której okres się „przewija". Rok okresu = rok
// najbliższego nadchodzącego terminu (klucz w MembershipFee.year). Bez ustawionego dnia
// stosujemy zwykły rok kalendarzowy.
export type FeePeriod = {
  year: number; // rok terminu/zakończenia — klucz okresu
  startsAt: Date;
  endsAt: Date;
  label: string; // np. „1 lipca 2025 – 30 czerwca 2026"
};

const periodDateFmt = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

// Buduje okres o danym kluczu (roku terminu/zakończenia).
function feePeriodForYear(
  month: number | null | undefined,
  day: number | null | undefined,
  year: number,
): FeePeriod {
  if (month == null || day == null || !isValidFeeDueDate(month, day)) {
    return {
      year,
      startsAt: new Date(year, 0, 1),
      endsAt: new Date(year, 11, 31, 23, 59, 59, 999),
      label: String(year),
    };
  }
  const endsAt = new Date(year, month - 1, day, 23, 59, 59, 999);
  // Początek = dzień po poprzednim terminie (rok wcześniej).
  const startsAt = new Date(year - 1, month - 1, day + 1);
  return {
    year,
    startsAt,
    endsAt,
    label: `${periodDateFmt.format(startsAt)} – ${periodDateFmt.format(endsAt)}`,
  };
}

export function currentFeePeriod(
  month: number | null | undefined,
  day: number | null | undefined,
  now: Date,
): FeePeriod {
  const y = now.getFullYear();
  if (month == null || day == null || !isValidFeeDueDate(month, day)) {
    return feePeriodForYear(month, day, y);
  }
  // Termin (koniec okresu) w bieżącym roku; jeśli już minął, okres kończy się rok później.
  const thisYearDue = new Date(y, month - 1, day, 23, 59, 59, 999);
  const endYear = now.getTime() > thisYearDue.getTime() ? y + 1 : y;
  return feePeriodForYear(month, day, endYear);
}

// Ostatnie `count` okresów składkowych — od najstarszego do bieżącego (kolejność do
// wyświetlenia siatki cykli, jak w szablonie: '24 '25 '26).
export function recentFeePeriods(
  month: number | null | undefined,
  day: number | null | undefined,
  now: Date,
  count = 3,
): FeePeriod[] {
  const current = currentFeePeriod(month, day, now);
  const periods: FeePeriod[] = [];
  for (let i = count - 1; i >= 0; i--) {
    periods.push(feePeriodForYear(month, day, current.year - i));
  }
  return periods;
}
