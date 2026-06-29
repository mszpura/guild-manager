"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { getStripe, createFeeCheckoutSession } from "@/lib/stripe";
import { summarizeFees } from "@/lib/fees";
import { formatFeeDueDate } from "@/lib/payments";
import { formatPLN } from "@/lib/money";
import { sendFeeReminderEmail } from "@/lib/email";

// Oznacza składkę członka za dany rok jako opłaconą (paid=true) lub cofa to
// oznaczenie (paid=false). Wymaga MEMBERS WRITE — operacyjne zarządzanie składkami
// prowadzi skarbnik/zarząd. Organizacja ustalana z wpisu członka (tenant-scoped).
// Przy oznaczaniu zapisujemy migawkę kwoty wybranego progu (tierId) — w starszych
// okresach członek mógł mieć inną składkę niż obecnie przypisaną. Bez tierId bierzemy
// aktualnie przypisany próg.
export async function setFeePaid(
  memberId: string,
  year: number,
  paid: boolean,
  tierId?: string,
) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      organizationId: true,
      paymentTier: { select: { amount: true } },
    },
  });
  if (!member) throw new Error("Członek nie istnieje.");

  await requireMember(member.organizationId, "MEMBERS", "WRITE");

  if (!Number.isInteger(year)) throw new Error("Nieprawidłowy rok.");

  if (paid) {
    let amount = member.paymentTier?.amount ?? null;
    if (tierId) {
      const tier = await prisma.paymentTier.findUnique({
        where: { id: tierId },
        select: { organizationId: true, amount: true },
      });
      if (!tier || tier.organizationId !== member.organizationId) {
        throw new Error("Nieprawidłowa składka.");
      }
      amount = tier.amount;
    }
    await prisma.membershipFee.upsert({
      where: { memberId_year: { memberId, year } },
      create: { organizationId: member.organizationId, memberId, year, amount },
      update: { amount },
    });
  } else {
    await prisma.membershipFee.deleteMany({ where: { memberId, year } });
  }

  revalidatePath("/payments");
  revalidatePath("/dashboard");
}

// Przypisuje członkowi próg składki (lub czyści przypisanie, gdy tierId puste).
// Wymaga MEMBERS WRITE. Próg musi należeć do tego samego stowarzyszenia.
export async function setMemberTier(memberId: string, tierId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { organizationId: true },
  });
  if (!member) throw new Error("Członek nie istnieje.");

  await requireMember(member.organizationId, "MEMBERS", "WRITE");

  let nextTierId: string | null = null;
  if (tierId) {
    const tier = await prisma.paymentTier.findUnique({
      where: { id: tierId },
      select: { organizationId: true },
    });
    if (!tier || tier.organizationId !== member.organizationId) {
      throw new Error("Nieprawidłowa składka.");
    }
    nextTierId = tierId;
  }

  await prisma.member.update({
    where: { id: memberId },
    data: { paymentTierId: nextTierId },
  });
  revalidatePath("/payments");
  revalidatePath("/dashboard");
}

// Rozpoczyna samodzielne opłacenie bieżącej (zaległej/oczekującej) składki przez
// zalogowanego członka z poziomu „Mój profil". Liczy należny rok i kwotę z aktualnie
// przypisanego progu, tworzy sesję Stripe Checkout i przekierowuje do płatności.
// Faktyczne odnotowanie wpłaty robi webhook (bez udziału skarbnika). Zwraca komunikat
// błędu, gdy płatności nie da się rozpocząć; w razie powodzenia przerywa redirectem.
export async function startOwnFeePayment(): Promise<{ error: string } | undefined> {
  const data = await getActiveOrg();
  if (!data?.active) return { error: "Brak aktywnego stowarzyszenia." };
  const orgId = data.active.organizationId;

  // Tylko własna składka — wystarczy przynależność (bez dodatkowych uprawnień).
  const me = await requireMember(orgId);

  const [org, member] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        membershipPaid: true,
        feeDueMonth: true,
        feeDueDay: true,
        foundedYear: true,
      },
    }),
    prisma.member.findUnique({
      where: { id: me.id },
      select: {
        email: true,
        joinedAt: true,
        paymentTier: { select: { label: true, amount: true } },
        membershipFees: { select: { year: true, amount: true } },
      },
    }),
  ]);

  if (!org || !member) return { error: "Nie znaleziono danych członka." };
  if (!org.membershipPaid) return { error: "Członkostwo jest obecnie bezpłatne." };
  if (!getStripe()) {
    return {
      error: "Płatności nie są obecnie skonfigurowane. Skontaktuj się ze skarbnikiem.",
    };
  }
  if (!member.paymentTier) {
    return {
      error: "Składka nie została przypisana — skontaktuj się ze skarbnikiem.",
    };
  }

  // Należny rok = bieżący okres składkowy; pozwalamy płacić tylko gdy nieopłacony.
  const summary = summarizeFees([member], {
    feeDueMonth: org.feeDueMonth,
    feeDueDay: org.feeDueDay,
    foundedYear: org.foundedYear,
    now: new Date(),
  });
  const result = summary.results[0];
  if (result.currentStatus === "PAID") {
    return { error: "Bieżąca składka jest już opłacona." };
  }

  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = `${proto}://${host}`;

  const session = await createFeeCheckoutSession({
    amount: member.paymentTier.amount,
    label: member.paymentTier.label,
    email: member.email,
    organizationId: orgId,
    memberId: me.id,
    year: summary.year,
    successUrl: `${base}/profile?paid=1`,
    cancelUrl: `${base}/profile`,
  });

  if (!session) {
    return { error: "Nie udało się rozpocząć płatności. Spróbuj ponownie później." };
  }

  // redirect() rzuca wyjątkiem — musi być poza blokiem try/catch.
  redirect(session.url);
}

