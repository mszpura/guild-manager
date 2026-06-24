"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import {
  updateOrganizationDetails,
  type FormState,
} from "@/lib/actions/organization";
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

  useEffect(() => {
    if (state?.ok) toast.success("Zapisano dane stowarzyszenia.");
  }, [state]);

  return (
    <form action={formAction} className="space-y-5">
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
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="name">Nazwa stowarzyszenia</FieldLabel>
            <Input id="name" name="name" defaultValue={org.name} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="krs">Numer KRS</FieldLabel>
            <Input
              id="krs"
              name="krs"
              defaultValue={org.krs ?? ""}
              inputMode="numeric"
              placeholder="0000123456"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="foundedYear">Rok założenia</FieldLabel>
            <Input
              id="foundedYear"
              name="foundedYear"
              defaultValue={org.foundedYear ?? ""}
              inputMode="numeric"
              placeholder="2018"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="nip">NIP</FieldLabel>
            <Input
              id="nip"
              name="nip"
              defaultValue={org.nip ?? ""}
              inputMode="numeric"
              placeholder="1234567890"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="regon">REGON</FieldLabel>
            <Input
              id="regon"
              name="regon"
              defaultValue={org.regon ?? ""}
              inputMode="numeric"
              placeholder="367812345"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="contactEmail">Adres e-mail</FieldLabel>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              defaultValue={org.contactEmail ?? ""}
              placeholder="kontakt@stowarzyszenie.pl"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="phone">Telefon</FieldLabel>
            <Input
              id="phone"
              name="phone"
              defaultValue={org.phone ?? ""}
              placeholder="+48 600 100 200"
            />
          </Field>
        </div>

        {/* Adres siedziby */}
        <div className="my-6 h-px bg-border" />
        <h3 className="mb-4 font-heading text-[15px] font-bold">
          Adres siedziby
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="street">Ulica i numer</FieldLabel>
            <Input
              id="street"
              name="street"
              defaultValue={org.street ?? ""}
              placeholder="ul. Wspólna 12 / 4"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="postalCode">Kod pocztowy</FieldLabel>
            <Input
              id="postalCode"
              name="postalCode"
              defaultValue={org.postalCode ?? ""}
              placeholder="00-345"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="city">Miejscowość</FieldLabel>
            <Input
              id="city"
              name="city"
              defaultValue={org.city ?? ""}
              placeholder="Warszawa"
            />
          </Field>
        </div>

        {/* Opis */}
        <div className="my-6 h-px bg-border" />
        <Field>
          <FieldLabel htmlFor="description">Krótki opis działalności</FieldLabel>
          <textarea
            id="description"
            name="description"
            defaultValue={org.description ?? ""}
            rows={3}
            className={`${inputClass} h-auto py-2 leading-relaxed`}
            placeholder="Czym zajmuje się stowarzyszenie…"
          />
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
