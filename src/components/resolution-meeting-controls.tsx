"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";
import { addResolutionToMeeting } from "@/lib/actions/resolutions";
import { Button } from "@/components/ui/button";

export type MeetingOption = { id: string; label: string };

// Panel dodania uchwały (typu „na spotkaniu") do porządku obrad wybranego
// nadchodzącego spotkania. Widoczny dla zarządzających, gdy uchwała nie jest
// jeszcze przypisana do żadnego spotkania.
export function AddResolutionToMeeting({
  resolutionId,
  meetings,
}: {
  resolutionId: string;
  meetings: MeetingOption[];
}) {
  const router = useRouter();
  const [meetingId, setMeetingId] = useState(meetings[0]?.id ?? "");
  const [pending, start] = useTransition();

  if (meetings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Brak nadchodzących spotkań. Zaplanuj spotkanie, aby dodać do niego tę
        uchwałę do głosowania.
      </p>
    );
  }

  function add() {
    start(async () => {
      try {
        await addResolutionToMeeting(resolutionId, meetingId);
        router.refresh();
        toast.success("Dodano uchwałę do spotkania.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się dodać.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={meetingId}
        onChange={(e) => setMeetingId(e.target.value)}
        aria-label="Wybierz spotkanie"
        className="h-9 min-w-56 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {meetings.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <Button type="button" onClick={add} disabled={pending || !meetingId}>
        <CalendarPlus className="size-4" />
        {pending ? "Dodawanie…" : "Dodaj do spotkania"}
      </Button>
    </div>
  );
}
