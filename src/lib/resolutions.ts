// Domena uchwał: etykiety/kolory statusów + zliczanie głosów.
import type {
  ResolutionStatus,
  SignatureRole,
  VoteChoice,
} from "@/generated/prisma/client";

// Etykiety tytułów podpisu pod uchwałą.
export const SIGNATURE_ROLE_LABELS: Record<SignatureRole, string> = {
  CHAIRPERSON: "Przewodniczący zebrania",
  SECRETARY: "Protokolant",
};

// Kolejność wyświetlania tytułów (przyciski, podpisy na dokumencie).
export const SIGNATURE_ROLE_ORDER: SignatureRole[] = ["CHAIRPERSON", "SECRETARY"];

export const RESOLUTION_STATUS_LABELS: Record<ResolutionStatus, string> = {
  DRAFT: "Szkic",
  AWAITING_MEETING: "Oczekuje na spotkanie",
  VOTING: "W głosowaniu",
  PASSED: "Przyjęta",
  REJECTED: "Odrzucona",
};

// Klasy Tailwind dla znacznika statusu (kolory zgodne z szablonem).
export const RESOLUTION_STATUS_BADGE: Record<ResolutionStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  AWAITING_MEETING: "bg-sky-50 text-sky-700",
  VOTING: "bg-amber-50 text-amber-700",
  PASSED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-destructive/10 text-destructive",
};

export type VoteTally = { FOR: number; AGAINST: number; ABSTAIN: number };

export function tallyVotes(votes: { choice: VoteChoice }[]): VoteTally {
  return {
    FOR: votes.filter((v) => v.choice === "FOR").length,
    AGAINST: votes.filter((v) => v.choice === "AGAINST").length,
    ABSTAIN: votes.filter((v) => v.choice === "ABSTAIN").length,
  };
}

// Wynik głosowania względem progu typu uchwały. Próg to procent głosów „za"
// liczony od liczby UPRAWNIONYCH do głosowania (spójnie z paskiem frekwencji —
// np. 75% oznacza „za" u co najmniej 75% uprawnionych, nie tylko oddanych głosów).
// Bez typu/progu stosujemy zwykłą większość oddanych głosów (remis = odrzucona).
export function voteOutcome(
  tally: VoteTally,
  threshold: number | null | undefined,
  eligibleCount: number,
): "PASSED" | "REJECTED" {
  if (threshold == null) {
    return tally.FOR > tally.AGAINST ? "PASSED" : "REJECTED";
  }
  const cast = tally.FOR + tally.AGAINST + tally.ABSTAIN;
  // Mianownik jak na pasku wyniku: liczba uprawnionych (a gdyby oddano więcej
  // głosów niż uprawnionych — liczba oddanych, jako zabezpieczenie).
  const base = Math.max(eligibleCount, cast);
  if (base === 0) return "REJECTED";
  // Porównanie na liczbach całkowitych (bez błędów zaokrąglenia ułamków).
  return tally.FOR * 100 >= threshold * base ? "PASSED" : "REJECTED";
}

// Skrót tekstowy wyniku, np. „24 za · 3 przeciw · 1 wstrz.".
export function voteSummary(tally: VoteTally): string {
  return `${tally.FOR} za · ${tally.AGAINST} przeciw · ${tally.ABSTAIN} wstrz.`;
}
