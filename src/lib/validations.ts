import { z } from "zod";

// ─── Walidatory pól stowarzyszenia ──────────────────────────────────────────
// Dane rejestrowe (KRS, NIP, REGON, rok rejestracji, adres) są WYMAGANE —
// odpowiadają kolumnom NOT NULL w bazie i są zaciągane z API KRS przy zakładaniu.
// Pola kontaktowe (e-mail, telefon, opis) pozostają opcjonalne (puste → null).

// Wymagany ciąg cyfr o zadanej długości (ignoruje spacje i myślniki).
const requiredDigits = (length: number, emptyMsg: string, formatMsg: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => v !== "", emptyMsg)
    .refine((v) => v === "" || new RegExp(`^\\d{${length}}$`).test(v), formatMsg);

// Wymagany tekst (min. 1 znak po przycięciu).
const requiredText = (max: number, emptyMsg: string, longMsg: string) =>
  z.string().trim().min(1, emptyMsg).max(max, longMsg);

// Opcjonalny ciąg cyfr o zadanej długości (puste → null). KRS nie zawsze podaje
// NIP/REGON (np. stowarzyszenia nieprowadzące działalności gospodarczej).
const optionalDigits = (length: number, label: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => v === "" || new RegExp(`^\\d{${length}}$`).test(v), label)
    .transform((v) => (v === "" ? null : v));

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, label)
    .transform((v) => (v === "" ? null : v));

