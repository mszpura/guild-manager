"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import {
  approveApplication,
  rejectApplication,
} from "@/lib/actions/applications";
import { Button } from "@/components/ui/button";

export function ApplicationActions({
  applicationId,
}: {
  applicationId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function approve() {
    startTransition(async () => {
      try {
        const res = await approveApplication(applicationId);
        router.refresh();
        toast.success(
          res?.emailed
            ? "Zatwierdzono. Wysłano e-mail powitalny."
            : "Zatwierdzono. (E-mail powitalny nie został wysłany — sprawdź konfigurację SMTP.)",
        );
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Nie udało się zatwierdzić.",
        );
      }
    });
  }

  function reject() {
    startTransition(async () => {
      try {
        await rejectApplication(applicationId);
        router.refresh();
        toast.success("Zgłoszenie odrzucone.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się odrzucić.");
      }
    });
  }

  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" onClick={approve} disabled={pending}>
        <Check className="size-4" />
        Zatwierdź
      </Button>
      <Button size="sm" variant="outline" onClick={reject} disabled={pending}>
        <X className="size-4" />
        Odrzuć
      </Button>
    </div>
  );
}
