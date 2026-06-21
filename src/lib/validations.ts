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
