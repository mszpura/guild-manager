"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createOrganizationSchema, slugify } from "@/lib/validations";
import { Role } from "@/generated/prisma/client";

export type FormState = { error?: string } | undefined;

// Tworzy nowe stowarzyszenie, czyni twórcę właścicielem (OWNER) i ustawia je
// jako aktywne. Wywoływane przez formularz przez useActionState.
export async function createOrganization(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const parsed = createOrganizationSchema.safeParse({
    name: formData.get("name"),
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

  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { name: parsed.data.name, slug },
    });
    await tx.membership.create({
      data: {
        userId: session.user.id,
        organizationId: org.id,
        role: Role.OWNER,
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

// Przełącza aktywne stowarzyszenie po weryfikacji członkostwa.
export async function setActiveOrganization(organizationId: string) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: { userId: session.user.id, organizationId },
    },
  });
  if (!membership) {
    throw new Error("Brak dostępu do tego stowarzyszenia.");
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { activeOrganizationId: organizationId },
  });

  revalidatePath("/", "layout");
}
