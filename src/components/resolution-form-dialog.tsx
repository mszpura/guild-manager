"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  createResolution,
  updateResolution,
} from "@/lib/actions/resolutions";
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

export type ResolutionFormValues = {
  id: string;
  number: string;
  title: string;
  content: string;
  secretBallot: boolean;
};

export function ResolutionFormDialog({
  organizationId,
  resolution,
  triggerLabel,
}: {
  organizationId: string;
  resolution?: ResolutionFormValues;
  // Etykieta przycisku wyzwalającego (domyślnie „Nowa uchwała" / „Edytuj").
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  function submit(formData: FormData) {
    start(async () => {
      const result = resolution
        ? await updateResolution(resolution.id, undefined, formData)
        : await createResolution(organizationId, undefined, formData);
      if (result?.ok) {
        setError(undefined);
        setOpen(false);
        router.refresh();
        toast.success(resolution ? "Zapisano uchwałę." : "Dodano uchwałę.");
      } else {
        setError(result?.error ?? "Nie udało się zapisać uchwały.");
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
        {resolution ? (
          <Button variant="outline">{triggerLabel ?? "Edytuj"}</Button>
        ) : (
          <Button>
            <Plus className="size-4" />
            {triggerLabel ?? "Nowa uchwała"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {resolution ? "Edytuj uchwałę" : "Nowa uchwała"}
          </DialogTitle>
          <DialogDescription>
            Uchwała powstaje jako szkic — głosowanie otworzysz później.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="number">Numer</FieldLabel>
            <Input
              id="number"
              name="number"
              defaultValue={resolution?.number}
              placeholder="np. 5/2026"
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="title">Tytuł</FieldLabel>
            <Input
              id="title"
              name="title"
              defaultValue={resolution?.title}
              placeholder="np. Wysokość składki członkowskiej na 2027"
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="content">Treść uchwały</FieldLabel>
            <textarea
              id="content"
              name="content"
              defaultValue={resolution?.content}
              rows={6}
              placeholder="Treść uchwały — paragrafy, postanowienia…"
              className="rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Tryb głosowania</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-start gap-2 rounded-md border p-3 text-sm has-checked:border-primary has-checked:bg-accent/40">
                <input
                  type="radio"
                  name="ballot"
                  value="open"
                  defaultChecked={!resolution?.secretBallot}
                  className="mt-0.5 size-4"
                />
                <span>
                  <span className="font-medium">Jawne</span>
                  <span className="block text-xs text-muted-foreground">
                    Widać, kto jak głosował.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-md border p-3 text-sm has-checked:border-primary has-checked:bg-accent/40">
                <input
                  type="radio"
                  name="ballot"
                  value="secret"
                  defaultChecked={resolution?.secretBallot}
                  className="mt-0.5 size-4"
                />
                <span>
                  <span className="font-medium">Tajne</span>
                  <span className="block text-xs text-muted-foreground">
                    Tylko zbiorczy wynik.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          {error ? <FieldError>{error}</FieldError> : null}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Zapisywanie…"
                : resolution
                  ? "Zapisz zmiany"
                  : "Dodaj uchwałę"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