// Wspólny zestaw pól stowarzyszenia — używany zarówno przy zakładaniu
// (CreateOrgForm), jak i w panelu ustawień (OrgDetailsForm). Dzięki temu reguły
// „wymagane" są spójne z ograniczeniami NOT NULL w schemacie bazy.
const organizationFields = {
  name: z
    .string()
    .trim()
    .min(2, "Nazwa musi mieć co najmniej 2 znaki.")
    .max(100, "Nazwa może mieć maksymalnie 100 znaków."),
  krs: requiredDigits(10, "Podaj numer KRS.", "KRS musi mieć 10 cyfr."),
  // NIP/REGON — opcjonalne: KRS często ich nie zwraca dla stowarzyszeń/fundacji.
  nip: optionalDigits(10, "NIP musi mieć 10 cyfr."),
  regon: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine(
      (v) => v === "" || /^\d{9}$|^\d{14}$/.test(v),
      "REGON musi mieć 9 lub 14 cyfr.",
    )
    .transform((v) => (v === "" ? null : v)),
  foundedYear: z
    .string()
    .trim()
    .refine((v) => v !== "", "Podaj rok rejestracji.")
    .refine((v) => v === "" || /^\d{4}$/.test(v), "Rok w formacie RRRR.")
    .transform((v) => Number(v))
    .refine(
      (v) => v >= 1800 && v <= new Date().getFullYear(),
      "Podaj realny rok rejestracji.",
    ),
  street: requiredText(120, "Podaj ulicę i numer.", "Adres jest za długi."),
  postalCode: z
    .string()
    .trim()
    .refine((v) => v !== "", "Podaj kod pocztowy.")
    .refine(
      (v) => v === "" || /^\d{2}-\d{3}$/.test(v),
      "Kod pocztowy w formacie 00-000.",
    ),
  city: requiredText(80, "Podaj miejscowość.", "Nazwa miejscowości jest za długa."),
  contactEmail: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine(
      (v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
      "Podaj poprawny adres e-mail.",
    ),
  phone: optionalText(30, "Telefon jest za długi."),
  description: optionalText(500, "Opis jest za długi."),
};

// Walidacja formularza tworzenia stowarzyszenia (z danymi z KRS).
export const createOrganizationSchema = z.object(organizationFields);

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

// Walidacja danych rejestrowych/kontaktowych stowarzyszenia (panel ustawień).
// Ten sam zestaw pól co przy zakładaniu — dane rejestrowe pozostają wymagane.
export const organizationDetailsSchema = z.object(organizationFields);

// Logo stowarzyszenia — ograniczenia współdzielone przez podgląd (klient) i akcję (serwer).
export const LOGO_ACCEPTED_TYPES = ["image/png", "image/jpeg"] as const;
export const LOGO_ACCEPT_ATTR = "image/png,image/jpeg";
export const LOGO_MAX_BYTES = 1024 * 1024; // 1 MB

// Sprawdza typ i rozmiar przesłanego logo. Zwraca komunikat błędu lub null (OK).
export function validateLogoFile(file: {
  type: string;
  size: number;
}): string | null {
  if (!(LOGO_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return "Logo musi być plikiem PNG lub JPG.";
  }
  if (file.size > LOGO_MAX_BYTES) {
    return "Logo może mieć maksymalnie 1 MB.";
  }
  return null;
}

// Tryb pola standardowego formularza — lustro enuma FormFieldMode z bazy.
// Trzymane jako lokalny union, by validations.ts nie zależał od klienta Prisma.
export type FieldMode = "HIDDEN" | "OPTIONAL" | "REQUIRED";

// Walidatory pól standardowych zgłoszenia. Dane z publicznego formularza →
// walidujemy rygorystycznie po stronie serwera.
const birthDateValidator = z.coerce
  .date({ message: "Podaj poprawną datę urodzenia." })
  .refine((d) => d <= new Date(), "Data urodzenia nie może być z przyszłości.")
  .refine((d) => d >= new Date("1900-01-01"), "Podaj realną datę urodzenia.");

const phoneValidator = z
  .string()
  .trim()
  .min(3, "Podaj poprawny numer telefonu.")
  .max(30, "Numer telefonu jest za długi.")
  .refine(
    (v) => /^[\d\s+()-]+$/.test(v),
    "Numer telefonu może zawierać tylko cyfry i znaki + ( ) -.",
  );

const addressValidator = z
  .string()
  .trim()
  .min(3, "Podaj pełny adres zamieszkania.")
  .max(200, "Adres jest za długi.");

// Opakowuje walidator pola standardowego w regułę zależną od trybu:
//  • REQUIRED → wartość wymagana (puste odrzuca walidator własnym komunikatem),
//  • OPTIONAL → puste/niepodane przechodzi jako null, wpisane jest walidowane,
//  • HIDDEN  → pole pomijane (obsłużone przy budowie schematu).
function modal(validator: z.ZodTypeAny, mode: FieldMode) {
  if (mode === "REQUIRED") {
    return z.preprocess(
      (v) => (typeof v === "string" ? v.trim() : v),
      validator,
    );
  }
  // OPTIONAL: puste/niepodane → null, w przeciwnym razie waliduj.
  return z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    validator.nullable(),
  );
}

// Buduje schemat publicznego formularza zgłoszeniowego zależnie od konfiguracji
// pól standardowych stowarzyszenia (data urodzenia / telefon / adres). Pola ukryte
// są pomijane (nie pojawiają się ani w formularzu, ani w wyniku).
export function buildApplicationSchema(modes: {
  birthDate: FieldMode;
  phone: FieldMode;
  address: FieldMode;
}) {
  const shape: Record<string, z.ZodTypeAny> = {
    firstName: z
      .string()
      .trim()
      .min(2, "Imię musi mieć co najmniej 2 znaki.")
      .max(100, "Imię jest za długie."),
    lastName: z
      .string()
      .trim()
      .min(2, "Nazwisko musi mieć co najmniej 2 znaki.")
      .max(100, "Nazwisko jest za długie."),
    email: z.string().trim().toLowerCase().email("Podaj poprawny adres e-mail."),
  };
  if (modes.birthDate !== "HIDDEN") {
    shape.birthDate = modal(birthDateValidator, modes.birthDate);
  }
  if (modes.phone !== "HIDDEN") {
    shape.phone = modal(phoneValidator, modes.phone);
  }
  if (modes.address !== "HIDDEN") {
    shape.address = modal(addressValidator, modes.address);
  }
  return z.object(shape);
}

// Walidacja definicji pola własnego formularza (panel ustawień).
export const applicationFieldSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Podaj etykietę pola.")
    .max(100, "Etykieta jest za długa."),
  required: z.boolean(),
});

