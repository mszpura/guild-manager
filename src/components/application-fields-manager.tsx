"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import {
  addApplicationField,
  deleteApplicationField,
  type FieldFormState,
} from "@/lib/actions/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";

type FieldItem = { id: string; label: string; required: boolean };

export function ApplicationFieldsManager({
  organizationId,
  fields,
}: {
  organizationId: string;
  fields: FieldItem[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const action = addApplicationField.bind(null, organizationId);
  const [state, formAction, pending] = useActionState<FieldFormState, FormData>(
    action,
    undefined,
  );
  const [deleting, startDelete] = useTransition();

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      toast.success("Dodano pole.");
    }
  }, [state]);

  function remove(id: string) {
    startDelete(async () => {
      await deleteApplicationField(id);
      router.refresh();
      toast.success("Usunięto pole.");
    });
  }

  return (
    <div className="space-y-4">
      {fields.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {fields.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <span className="flex items-center gap-2">
                <span className="font-medium">{f.label}</span>
                <Badge variant="secondary" className="text-[10px]">
                  tekst
                </Badge>
                {f.required ? (
                  <Badge className="text-[10px]">wymagane</Badge>
                ) : null}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(f.id)}
                disabled={deleting}
                aria-label={`Usuń pole ${f.label}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Brak pól własnych. Dodaj pierwsze poniżej.
        </p>
      )}

      <form ref={formRef} action={formAction} className="flex items-end gap-3">
        <Field className="flex-1">
          <FieldLabel htmlFor="label">Nowe pole (etykieta)</FieldLabel>
          <Input id="label" name="label" placeholder="np. Numer telefonu" required />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            name="required"
            className="size-4 rounded border-input"
          />
          wymagane
        </label>
        <Button type="submit" disabled={pending} className="mb-0.5">
          <Plus className="size-4" />
          Dodaj
        </Button>
      </form>
      {state?.error ? <FieldError>{state.error}</FieldError> : null}
    </div>
  );
}
