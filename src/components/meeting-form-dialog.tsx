"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, X } from "lucide-react";
import { createMeeting, updateMeeting } from "@/lib/actions/meetings";
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

type MeetingTypeOption = { id: string; name: string };

// Punkt porządku obrad w formularzu. `id` puste = nowy punkt. Ręczne punkty są
// informacyjne — głosowalne są tylko punkty-uchwały (dodawane z widoku uchwały).
type AgendaRow = { id: string; title: string };

export type MeetingFormValues = {
  id: string;
  title: string;
  meetingTypeId: string;
  startsAtValue: string; // „RRRR-MM-DDTHH:mm” dla input[type=datetime-local]
  isOnline: boolean;
  location: string;
  agendaItems: AgendaRow[];
};

export function MeetingFormDialog({
  organizationId,
  meetingTypes,
  meeting,
  editAsButton,
}: {
  organizationId: string;
  meetingTypes: MeetingTypeOption[];
  meeting?: MeetingFormValues;
  // W trybie edycji: zwykły przycisk z etykietą zamiast ikony (domyślnie ikona).
  editAsButton?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  // Punkty porządku obrad — każdy dodawany osobno. Pusta lista = brak porządku.
  const [agenda, setAgenda] = useState<AgendaRow[]>(meeting?.agendaItems ?? []);

  // Forma spotkania: online (pole „Link do spotkania") albo stacjonarnie („Adres").
  const [online, setOnline] = useState(meeting?.isOnline ?? false);

  function updateAgenda(index: number, value: string) {
    setAgenda((items) =>
      items.map((it, i) => (i === index ? { ...it, title: value } : it)),
    );
  }
  function removeAgenda(index: number) {
    setAgenda((items) => items.filter((_, i) => i !== index));
  }
  function addAgenda() {
    setAgenda((items) => [...items, { id: "", title: "" }]);
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
          setOnline(meeting?.isOnline ?? false);
        }
      }}
    >
      <DialogTrigger asChild>
        {meeting ? (
          editAsButton ? (
            <Button variant="outline">Edytuj spotkanie</Button>
          ) : (
            <Button variant="ghost" size="icon" aria-label="Edytuj spotkanie">
              <Pencil className="size-4" />
            </Button>
          )
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
            Ustal typ, termin i porządek obrad spotkania.
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
                name="meetingTypeId"
                defaultValue={meeting?.meetingTypeId ?? meetingTypes[0]?.id}
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
              >
                {meetingTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
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

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Forma spotkania</span>
              <select
                name="locationMode"
                value={online ? "online" : "offline"}
                onChange={(e) => setOnline(e.target.value === "online")}
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
              >
                <option value="offline">Offline</option>
                <option value="online">Online</option>
              </select>
            </label>

            <Field>
              <FieldLabel htmlFor="location">
                {online ? "Link do spotkania" : "Adres"}
              </FieldLabel>
              <Input
                id="location"
                name="location"
                defaultValue={meeting?.location}
                placeholder={
                  online
                    ? "https://meet.example.com/…"
                    : "ul. Wspólna 12, Warszawa"
                }
              />
            </Field>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Porządek obrad</legend>
            <p className="text-xs text-muted-foreground">
              Punkty porządku są informacyjne. Głosowaniu podlegają wyłącznie
              uchwały — dodasz je do spotkania z widoku uchwały.
            </p>
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
                    <Input
                      name="agendaItems"
                      value={item.title}
                      onChange={(e) => updateAgenda(i, e.target.value)}
                      placeholder="np. Sprawozdanie zarządu za 2025"
                      className="min-w-0 flex-1"
                    />
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

          <p className="text-xs text-muted-foreground">
            Role uprawnione do udziału i wymóg kworum wynikają z wybranego typu
            spotkania — skonfigurujesz je w Ustawieniach → Spotkania.
          </p>

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
