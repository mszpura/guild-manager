"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, RotateCcw } from "lucide-react";
import {
  decideAgendaItem,
  setAttendance,
  endMeeting,
  reopenMeeting,
} from "@/lib/actions/meetings";
import { Button } from "@/components/ui/button";

type AgendaStatus = "PENDING" | "APPROVED" | "REJECTED";

// Akcje decyzyjne dla punktu porządku obrad (tylko dla zarządzających).
export function AgendaDecideControls({
  itemId,
  status,
  ended,
}: {
  itemId: string;
  status: AgendaStatus;
  ended: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function decide(next: AgendaStatus, msg: string) {
    start(async () => {
      try {
        await decideAgendaItem(itemId, next);
        router.refresh();
        toast.success(msg);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać.");
      }
    });
  }

  if (status === "PENDING") {
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => decide("APPROVED", "Punkt zatwierdzony przez zebranie.")}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          <Check className="size-4" />
          Zatwierdź punkt
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => decide("REJECTED", "Punkt odrzucony przez zebranie.")}
          className="border-destructive/30 text-destructive hover:bg-destructive/10"
        >
          <X className="size-4" />
          Odrzuć
        </Button>
      </div>
    );
  }

  // Decyzja zapadła — komunikat pokazujemy jako toast (zob. decide()).
  // Po zakończeniu spotkania nie wolno cofać zatwierdzenia punktu.
  if (ended && status === "APPROVED") return null;

  // W pozostałych przypadkach zostaje możliwość cofnięcia; status widać na znaczniku.
  return (
    <div className="mt-4">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => decide("PENDING", "Cofnięto decyzję.")}
        className="h-7 gap-1 px-2 text-xs text-muted-foreground"
      >
        <RotateCcw className="size-3.5" />
        Cofnij decyzję
      </Button>
    </div>
  );
}

// Przełącznik obecności członka (tylko dla zarządzających).
export function AttendanceToggle({
  meetingId,
  memberId,
  present,
}: {
  meetingId: string;
  memberId: string;
  present: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      try {
        await setAttendance(meetingId, memberId, !present);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
        present
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-border bg-muted text-muted-foreground hover:border-input hover:text-foreground"
      }`}
    >
      {present ? <Check className="size-3.5" /> : null}
      {present ? "Obecny" : "Nieobecny"}
    </button>
  );
}

// Zakończenie / wznowienie spotkania (tylko dla zarządzających).
// Wznowić zakończone spotkanie może wyłącznie rola Prezes (canReopen).
export function EndMeetingButton({
  meetingId,
  ended,
  canReopen,
}: {
  meetingId: string;
  ended: boolean;
  canReopen: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      try {
        if (ended) {
          await reopenMeeting(meetingId);
          toast.success("Wznowiono spotkanie.");
        } else {
          await endMeeting(meetingId);
          toast.success("Zakończono spotkanie.");
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać.");
      }
    });
  }

  // Zakończone spotkanie może wznowić tylko Prezes — innym nie pokazujemy przycisku.
  if (ended) {
    return canReopen ? (
      <Button type="button" variant="outline" disabled={pending} onClick={run}>
        <RotateCcw className="size-4" />
        Wznów spotkanie
      </Button>
    ) : null;
  }

  return (
    <Button
      type="button"
      disabled={pending}
      onClick={run}
      className="bg-brand text-brand-foreground hover:bg-brand/90"
    >
      Zakończ spotkanie
    </Button>
  );
}
