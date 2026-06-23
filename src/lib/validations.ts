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
