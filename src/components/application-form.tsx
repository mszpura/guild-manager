"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  submitApplication,
  type ApplicationFormState,
} from "@/lib/actions/applications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";

type CustomField = { id: string; label: string; required: boolean };

export function ApplicationForm({
  token,
  organizationName,
  customFields = [],
}: {
  token: string;
  organizationName: string;
  customFields?: CustomField[];
}) {
  const action = submitApplication.bind(null, token);
  const [state, formAction, pending] = useActionState<
    ApplicationFormState,
    FormData
  >(action, undefined);

  if (state?.ok) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="size-10 text-green-600" />
        <h2 className="text-lg font-semibold">Dziękujemy za zgłoszenie!</h2>
        <p className="text-sm text-muted-foreground">
          Twoje zgłoszenie do „{organizationName}” zostało przesłane. Po
          rozpatrzeniu przez administratora otrzymasz informację.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Field>
        <FieldLabel htmlFor="firstName">Imię</FieldLabel>
        <Input id="firstName" name="firstName" required autoFocus />
      </Field>
      <Field>
        <FieldLabel htmlFor="lastName">Nazwisko</FieldLabel>
        <Input id="lastName" name="lastName" required />
      </Field>
      <Field>
        <FieldLabel htmlFor="email">Adres e-mail</FieldLabel>
        <Input id="email" name="email" type="email" required />
      </Field>
      <Field>
        <FieldLabel htmlFor="birthDate">Data urodzenia</FieldLabel>
        <Input id="birthDate" name="birthDate" type="date" required />
      </Field>

      {customFields.map((f) => (
        <Field key={f.id}>
          <FieldLabel htmlFor={`custom_${f.id}`}>
            {f.label}
            {f.required ? " *" : ""}
          </FieldLabel>
          <Input
            id={`custom_${f.id}`}
            name={`custom_${f.id}`}
            required={f.required}
          />
        </Field>
      ))}

      {state?.error ? <FieldError>{state.error}</FieldError> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Wysyłanie…" : "Wyślij zgłoszenie"}
      </Button>
    </form>
  );
}
