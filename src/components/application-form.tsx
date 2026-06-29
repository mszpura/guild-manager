"use client";

import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  submitApplication,
  type ApplicationFormState,
} from "@/lib/actions/applications";
import { formatPLN } from "@/lib/money";
import { LINK_CONFIG, linkUrlPreview, type LinkType } from "@/lib/links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";

type CustomField = {
  id: string;
  label: string;
  required: boolean;
  linkType: LinkType | null;
};
type FieldMode = "HIDDEN" | "OPTIONAL" | "REQUIRED";
type FieldModes = { birthDate: FieldMode; phone: FieldMode; address: FieldMode };

export function ApplicationForm({
  token,
  organizationName,
  customFields = [],
  fieldModes,
  paid = false,
  feeAmount = null,
  feeLabel = null,
}: {
  token: string;
  organizationName: string;
  customFields?: CustomField[];
  fieldModes: FieldModes;
  paid?: boolean;
  // Roczna składka roli domyślnej (grosze) i jej nazwa. null = rola zwolniona.
  feeAmount?: number | null;
  feeLabel?: string | null;
}) {
  const action = submitApplication.bind(null, token);
  const [state, formAction, pending] = useActionState<
    ApplicationFormState,
    FormData
  >(action, undefined);
  // Zgłaszający deklaruje opłatę offline (przelew / już opłacona) — pomijamy płatność online.
  const [skipPayment, setSkipPayment] = useState(false);
  const hasPayment = paid && feeAmount != null;

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

      {fieldModes.birthDate !== "HIDDEN" ? (
        <Field>
          <FieldLabel htmlFor="birthDate">
            Data urodzenia
            {fieldModes.birthDate === "REQUIRED" ? " *" : ""}
          </FieldLabel>
          <Input
            id="birthDate"
            name="birthDate"
            type="date"
            required={fieldModes.birthDate === "REQUIRED"}
          />
        </Field>
      ) : null}

      {fieldModes.phone !== "HIDDEN" ? (
        <Field>
          <FieldLabel htmlFor="phone">
            Numer telefonu
            {fieldModes.phone === "REQUIRED" ? " *" : ""}
          </FieldLabel>
          <Input
            id="phone"
            name="phone"
            type="tel"
            required={fieldModes.phone === "REQUIRED"}
          />
        </Field>
      ) : null}

      {fieldModes.address !== "HIDDEN" ? (
        <Field>
          <FieldLabel htmlFor="address">
            Adres zamieszkania
            {fieldModes.address === "REQUIRED" ? " *" : ""}
          </FieldLabel>
          <Input
            id="address"
            name="address"
            required={fieldModes.address === "REQUIRED"}
          />
        </Field>
      ) : null}

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
            placeholder={f.linkType ? LINK_CONFIG[f.linkType].placeholder : undefined}
          />
          {f.linkType ? (
            <span className="text-xs text-muted-foreground">
              Podaj sam identyfikator lub wklej cały link — zapiszemy adres w
              formacie {linkUrlPreview(f.linkType)}
            </span>
          ) : null}
        </Field>
      ))}

      {hasPayment ? (
        <>
          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
            <span className="text-sm">
              Składka członkowska
              {feeLabel ? (
                <span className="block text-xs text-muted-foreground">
                  {feeLabel}
                </span>
              ) : null}
            </span>
            <span className="font-medium">{formatPLN(feeAmount)}</span>
          </div>

          <label className="flex items-start gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
            <input
              type="checkbox"
              name="skipPayment"
              checked={skipPayment}
              onChange={(e) => setSkipPayment(e.target.checked)}
              className="mt-0.5 size-4"
            />
            <span className="text-sm">
              Składkę opłacę przelewem lub mam ją już opłaconą — pomiń płatność
              online.
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Administrator potwierdzi wpłatę przy rozpatrywaniu zgłoszenia.
              </span>
            </span>
          </label>
        </>
      ) : null}

      {state?.error ? <FieldError>{state.error}</FieldError> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending
          ? "Przetwarzanie…"
          : hasPayment && !skipPayment
            ? "Przejdź do płatności"
            : "Wyślij zgłoszenie"}
      </Button>
    </form>
  );
}
