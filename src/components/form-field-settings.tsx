"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setFormFieldModes } from "@/lib/actions/fields";
import { Button } from "@/components/ui/button";

export type FieldMode = "HIDDEN" | "OPTIONAL" | "REQUIRED";

type Modes = { birthDate: FieldMode; phone: FieldMode; address: FieldMode };

const MODE_OPTIONS: { value: FieldMode; label: string }[] = [
  { value: "HIDDEN", label: "Ukryj" },
  { value: "OPTIONAL", label: "Nieobowiązkowe" },
  { value: "REQUIRED", label: "Obowiązkowe" },
];

const FIELDS: { key: keyof Modes; label: string }[] = [
  { key: "birthDate", label: "Data urodzenia" },
  { key: "phone", label: "Numer telefonu" },
  { key: "address", label: "Adres zamieszkania" },
];

const selectClass =
  "h-10 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function FormFieldSettings({
  organizationId,
  modes: initial,
}: {
  organizationId: string;
  modes: Modes;
}) {
  const router = useRouter();
  const [modes, setModes] = useState<Modes>(initial);
  const [saving, startSaving] = useTransition();

  // Czy bieżący wybór różni się od zapisanego (sterowanie aktywnością przycisku).
  const dirty = FIELDS.some((f) => modes[f.key] !== initial[f.key]);

  function save() {
    startSaving(async () => {
      try {
        await setFormFieldModes(organizationId, modes);
        router.refresh();
        toast.success("Zapisano ustawienia pól.");
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Nie udało się zapisać ustawień.",
        );
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Zdecyduj, które pola standardowe pojawią się na publicznym formularzu i czy
        ich wypełnienie jest obowiązkowe. Wypełnione dane trafiają do ewidencji
        członka po zatwierdzeniu zgłoszenia.
      </p>
      <ul className="divide-y rounded-md border">
        {FIELDS.map((f) => (
          <li
            key={f.key}
            className="flex items-center justify-between gap-3 px-3 py-2.5"
          >
            <span className="text-sm font-medium">{f.label}</span>
            <select
              aria-label={f.label}
              value={modes[f.key]}
              onChange={(e) =>
                setModes((m) => ({ ...m, [f.key]: e.target.value as FieldMode }))
              }
              className={`${selectClass} w-44`}
            >
              {MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <Button type="button" onClick={save} disabled={saving || !dirty}>
        Zapisz ustawienia pól
      </Button>
    </div>
  );
}
