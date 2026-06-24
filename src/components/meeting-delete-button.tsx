"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteMeeting } from "@/lib/actions/meetings";
import { Button } from "@/components/ui/button";

export function MeetingDeleteButton({
  meetingId,
  title,
}: {
  meetingId: string;
  title: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function remove() {
    if (!confirm(`Usunąć spotkanie „${title}”?`)) return;
    start(async () => {
      try {
        await deleteMeeting(meetingId);
        router.refresh();
        toast.success("Usunięto spotkanie.");
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
      aria-label={`Usuń spotkanie ${title}`}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}
