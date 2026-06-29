"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createOrganizationSchema,
  organizationDetailsSchema,
  slugify,
  validateLogoFile,
} from "@/lib/validations";
import { generateInviteToken } from "@/lib/tokens";
import { fetchKrsData, type KrsLookupResult } from "@/lib/krs";
import { requireMember } from "@/lib/tenant";
import {
  OWNER_PERMISSIONS,
  MEMBER_PERMISSIONS,
  VICE_PRESIDENT_PERMISSIONS,
  BOARD_MEMBER_PERMISSIONS,
  TREASURER_PERMISSIONS,
} from "@/lib/permissions";

export type FormState = { error?: string; ok?: boolean } | undefined;

// Pobiera dane stowarzyszenia z API KRS po numerze. Wywoływana z klienta
// (przycisk „Pobierz dane z KRS"). Wymaga zalogowania.
export async function lookupKrs(krs: string): Promise<KrsLookupResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "Musisz być zalogowany." };
  }
  return fetchKrsData(krs);
}

// Aktualizuje dane stowarzyszenia (dane podstawowe + adres siedziby). Wymaga SETTINGS WRITE.
export async function updateOrganizationDetails(
  organizationId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireMember(organizationId, "SETTINGS", "WRITE");

  const str = (key: string) => String(formData.get(key) ?? "");
  const parsed = organizationDetailsSchema.safeParse({
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
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane." };
  }

  // Logo: nowy plik nadpisuje istniejące, znacznik removeLogo czyści, brak obu → bez zmian.
  const data: typeof parsed.data & { logoUrl?: string | null } = parsed.data;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const logoError = validateLogoFile(logo);
    if (logoError) return { error: logoError };
    const base64 = Buffer.from(await logo.arrayBuffer()).toString("base64");
    data.logoUrl = `data:${logo.type};base64,${base64}`;
  } else if (formData.get("removeLogo") === "1") {
    data.logoUrl = null;
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data,
  });

  revalidatePath("/settings");
  revalidatePath("/", "layout"); // nazwa w app barze / podtytuł pulpitu
  return { ok: true };
}

// Rozbija pełną nazwę użytkownika na imię + (opcjonalne) nazwisko.
// Bez nazwy → imię z części adresu e-mail przed @.
function splitName(name: string | null | undefined, email: string) {
  const full = (name ?? "").trim();
  if (!full) return { firstName: email.split("@")[0], lastName: null };
  const parts = full.split(/\s+/);
  return {
    firstName: parts[0],
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

// Tworzy nowe stowarzyszenie, czyni twórcę właścicielem (OWNER) i ustawia je
// jako aktywne. Wywoływane przez formularz przez useActionState.
export async function createOrganization(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const email = session.user.email?.toLowerCase();
  if (!email) {
    return {
      error: "Twoje konto nie ma adresu e-mail — nie można utworzyć stowarzyszenia.",
    };
  }

  const str = (key: string) => String(formData.get(key) ?? "");
  const parsed = createOrganizationSchema.safeParse({
    name: str("name"),
    krs: str("krs"),
    nip: str("nip"),
    regon: str("regon"),
    foundedYear: str("foundedYear"),
    street: str("street"),
    postalCode: str("postalCode"),
    city: str("city"),
    contactEmail: str("contactEmail"),
    phone: str("phone"),
    description: str("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane." };
  }

  // Wygeneruj unikalny slug (dokładając sufiks liczbowy przy kolizji).
  const base = slugify(parsed.data.name) || "stowarzyszenie";
  let slug = base;
  let suffix = 1;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }

  const { firstName, lastName } = splitName(session.user.name, email);

  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: parsed.data.name,
        slug,
        inviteToken: generateInviteToken(),
        // Dane rejestrowe (z KRS) — wymagane.
        krs: parsed.data.krs,
        nip: parsed.data.nip,
        regon: parsed.data.regon,
        foundedYear: parsed.data.foundedYear,
        street: parsed.data.street,
        postalCode: parsed.data.postalCode,
        city: parsed.data.city,
        // Dane kontaktowe — opcjonalne.
        contactEmail: parsed.data.contactEmail,
        phone: parsed.data.phone,
        description: parsed.data.description,
      },
    });
    // Dwie domyślne role: Prezes (pełne, zablokowana) i Członek (domyślna).
    const ownerRole = await tx.role.create({
      data: {
        organizationId: org.id,
        name: "Prezes",
        permissions: OWNER_PERMISSIONS,
        isOwner: true,
        isSystem: true,
      },
    });
    await tx.role.create({
      data: {
        organizationId: org.id,
        name: "Członek",
        permissions: MEMBER_PERMISSIONS,
        isSystem: true,
        isDefault: true,
      },
    });
    // Dodatkowe role zarządu zakładane od razu (edytowalne/usuwalne w ustawieniach),
    // by użytkownicy nie musieli tworzyć ich ręcznie. Kolejność = kolejność na liście.
    await tx.role.createMany({
      data: [
        {
          organizationId: org.id,
          name: "Wiceprezes",
          permissions: VICE_PRESIDENT_PERMISSIONS,
        },
        {
          organizationId: org.id,
          name: "Skarbnik",
          permissions: TREASURER_PERMISSIONS,
        },
        {
          organizationId: org.id,
          name: "Członek Zarządu",
          permissions: BOARD_MEMBER_PERMISSIONS,
        },
        {
          // Junior (§8/§11 ust. 2/§13 statutu): te same prawa co członek zwyczajny,
          // ale bez prawa głosu i ze zwolnieniem ze składek.
          organizationId: org.id,
          name: "Junior",
          permissions: MEMBER_PERMISSIONS,
          canVote: false,
          feeExempt: true,
        },
      ],
    });
    // Twórca staje się członkiem z rolą Prezes (pojawia się na liście członków).
    await tx.member.create({
      data: {
        organizationId: org.id,
        roleId: ownerRole.id,
        email,
        firstName,
        lastName,
      },
    });
    await tx.user.update({
      where: { id: session.user.id },
      data: { activeOrganizationId: org.id },
    });
  });

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

// Przełącza aktywne stowarzyszenie po weryfikacji przynależności (po e-mailu).
export async function setActiveOrganization(organizationId: string) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const email = session.user.email?.toLowerCase();
  if (!email) throw new Error("Brak adresu e-mail w koncie.");

  const member = await prisma.member.findUnique({
    where: { organizationId_email: { organizationId, email } },
    select: { id: true },
  });
  if (!member) {
    throw new Error("Brak dostępu do tego stowarzyszenia.");
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { activeOrganizationId: organizationId },
  });

  revalidatePath("/", "layout");
}

// Generuje nowy token linku zapraszającego (unieważnia poprzedni). OWNER/BOARD.
export async function regenerateInviteLink(organizationId: string) {
  await requireMember(organizationId, "MEMBERS", "WRITE");
  await prisma.organization.update({
    where: { id: organizationId },
    data: { inviteToken: generateInviteToken() },
  });
  revalidatePath("/members");
}

// Włącza/wyłącza link zapraszający. OWNER/BOARD.
export async function setInviteEnabled(
  organizationId: string,
  enabled: boolean,
) {
  await requireMember(organizationId, "MEMBERS", "WRITE");
  await prisma.organization.update({
    where: { id: organizationId },
    data: { inviteEnabled: enabled },
  });
  revalidatePath("/members");
}
