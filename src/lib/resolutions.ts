// Domena uchwał: etykiety/kolory statusów + zliczanie głosów.
import type { ResolutionStatus, VoteChoice } from "@/generated/prisma/client";

export const RESOLUTION_STATUS_LABELS: Record<ResolutionStatus, string> = {
  DRAFT: "Szkic",
  VOTING: "W głosowaniu",
  PASSED: "Przyjęta",
  REJECTED: "Odrzucona",
};

// Klasy Tailwind dla znacznika statusu (kolory zgodne z szablonem).
export const RESOLUTION_STATUS_BADGE: Record<ResolutionStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
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

// Wynik głosowania: przyjęta, gdy „za" przeważa nad „przeciw" (remis = odrzucona).
export function voteOutcome(tally: VoteTally): "PASSED" | "REJECTED" {
  return tally.FOR > tally.AGAINST ? "PASSED" : "REJECTED";
}

// Skrót tekstowy wyniku, np. „24 za · 3 przeciw · 1 wstrz.".
export function voteSummary(tally: VoteTally): string {
  return `${tally.FOR} za · ${tally.AGAINST} przeciw · ${tally.ABSTAIN} wstrz.`;
}
