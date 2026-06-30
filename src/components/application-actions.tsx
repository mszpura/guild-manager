"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import {
  approveApplication,
  rejectApplication,
} from "@/lib/actions/applications";
import { Button } from "@/components/ui/button";

type Role = { id: string; name: string };

export function ApplicationActions({
  applicationId,
  roles = [],
  selectedRoleId = null,
}: {
  applicationId: string;
  // Role, na które Zarząd może przyjąć (bez Prezesa). Domyślna pierwsza.
  roles?: Role[];
  // Rola wybrana przez zgłaszającego — domyślnie zaznaczona; Zarząd może zmienić.
  selectedRoleId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Rola, na którą Zarząd przyjmie. Domyślnie wybór zgłaszającego (jeśli wciąż
  // dostępny), inaczej pierwsza rola (domyślna).
  const [roleId, setRoleId] = useState(
    selectedRoleId && roles.some((r) => r.id === selectedRoleId)
      ? selectedRoleId
      : (roles[0]?.id ?? ""),
  );
  const showRolePicker = roles.length > 1;

  function approve() {
    startTransition(async () => {
      try {
        const res = await approveApplication(applicationId, roleId || undefined);
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
    <div className="flex items-center justify-end gap-2">
      {showRolePicker ? (
        <select
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
          disabled={pending}
          aria-label="Rola, na którą przyjąć zgłaszającego"
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      ) : null}
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
