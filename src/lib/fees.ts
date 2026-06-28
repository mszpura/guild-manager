// Wspólne wyliczenia składek członkowskich — używane przez zakładkę Składki i pulpit,
// dzięki czemu liczby (saldo, opłacalność, zaległości) są wszędzie spójne.

import { currentFeeYear, recentFeeYears, isFeeOverdue } from "./payments";

export type FeeCycleStatus = "PAID" | "OVERDUE" | "PENDING" | "NA";

// Minimalny kształt członka potrzebny do wyliczeń (pasuje do select-ów Prisma).
export type FeeMemberInput = {
  joinedAt: Date;
  paymentTier: { amount: number } | null;
  membershipFees: { year: number; amount: number | null }[];
};

export type MemberFeeResult<T> = {
  member: T;
  cycles: { year: number; status: FeeCycleStatus }[];
  feeAmount: number | null; // roczna składka z przypisanego progu
  saldo: number | null; // ≤ 0; null gdy brak przypisanej składki
  currentStatus: "PAID" | "OVERDUE" | "PENDING"; // status bieżącego roku
};

export type FeeSummary<T> = {
  year: number;
  years: number[];
  results: MemberFeeResult<T>[];
  collected: number; // zebrano w bieżącym roku (grosze)
  charged: number; // naliczono w bieżącym roku (grosze)
  arrears: number; // suma zaległości (grosze)
  debtorCount: number; // liczba członków z zaległościami
  rate: number; // opłacalność (%)
};

export function summarizeFees<T extends FeeMemberInput>(
  members: T[],
  config: {
    feeDueMonth: number | null | undefined;
    feeDueDay: number | null | undefined;
    // Rok założenia stowarzyszenia — najwcześniejszy okres składkowy. Gdy ustawiony,
    // składki naliczamy od niego (a nie od roku wstąpienia członka), bo daty
    // wstąpienia importowanych członków bywają tożsame z dniem dodania do systemu.
    foundedYear?: number | null;
    now: Date;
  },
): FeeSummary<T> {
  const { feeDueMonth, feeDueDay, foundedYear, now } = config;
  const year = currentFeeYear(now);
  const years = recentFeeYears(now, 5);
  const isOverdueYear = (y: number) => isFeeOverdue(feeDueMonth, feeDueDay, y, now);

  const results: MemberFeeResult<T>[] = members.map((m) => {
    const paidByYear = new Map(m.membershipFees.map((f) => [f.year, f.amount]));
    const joinYear = m.joinedAt.getFullYear();
    // Najwcześniejszy okres, którego dotyczy składka: rok założenia (gdy znany),
    // inaczej rok wstąpienia członka.
    const startYear = foundedYear ?? joinYear;
    const feeAmount = m.paymentTier?.amount ?? null;

    const cycles = years.map((y) => {
      let status: FeeCycleStatus;
      if (y < startYear) status = "NA";
      else if (paidByYear.has(y)) status = "PAID";
      else if (isOverdueYear(y)) status = "OVERDUE";
      else status = "PENDING";
      return { year: y, status };
    });

    const last = cycles[cycles.length - 1].status;
    const currentStatus = last === "NA" ? "PENDING" : last;

    // Saldo i statystyki dotyczą wyłącznie bieżącego roku. Starszych okresów nie
    // wliczamy — mogły mieć inną składkę (nie znamy należnej kwoty bez rozliczenia),
    // więc rozlicza się je ręcznie z poziomu formularza.
    const saldo =
      feeAmount == null ? null : currentStatus === "PAID" ? 0 : -feeAmount;

    return { member: m, cycles, feeAmount, saldo, currentStatus };
  });

  const collected = members.reduce((sum, m) => {
    const fee = m.membershipFees.find((f) => f.year === year);
    return fee ? sum + (fee.amount ?? m.paymentTier?.amount ?? 0) : sum;
  }, 0);
  const charged = members.reduce(
    (sum, m) =>
      m.paymentTier != null && year >= m.joinedAt.getFullYear()
        ? sum + m.paymentTier.amount
        : sum,
    0,
  );
  const arrears = results.reduce(
    (sum, r) => (r.saldo != null && r.saldo < 0 ? sum - r.saldo : sum),
    0,
  );
  const debtorCount = results.filter((r) => r.saldo != null && r.saldo < 0).length;

  const paidCount = results.filter((r) => r.currentStatus === "PAID").length;
  const rate =
    charged > 0
      ? Math.round((collected / charged) * 100)
      : members.length > 0
        ? Math.round((paidCount / members.length) * 100)
        : 0;

  return { year, years, results, collected, charged, arrears, debtorCount, rate };
}
