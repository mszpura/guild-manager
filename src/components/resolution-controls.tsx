"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Vote, CheckCheck, RotateCcw } from "lucide-react";
import {
  castResolutionVote,
  openResolutionVoting,
  closeResolutionVoting,
  reopenResolutionDraft,
  deleteResolution,
} from "@/lib/actions/resolutions";
import { Button } from "@/components/ui/button";

type Choice = "FOR" | "AGAINST" | "ABSTAIN";
type Status = "DRAFT" | "VOTING" | "PASSED" | "REJECTED";

const VOTE_BOXES: {
  choice: Choice;
  label: string;
  active: string;
  idle: string;
  text: string;
}[] = [
  {
    choice: "FOR",
    label: "ZA",
    active: "border-emerald-400 bg-emerald-100",
    idle: "border-emerald-100 bg-emerald-50",
    text: "text-emerald-700",
  },
  {
    choice: "AGAINST",
    label: "PRZECIW",
    active: "border-red-400 bg-red-100",
    idle: "border-red-100 bg-red-50",
    text: "text-destructive",
  },
  {
    choice: "ABSTAIN",
    label: "WSTRZYM.",
    active: "border-slate-400 bg-slate-100",
    idle: "border-border bg-muted",
    text: "text-slate-600",
  },
];

// Panel głosowania nad uchwałą (kafelki klikalne, gdy głosowanie otwarte).
export function ResolutionVoteButtons({
  resolutionId,
  tally,
  myChoice,
  canVote,
  eligibleCount,
}: {
  resolutionId: string;
  tally: { FOR: number; AGAINST: number; ABSTAIN: number };
  myChoice: Choice | null;
  canVote: boolean;
  // Liczba uprawnionych do głosowania (członkowie z dostępem WRITE do Uchwał).
  eligibleCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function vote(choice: Choice) {
    start(async () => {
      try {
        await castResolutionVote(resolutionId, choice);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się oddać głosu.");
      }
    });
  }

  // Pasek frekwencji: ZA (zielony) / PRZECIW (czerwony) / WSTRZYM. (slate) oraz
  // pozostała część toru w kolorze szarym = osoby, które jeszcze nie głosowały.
  const voted = tally.FOR + tally.AGAINST + tally.ABSTAIN;
  const notVoted = Math.max(0, eligibleCount - voted);
  // Zabezpieczenie, gdyby liczba oddanych głosów przekroczyła liczbę uprawnionych.
  const barTotal = Math.max(eligibleCount, voted);
  const pct = (n: number) => (barTotal > 0 ? (n / barTotal) * 100 : 0);

  return (
    <div>
      {barTotal > 0 ? (
        <div className="mb-3 space-y-1.5">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            {tally.FOR > 0 ? (
              <div
                className="bg-emerald-500"
                style={{ width: `${pct(tally.FOR)}%` }}
                title={`Za: ${tally.FOR}`}
              />
            ) : null}
            {tally.AGAINST > 0 ? (
              <div
                className="bg-red-500"
                style={{ width: `${pct(tally.AGAINST)}%` }}
                title={`Przeciw: ${tally.AGAINST}`}
              />
            ) : null}
            {tally.ABSTAIN > 0 ? (
              <div
                className="bg-slate-400"
                style={{ width: `${pct(tally.ABSTAIN)}%` }}
                title={`Wstrzymujące się: ${tally.ABSTAIN}`}
              />
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {notVoted > 0
              ? `Jeszcze nie zagłosowało: ${notVoted} z ${eligibleCount}`
              : `Wszyscy uprawnieni oddali głos (${eligibleCount}).`}
          </p>
        </div>
      ) : null}

      <div className="flex gap-2">
        {VOTE_BOXES.map((b) => {
          const active = myChoice === b.choice;
          const content = (
            <>
              <div className={`font-heading text-xl font-extrabold leading-none ${b.text}`}>
                {tally[b.choice]}
              </div>
              <div className="mt-1 text-[10px] font-semibold tracking-wide text-muted-foreground">
                {b.label}
              </div>
            </>
          );
          return canVote ? (
            <button
              key={b.choice}
              type="button"
              onClick={() => vote(b.choice)}
              disabled={pending}
              aria-pressed={active}
              className={`flex-1 rounded-lg border py-3 text-center transition-colors disabled:opacity-60 ${
                active ? b.active : `${b.idle} hover:border-foreground/20`
              }`}
            >
              {content}
            </button>
          ) : (
            <div
              key={b.choice}
              className={`flex-1 rounded-lg border py-3 text-center ${b.idle}`}
            >
              {content}
            </div>
          );
        })}
      </div>
      {canVote ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Kliknij, aby oddać głos
          {myChoice ? " (ponowny wybór wycofuje głos)" : ""}.
        </p>
      ) : null}
    </div>
  );
}

// Akcje zmiany stanu uchwały (dla zarządzających).
export function ResolutionStatusControls({
  resolutionId,
  status,
}: {
  resolutionId: string;
  status: Status;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run(fn: () => Promise<void>, msg: string) {
    start(async () => {
      try {
        await fn();
        router.refresh();
        toast.success(msg);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać.");
      }
    });
  }

  if (status === "DRAFT") {
    return (
      <Button
        type="button"
        disabled={pending}
        onClick={() => run(() => openResolutionVoting(resolutionId), "Otwarto głosowanie.")}
      >
        <Vote className="size-4" />
        Otwórz głosowanie
      </Button>
    );
  }

  if (status === "VOTING") {
    return (
      <>
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() => closeResolutionVoting(resolutionId), "Zamknięto głosowanie.")
          }
          className="bg-brand text-brand-foreground hover:bg-brand/90"
        >
          <CheckCheck className="size-4" />
          Zamknij głosowanie
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(() => reopenResolutionDraft(resolutionId), "Cofnięto do szkicu.")
          }
        >
          <RotateCcw className="size-4" />
          Cofnij do szkicu
        </Button>
      </>
    );
  }

  // PASSED / REJECTED — można przywrócić do szkicu (czyści głosy).
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() =>
        run(() => reopenResolutionDraft(resolutionId), "Cofnięto do szkicu.")
      }
    >
      <RotateCcw className="size-4" />
      Cofnij do szkicu
    </Button>
  );
}

export function ResolutionDeleteButton({
  resolutionId,
  label,
}: {
  resolutionId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function remove() {
    if (!confirm(`Usunąć uchwałę „${label}"?`)) return;
    start(async () => {
      try {
        await deleteResolution(resolutionId);
        toast.success("Usunięto uchwałę.");
        router.push("/resolutions");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się usunąć.");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={remove}
      disabled={pending}
      aria-label="Usuń uchwałę"
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
