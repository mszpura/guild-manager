"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  updateOrganizationDetails,
  type FormState,
} from "@/lib/actions/organization";
import { organizationDetailsSchema } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";

type OrgDetails = {
  name: string;
  krs: string | null;
  nip: string | null;
  regon: string | null;
  foundedYear: number | null;
  contactEmail: string | null;
  phone: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  description: string | null;
};

const inputClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function OrgDetailsForm({
  organizationId,
  org,
}: {
  organizationId: string;
  org: OrgDetails;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateOrganizationDetails.bind(null, organizationId),
    undefined,
  );
  // Błędy walidacji frontendowej (klucz = nazwa pola). Walidujemy tym samym
  // schematem co serwer, więc gdy przejdzie tu, przejdzie też po stronie serwera.
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (state?.ok) toast.success("Zapisano dane stowarzyszenia.");
  }, [state]);

  // Walidujemy przed wysyłką. Przy błędzie blokujemy submit (preventDefault),
  // dzięki czemu akcja serwera się nie uruchamia i React nie zeruje formularza.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const data = new FormData(form);
    const str = (key: string) => String(data.get(key) ?? "");
    const result = organizationDetailsSchema.safeParse({
      name: str("name"),
      krs: str("krs"),
      nip: str("nip"),
      regon: str("regon"),
      foundedYear: str("foundedYear"),
      contactEmail: str("contactEmail"),
      phone: str("phone"),
      street: str("street"),
      postalCode: str("postalCode"),
      city: str("city"),
      description: str("description"),
    });
    if (!result.success) {
      e.preventDefault();
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      const firstKey = String(result.error.issues[0]?.path[0] ?? "");
      if (firstKey) {
        (
          form.querySelector(`[name="${firstKey}"]`) as HTMLElement | null
        )?.focus();
      }
      return;
    }
    setErrors({});
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      onReset={() => setErrors({})}
      noValidate
      className="space-y-5"
    >
      <div className="rounded-xl border bg-card p-6">
        {/* Logo — bez uploadu (wkrótce) */}
        <div className="mb-6 flex items-center gap-4 border-b pb-6">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-brand">
            <span className="flex items-center">
              <span className="size-3.5 rounded-full border-2 border-white" />
              <span className="-ml-1.5 size-3.5 rounded-full border-2 border-primary" />
            </span>
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Logo stowarzyszenia</div>
            <div className="text-xs text-muted-foreground">
              PNG lub SVG, min. 240×240 px
            </div>
          </div>
          <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            wkrótce
          </span>
        </div>

        {/* Dane podstawowe */}
        <h3 className="mb-4 font-heading text-[15px] font-bold">
          Dane podstawowe
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2" data-invalid={errors.name ? true : undefined}>
            <FieldLabel htmlFor="name">Nazwa stowarzyszenia</FieldLabel>
            <Input
              id="name"
              name="name"
              defaultValue={org.name}
              aria-invalid={errors.name ? true : undefined}
            />
            {errors.name ? <FieldError>{errors.name}</FieldError> : null}
          </Field>
          <Field data-invalid={errors.krs ? true : undefined}>
            <FieldLabel htmlFor="krs">Numer KRS</FieldLabel>
            <Input
              id="krs"
              name="krs"
              defaultValue={org.krs ?? ""}
              inputMode="numeric"
              placeholder="0000123456"
              aria-invalid={errors.krs ? true : undefined}
            />
            {errors.krs ? <FieldError>{errors.krs}</FieldError> : null}
          </Field>
          <Field data-invalid={errors.foundedYear ? true : undefined}>
            <FieldLabel htmlFor="foundedYear">Rok założenia</FieldLabel>
            <Input
              id="foundedYear"
              name="foundedYear"
              defaultValue={org.foundedYear ?? ""}
              inputMode="numeric"
              placeholder="2018"
              aria-invalid={errors.foundedYear ? true : undefined}
            />
            {errors.foundedYear ? (
              <FieldError>{errors.foundedYear}</FieldError>
            ) : null}
          </Field>
          <Field data-invalid={errors.nip ? true : undefined}>
            <FieldLabel htmlFor="nip">NIP</FieldLabel>
            <Input
              id="nip"
              name="nip"
              defaultValue={org.nip ?? ""}
              inputMode="numeric"
              placeholder="1234567890"
              aria-invalid={errors.nip ? true : undefined}
            />
            {errors.nip ? <FieldError>{errors.nip}</FieldError> : null}
          </Field>
          <Field data-invalid={errors.regon ? true : undefined}>
            <FieldLabel htmlFor="regon">REGON</FieldLabel>
            <Input
              id="regon"
              name="regon"
              defaultValue={org.regon ?? ""}
              inputMode="numeric"
              placeholder="367812345"
              aria-invalid={errors.regon ? true : undefined}
            />
            {errors.regon ? <FieldError>{errors.regon}</FieldError> : null}
          </Field>
          <Field data-invalid={errors.contactEmail ? true : undefined}>
            <FieldLabel htmlFor="contactEmail">Adres e-mail</FieldLabel>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              defaultValue={org.contactEmail ?? ""}
              placeholder="kontakt@stowarzyszenie.pl"
              aria-invalid={errors.contactEmail ? true : undefined}
            />
            {errors.contactEmail ? (
              <FieldError>{errors.contactEmail}</FieldError>
            ) : null}
          </Field>
          <Field data-invalid={errors.phone ? true : undefined}>
            <FieldLabel htmlFor="phone">Telefon</FieldLabel>
            <Input
              id="phone"
              name="phone"
              defaultValue={org.phone ?? ""}
              placeholder="+48 600 100 200"
              aria-invalid={errors.phone ? true : undefined}
            />
            {errors.phone ? <FieldError>{errors.phone}</FieldError> : null}
          </Field>
        </div>

        {/* Adres siedziby */}
        <div className="my-6 h-px bg-border" />
        <h3 className="mb-4 font-heading text-[15px] font-bold">
          Adres siedziby
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2" data-invalid={errors.street ? true : undefined}>
            <FieldLabel htmlFor="street">Ulica i numer</FieldLabel>
            <Input
              id="street"
              name="street"
              defaultValue={org.street ?? ""}
              placeholder="ul. Wspólna 12 / 4"
              aria-invalid={errors.street ? true : undefined}
            />
            {errors.street ? <FieldError>{errors.street}</FieldError> : null}
          </Field>
          <Field data-invalid={errors.postalCode ? true : undefined}>
            <FieldLabel htmlFor="postalCode">Kod pocztowy</FieldLabel>
            <Input
              id="postalCode"
              name="postalCode"
              defaultValue={org.postalCode ?? ""}
              placeholder="00-345"
              aria-invalid={errors.postalCode ? true : undefined}
            />
            {errors.postalCode ? (
              <FieldError>{errors.postalCode}</FieldError>
            ) : null}
          </Field>
          <Field data-invalid={errors.city ? true : undefined}>
            <FieldLabel htmlFor="city">Miejscowość</FieldLabel>
            <Input
              id="city"
              name="city"
              defaultValue={org.city ?? ""}
              placeholder="Warszawa"
              aria-invalid={errors.city ? true : undefined}
            />
            {errors.city ? <FieldError>{errors.city}</FieldError> : null}
          </Field>
        </div>

        {/* Opis */}
        <div className="my-6 h-px bg-border" />
        <Field data-invalid={errors.description ? true : undefined}>
          <FieldLabel htmlFor="description">Krótki opis działalności</FieldLabel>
          <textarea
            id="description"
            name="description"
            defaultValue={org.description ?? ""}
            rows={3}
            className={`${inputClass} h-auto py-2 leading-relaxed`}
            placeholder="Czym zajmuje się stowarzyszenie…"
            aria-invalid={errors.description ? true : undefined}
          />
          {errors.description ? (
            <FieldError>{errors.description}</FieldError>
          ) : null}
        </Field>

        {state?.error ? (
          <FieldError className="mt-4">{state.error}</FieldError>
        ) : null}
      </div>

      <div className="flex justify-end gap-3">
        <Button type="reset" variant="outline">
          Anuluj
        </Button>
        <Button
          type="submit"
          disabled={pending}
          className="bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {pending ? "Zapisywanie…" : "Zapisz zmiany"}
        </Button>
      </div>
    </form>
  );
}
