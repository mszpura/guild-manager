"use client";

import { useActionState } from "react";
import { createOrganization, type FormState } from "@/lib/actions/organization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";

export function CreateOrgForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createOrganization,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4">
      <Field data-invalid={state?.error ? true : undefined}>
        <FieldLabel htmlFor="name">Nazwa stowarzyszenia</FieldLabel>
        <Input
          id="name"
          name="name"
          required
          autoFocus
          placeholder="np. Polskie Stowarzyszenie Go"
          aria-invalid={state?.error ? true : undefined}
        />
        {state?.error ? <FieldError>{state.error}</FieldError> : null}
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Tworzenie…" : "Utwórz stowarzyszenie"}
      </Button>
    </form>
  );
}