// Walidacja definicji pola-linku (panel ustawień). Etykieta wynika z typu, więc
// wybieramy tylko typ + obowiązkowość.
export const applicationLinkSchema = z.object({
  linkType: z.enum(["FACEBOOK", "LINKEDIN", "EGD"], {
    message: "Wybierz typ linku.",
  }),
  required: z.boolean(),
});

// Walidacja formularza spotkania. Punkty porządku obrad parsowane osobno w akcji
// (formData.getAll) — to pola wielokrotne. Role udziału wynikają z typu spotkania.
export const meetingSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Tytuł musi mieć co najmniej 2 znaki.")
    .max(150, "Tytuł jest za długi."),
  meetingTypeId: z
    .string()
    .trim()
    .min(1, "Wybierz typ spotkania."),
  startsAt: z.coerce
    .date({ message: "Podaj poprawną datę i godzinę spotkania." }),
  // Forma spotkania: online (link) albo stacjonarnie (adres).
  isOnline: z.coerce.boolean(),
  location: z
    .string()
    .trim()
    .max(300, "Miejsce spotkania jest za długie.")
    .transform((v) => (v === "" ? null : v)),
});

// Walidacja konfiguracji typu spotkania (panel ustawień). Role biorące udział
// parsowane osobno w akcji (formData.getAll("roleIds")) — to pole wielokrotne.
export const meetingTypeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nazwa musi mieć co najmniej 2 znaki.")
    .max(100, "Nazwa jest za długa."),
  // Pole z formularza (checkbox) — obecne = wymagane kworum.
  requiresQuorum: z.preprocess((v) => v === "on" || v === true, z.boolean()),
});

// Walidacja konfiguracji typu uchwały (panel ustawień): nazwa, procentowy próg
// głosów wymagany do przyjęcia oraz wymóg głosowania na spotkaniu (checkbox).
export const resolutionTypeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nazwa musi mieć co najmniej 2 znaki.")
    .max(100, "Nazwa jest za długa."),
  voteThreshold: z
    .string()
    .trim()
    .refine((v) => v !== "", "Podaj wymagany próg głosów.")
    .refine((v) => /^\d{1,3}$/.test(v), "Próg w procentach (liczba 1–100).")
    .transform((v) => Number(v))
    .refine((v) => v >= 1 && v <= 100, "Próg musi mieścić się w zakresie 1–100%."),
  // Pole z formularza (checkbox) — obecne = wymaga głosowania na spotkaniu.
  requiresMeeting: z.preprocess((v) => v === "on" || v === true, z.boolean()),
});

// Pojedynczy punkt porządku obrad.
export const agendaItemSchema = z
  .string()
  .trim()
  .max(300, "Punkt porządku obrad jest za długi.");

// Walidacja formularza uchwały (numer, tytuł, treść).
export const resolutionSchema = z.object({
  number: z
    .string()
    .trim()
    .min(1, "Podaj numer uchwały.")
    .max(40, "Numer uchwały jest za długi."),
  title: z
    .string()
    .trim()
    .min(3, "Tytuł musi mieć co najmniej 3 znaki.")
    .max(200, "Tytuł jest za długi."),
  content: z
    .string()
    .trim()
    .max(10000, "Treść uchwały jest za długa.")
    .transform((v) => (v === "" ? null : v)),
  // Pole z formularza: "secret" → głosowanie tajne, inaczej jawne.
  secretBallot: z.preprocess((v) => v === "secret", z.boolean()),
  // Wybrany typ uchwały (puste → brak typu, zachowanie domyślne).
  resolutionTypeId: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v)),
});

// Komentarz do punktu porządku obrad.
export const agendaCommentSchema = z
  .string()
  .trim()
  .min(1, "Komentarz nie może być pusty.")
  .max(1000, "Komentarz jest za długi.");

// Walidacja nazwy roli (macierz uprawnień parsuje parsePermissions w akcji).
export const roleNameSchema = z
  .string()
  .trim()
  .min(1, "Podaj nazwę roli.")
  .max(50, "Nazwa roli jest za długa.");

// Tworzy URL-bezpieczny slug z nazwy stowarzyszenia (obsługuje polskie znaki).
export function slugify(input: string): string {
  return input
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // usuń znaki diakrytyczne (ą→a, ę→e, ...)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
