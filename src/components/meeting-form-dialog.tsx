"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, X } from "lucide-react";
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

// Punkt porządku obrad w formularzu. `id` puste = nowy punkt.
type AgendaRow = { id: string; title: string; votable: boolean };

export type MeetingFormValues = {
  id: string;
  title: string;
  type: string;
  startsAtValue: string; // „RRRR-MM-DDTHH:mm” dla input[type=datetime-local]
  location: string;
  agendaItems: AgendaRow[];
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

  // Punkty porządku obrad — każdy dodawany osobno. Pusta lista = brak porządku.
  const [agenda, setAgenda] = useState<AgendaRow[]>(meeting?.agendaItems ?? []);

  function updateAgenda(index: number, value: string) {
    setAgenda((items) =>
      items.map((it, i) => (i === index ? { ...it, title: value } : it)),
    );
  }
  function toggleVotable(index: number) {
    setAgenda((items) =>
      items.map((it, i) => (i === index ? { ...it, votable: !it.votable } : it)),
    );
  }
  function removeAgenda(index: number) {
    setAgenda((items) => items.filter((_, i) => i !== index));
  }
  function addAgenda() {
    setAgenda((items) => [...items, { id: "", title: "", votable: true }]);
  }

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
        if (!next) {
          setError(undefined);
          setAgenda(meeting?.agendaItems ?? []);
        }
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

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Porządek obrad</legend>
            {agenda.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Brak punktów. Dodaj pierwszy punkt porządku obrad.
              </p>
            ) : (
              <ol className="space-y-2">
                {agenda.map((item, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <span className="w-5 shrink-0 text-right text-sm text-muted-foreground">
                      {i + 1}.
                    </span>
                    <input type="hidden" name="agendaItemIds" value={item.id} />
                    <input
                      type="hidden"
                      name="agendaItemVotable"
                      value={item.votable ? "1" : "0"}
                    />
                    <Input
                      name="agendaItems"
                      value={item.title}
                      onChange={(e) => updateAgenda(i, e.target.value)}
                      placeholder="np. Sprawozdanie zarządu za 2025"
                      className="min-w-0 flex-1"
                    />
                    <label
                      className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
                      title="Czy punkt podlega głosowaniu"
                    >
                      <input
                        type="checkbox"
                        checked={item.votable}
                        onChange={() => toggleVotable(i)}
                        className="size-4 rounded border-input"
                      />
                      Głosowanie
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAgenda(i)}
                      aria-label={`Usuń punkt ${i + 1}`}
                    >
                      <X className="size-4" />
                    </Button>
                  </li>
                ))}
              </ol>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addAgenda}
            >
              <Plus className="size-4" />
              Dodaj punkt
            </Button>
          </fieldset>

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
