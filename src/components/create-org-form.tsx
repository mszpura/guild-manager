"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import {
  createOrganization,
  lookupKrs,
  type FormState,
} from "@/lib/actions/organization";
import { createOrganizationSchema } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";

type Values = {
  name: string;
  krs: string;
  nip: string;
  regon: string;
  foundedYear: string;
  street: string;
  postalCode: string;
  city: string;
  contactEmail: string;
  phone: string;
  description: string;
};

const EMPTY: Values = {
  name: "",
  krs: "",
  nip: "",
  regon: "",
  foundedYear: "",
  street: "",
  postalCode: "",
  city: "",
  contactEmail: "",
  phone: "",
  description: "",
};

const inputClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function CreateOrgForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createOrganization,
    undefined,
  );
  const [values, setValues] = useState<Values>(EMPTY);
  // Błędy walidacji frontendowej (klucz = nazwa pola). Walidujemy tym samym
  // schematem co serwer, więc gdy przejdzie tu, przejdzie też po stronie serwera.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [krsError, setKrsError] = useState<string | null>(null);
  const [krsLoading, startKrs] = useTransition();

  const set =
    (key: keyof Values) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value }));

  // Zaciąga dane firmy z API KRS i wypełnia pola formularza. Pola, których KRS
  // nie zwraca (np. NIP/REGON dla niektórych stowarzyszeń), zostawia do ręcznego
  // uzupełnienia.
  function handleLoadKrs() {
    setKrsError(null);
    startKrs(async () => {
      const result = await lookupKrs(values.krs);
      if (!result.ok) {
        setKrsError(result.error);
        return;
      }
      const d = result.data;
      setValues((v) => ({
        ...v,
        krs: result.krs,
        name: d.name || v.name,
        nip: d.nip ?? v.nip,
        regon: d.regon ?? v.regon,
        foundedYear: d.foundedYear ? String(d.foundedYear) : v.foundedYear,
        street: d.street ?? v.street,
        postalCode: d.postalCode ?? v.postalCode,
        city: d.city ?? v.city,
      }));
      setErrors({});
      toast.success("Załadowano dane z KRS.");
      if (!d.nip || !d.regon) {
        toast.info("KRS nie zawiera NIP/REGON — możesz je uzupełnić ręcznie.");
      }
    });
  }

  // Walidujemy przed wysyłką. Przy błędzie blokujemy submit (preventDefault),
  // dzięki czemu akcja serwera się nie uruchamia.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const result = createOrganizationSchema.safeParse(values);
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
          e.currentTarget.querySelector(
            `[name="${firstKey}"]`,
          ) as HTMLElement | null
        )?.focus();
      }
      return;
    }
    setErrors({});
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* Numer KRS + pobranie danych */}
      <div className="rounded-xl border bg-muted/30 p-4">
        <Field data-invalid={errors.krs ? true : undefined}>
          <FieldLabel htmlFor="krs">Numer KRS</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="krs"
              name="krs"
              value={values.krs}
              onChange={set("krs")}
              autoFocus
              inputMode="numeric"
              placeholder="0000123456"
              aria-invalid={errors.krs ? true : undefined}
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleLoadKrs}
              disabled={krsLoading || values.krs.trim() === ""}
              className="shrink-0"
            >
              <Download className="size-4" />
              {krsLoading ? "Pobieranie…" : "Pobierz dane z KRS"}
            </Button>
          </div>
          {errors.krs ? <FieldError>{errors.krs}</FieldError> : null}
          {krsError ? (
            <p className="mt-1 text-sm text-destructive">{krsError}</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Wpisz numer KRS i pobierz dane stowarzyszenia z rejestru.
            </p>
          )}
        </Field>
      </div>

      {/* Dane rejestrowe */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          className="sm:col-span-2"
          data-invalid={errors.name ? true : undefined}
        >
          <FieldLabel htmlFor="name">Nazwa stowarzyszenia</FieldLabel>
          <Input
            id="name"
            name="name"
            value={values.name}
            onChange={set("name")}
            placeholder="np. Polskie Stowarzyszenie Go"
            aria-invalid={errors.name ? true : undefined}
          />
          {errors.name ? <FieldError>{errors.name}</FieldError> : null}
        </Field>

        <Field data-invalid={errors.nip ? true : undefined}>
          <FieldLabel htmlFor="nip">
            NIP{" "}
            <span className="font-normal text-muted-foreground">
              (opcjonalnie)
            </span>
          </FieldLabel>
          <Input
            id="nip"
            name="nip"
            value={values.nip}
            onChange={set("nip")}
            inputMode="numeric"
            placeholder="1234567890"
            aria-invalid={errors.nip ? true : undefined}
          />
          {errors.nip ? <FieldError>{errors.nip}</FieldError> : null}
        </Field>

        <Field data-invalid={errors.regon ? true : undefined}>
          <FieldLabel htmlFor="regon">
            REGON{" "}
            <span className="font-normal text-muted-foreground">
              (opcjonalnie)
            </span>
          </FieldLabel>
          <Input
            id="regon"
            name="regon"
            value={values.regon}
            onChange={set("regon")}
            inputMode="numeric"
            placeholder="367812345"
            aria-invalid={errors.regon ? true : undefined}
          />
          {errors.regon ? <FieldError>{errors.regon}</FieldError> : null}
        </Field>

        <Field data-invalid={errors.foundedYear ? true : undefined}>
          <FieldLabel htmlFor="foundedYear">Rok rejestracji</FieldLabel>
          <Input
            id="foundedYear"
            name="foundedYear"
            value={values.foundedYear}
            onChange={set("foundedYear")}
            inputMode="numeric"
            placeholder="2018"
            aria-invalid={errors.foundedYear ? true : undefined}
          />
          {errors.foundedYear ? (
            <FieldError>{errors.foundedYear}</FieldError>
          ) : null}
        </Field>
      </div>

      {/* Adres siedziby */}
      <div>
        <h3 className="mb-3 font-heading text-[15px] font-bold">
          Adres siedziby
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            className="sm:col-span-2"
            data-invalid={errors.street ? true : undefined}
          >
            <FieldLabel htmlFor="street">Ulica i numer</FieldLabel>
            <Input
              id="street"
              name="street"
              value={values.street}
              onChange={set("street")}
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
              value={values.postalCode}
              onChange={set("postalCode")}
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
              value={values.city}
              onChange={set("city")}
              placeholder="Warszawa"
              aria-invalid={errors.city ? true : undefined}
            />
            {errors.city ? <FieldError>{errors.city}</FieldError> : null}
          </Field>
        </div>
      </div>

      {/* Dane kontaktowe (opcjonalne) */}
      <div>
        <h3 className="mb-3 font-heading text-[15px] font-bold">
          Kontakt{" "}
          <span className="font-normal text-muted-foreground">
            (opcjonalnie)
          </span>
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={errors.contactEmail ? true : undefined}>
            <FieldLabel htmlFor="contactEmail">Adres e-mail</FieldLabel>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              value={values.contactEmail}
              onChange={set("contactEmail")}
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
              value={values.phone}
              onChange={set("phone")}
              placeholder="+48 600 100 200"
              aria-invalid={errors.phone ? true : undefined}
            />
            {errors.phone ? <FieldError>{errors.phone}</FieldError> : null}
          </Field>
          <Field
            className="sm:col-span-2"
            data-invalid={errors.description ? true : undefined}
          >
            <FieldLabel htmlFor="description">
              Krótki opis działalności
            </FieldLabel>
            <textarea
              id="description"
              name="description"
              value={values.description}
              onChange={set("description")}
              rows={3}
              className={`${inputClass} h-auto py-2 leading-relaxed`}
              placeholder="Czym zajmuje się stowarzyszenie…"
              aria-invalid={errors.description ? true : undefined}
            />
            {errors.description ? (
              <FieldError>{errors.description}</FieldError>
            ) : null}
          </Field>
        </div>
      </div>

      {state?.error ? <FieldError>{state.error}</FieldError> : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Tworzenie…" : "Utwórz stowarzyszenie"}
      </Button>
    </form>
  );
}
