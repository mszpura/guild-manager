"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { createMeeting, updateMeeting } from "@/lib/actions/meetings";
import { MEETING_TYPES, MEETING_TYPE_LABELS } from "@/lib/meetings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type RoleOption = { id: string; name: string };

export type MeetingFormValues = {
  id: string;
  title: string;
  type: string;
  startsAtValue: string; // „RRRR-MM-DDTHH:mm” dla input[type=datetime-local]
  location: string;
  agenda: string;
  roleIds: string[];
};

export function MeetingFormDialog({
  organizationId,
  roles,
  meeting,
}: {
  organizationId: string;
  roles: RoleOption[];
  meeting?: MeetingFormValues;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  function submit(formData: FormData) {
    start(async () => {
      const result = meeting
        ? await updateMeeting(meeting.id, undefined, formData)
        : await createMeeting(organizationId, undefined, formData);
      if (result?.ok) {
        setError(undefined);
        setOpen(false);
        router.refresh();
        toast.success(meeting ? "Zapisano spotkanie." : "Dodano spotkanie.");
      } else {
        setError(result?.error ?? "Nie udało się zapisać spotkania.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(undefined);
      }}
    >
      <DialogTrigger asChild>
        {meeting ? (
          <Button variant="ghost" size="icon" aria-label="Edytuj spotkanie">
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" />
            Dodaj spotkanie
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {meeting ? "Edytuj spotkanie" : "Nowe spotkanie"}
          </DialogTitle>
          <DialogDescription>
            Ustal termin, typ i kto może wziąć udział.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="title">Tytuł</FieldLabel>
            <Input
              id="title"
              name="title"
              defaultValue={meeting?.title}
              placeholder="np. Walne zebranie sprawozdawcze 2026"
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Typ spotkania</span>
              <select
                name="type"
                defaultValue={meeting?.type ?? MEETING_TYPES[0]}
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
              >
                {MEETING_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {MEETING_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>

            <Field>
              <FieldLabel htmlFor="startsAt">Data i godzina</FieldLabel>
              <Input
                id="startsAt"
                name="startsAt"
                type="datetime-local"
                defaultValue={meeting?.startsAtValue}
                required
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="location">Miejsce spotkania</FieldLabel>
            <Input
              id="location"
              name="location"
              defaultValue={meeting?.location}
              placeholder="Adres albo link do spotkania online"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="agenda">Porządek obrad</FieldLabel>
            <textarea
              id="agenda"
              name="agenda"
              defaultValue={meeting?.agenda}
              rows={5}
              placeholder={"1. Otwarcie zebrania\n2. Sprawozdanie zarządu\n3. Wolne wnioski"}
              className="rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Role uprawnione do udziału
            </legend>
            <p className="text-xs text-muted-foreground">
              Nie zaznaczaj żadnej roli, aby spotkanie było widoczne dla
              wszystkich członków.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {roles.map((r) => (
                <label
                  key={r.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="roleIds"
                    value={r.id}
                    defaultChecked={meeting?.roleIds.includes(r.id)}
                    className="size-4 rounded border-input"
                  />
                  {r.name}
                </label>
              ))}
            </div>
          </fieldset>

          {error ? <FieldError>{error}</FieldError> : null}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Zapisywanie…"
                : meeting
                  ? "Zapisz zmiany"
                  : "Dodaj spotkanie"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