export type FeeRemindersResult =
  | { error: string }
  | { sent: number; failed: number; total: number };

// Wysyła zbiorowo przypomnienia e-mail do członków zalegających ze składką za
// bieżący rok (ten sam zbiór co karta „Zaległości": przypisany próg + nieopłacony
// bieżący okres). Wymaga MEMBERS WRITE — operacyjnie prowadzi to skarbnik/zarząd.
// Wysyłka jest miękka: zliczamy sukcesy i porażki, nie przerywamy na pojedynczym
// błędzie SMTP. Zwraca podsumowanie albo komunikat błędu.
export async function sendFeeReminders(
  organizationId: string,
): Promise<FeeRemindersResult> {
  await requireMember(organizationId, "MEMBERS", "WRITE");

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      name: true,
      membershipPaid: true,
      feeDueMonth: true,
      feeDueDay: true,
      foundedYear: true,
    },
  });
  if (!org) return { error: "Stowarzyszenie nie istnieje." };
  if (!org.membershipPaid) {
    return { error: "Członkostwo jest bezpłatne — nie naliczamy składek." };
  }

  const members = await prisma.member.findMany({
    where: { organizationId },
    select: {
      email: true,
      firstName: true,
      joinedAt: true,
      paymentTier: { select: { amount: true } },
      membershipFees: { select: { year: true, amount: true } },
    },
  });

  const summary = summarizeFees(members, {
    feeDueMonth: org.feeDueMonth,
    feeDueDay: org.feeDueDay,
    foundedYear: org.foundedYear,
    now: new Date(),
  });

  // Dłużnicy bieżącego roku: saldo ujemne (ma przypisaną składkę i jej nie opłacił).
  const debtors = summary.results.filter(
    (r) => r.saldo != null && r.saldo < 0 && r.feeAmount != null,
  );
  if (debtors.length === 0) return { sent: 0, failed: 0, total: 0 };

  const dueText = formatFeeDueDate(org.feeDueMonth, org.feeDueDay);
  const h = await headers();
  const host = h.get("host");
  const profileUrl = host
    ? `${h.get("x-forwarded-proto") ?? "http"}://${host}/profile`
    : null;

  let sent = 0;
  let failed = 0;
  for (const r of debtors) {
    const ok = await sendFeeReminderEmail({
      to: r.member.email,
      firstName: r.member.firstName,
      organizationName: org.name,
      year: summary.year,
      amountText: formatPLN(r.feeAmount!),
      dueText,
      profileUrl,
    });
    if (ok) sent++;
    else failed++;
  }

  return { sent, failed, total: debtors.length };
}

// Wysyła pojedyncze przypomnienie e-mail do wskazanego członka, gdy jego składka
// za bieżący rok jest nierozliczona. Wymaga MEMBERS WRITE. Zwraca ok albo komunikat.
export async function sendFeeReminder(
  memberId: string,
): Promise<{ ok: true } | { error: string }> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      organizationId: true,
      email: true,
      firstName: true,
      joinedAt: true,
      paymentTier: { select: { amount: true } },
      membershipFees: { select: { year: true, amount: true } },
      organization: {
        select: {
          name: true,
          membershipPaid: true,
          feeDueMonth: true,
          feeDueDay: true,
          foundedYear: true,
        },
      },
    },
  });
  if (!member) return { error: "Członek nie istnieje." };

  await requireMember(member.organizationId, "MEMBERS", "WRITE");

  const org = member.organization;
  if (!org.membershipPaid) {
    return { error: "Członkostwo jest bezpłatne — nie naliczamy składek." };
  }

  const summary = summarizeFees([member], {
    feeDueMonth: org.feeDueMonth,
    feeDueDay: org.feeDueDay,
    foundedYear: org.foundedYear,
    now: new Date(),
  });
  const result = summary.results[0];
  if (!(result.saldo != null && result.saldo < 0 && result.feeAmount != null)) {
    return { error: "Składka za bieżący rok jest już rozliczona." };
  }

  const h = await headers();
  const host = h.get("host");
  const profileUrl = host
    ? `${h.get("x-forwarded-proto") ?? "http"}://${host}/profile`
    : null;

  const ok = await sendFeeReminderEmail({
    to: member.email,
    firstName: member.firstName,
    organizationName: org.name,
    year: summary.year,
    amountText: formatPLN(result.feeAmount),
    dueText: formatFeeDueDate(org.feeDueMonth, org.feeDueDay),
    profileUrl,
  });

  return ok ? { ok: true } : { error: "Nie udało się wysłać przypomnienia." };
}
