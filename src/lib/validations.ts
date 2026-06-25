import { z } from "zod";

// Walidacja formularza tworzenia stowarzyszenia.
export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nazwa musi mieć co najmniej 2 znaki.")
    .max(100, "Nazwa może mieć maksymalnie 100 znaków."),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

// Walidacja danych rejestrowych/kontaktowych stowarzyszenia (panel ustawień).
// Puste pola opcjonalne → null. Numery: prosty format (bez sumy kontrolnej).
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

export const organizationDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nazwa musi mieć co najmniej 2 znaki.")
    .max(100, "Nazwa może mieć maksymalnie 100 znaków."),
  krs: optionalDigits(10, "KRS musi mieć 10 cyfr."),
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
    .refine((v) => v === "" || /^\d{4}$/.test(v), "Rok w formacie RRRR.")
    .transform((v) => (v === "" ? null : Number(v)))
    .refine(
      (v) => v === null || (v >= 1800 && v <= new Date().getFullYear()),
      "Podaj realny rok założenia.",
    ),
  contactEmail: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine(
      (v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
      "Podaj poprawny adres e-mail.",
    ),
  phone: optionalText(30, "Telefon jest za długi."),
  street: optionalText(120, "Adres jest za długi."),
  postalCode: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine(
      (v) => v === null || /^\d{2}-\d{3}$/.test(v),
      "Kod pocztowy w formacie 00-000.",
    ),
  city: optionalText(80, "Nazwa miejscowości jest za długa."),
  description: optionalText(500, "Opis jest za długi."),
});

// Walidacja publicznego formularza zgłoszeniowego (link zapraszający).
// Dane pochodzą z publicznego źródła — walidujemy je rygorystycznie po stronie serwera.
export const applicationSchema = z.object({
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
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Podaj poprawny adres e-mail."),
  birthDate: z.coerce
    .date({ message: "Podaj poprawną datę urodzenia." })
    .refine((d) => d <= new Date(), "Data urodzenia nie może być z przyszłości.")
    .refine(
      (d) => d >= new Date("1900-01-01"),
      "Podaj realną datę urodzenia.",
    ),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;

// Walidacja definicji pola własnego formularza (panel ustawień).
export const applicationFieldSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Podaj etykietę pola.")
    .max(100, "Etykieta jest za długa."),
  required: z.boolean(),
});

// Walidacja etykiety progu składki (kwotę parsuje parsePLN w akcji).
export const paymentTierLabelSchema = z
  .string()
  .trim()
  .min(1, "Podaj nazwę progu.")
  .max(100, "Nazwa progu jest za długa.");

// Walidacja formularza spotkania. Lista uprawnionych ról i punkty porządku obrad
// parsowane osobno w akcji (formData.getAll) — to pola wielokrotne.
export const meetingSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Tytuł musi mieć co najmniej 2 znaki.")
    .max(150, "Tytuł jest za długi."),
  type: z.enum(["GENERAL_ASSEMBLY", "BOARD_MEETING"], {
    message: "Wybierz typ spotkania.",
  }),
  startsAt: z.coerce
    .date({ message: "Podaj poprawną datę i godzinę spotkania." }),
  location: z
    .string()
    .trim()
    .max(300, "Miejsce spotkania jest za długie.")
    .transform((v) => (v === "" ? null : v)),
});

// Pojedynczy punkt porządku obrad.
export const agendaItemSchema = z
  .string()
  .trim()
  .max(300, "Punkt porządku obrad jest za długi.");

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
