import type { Prisma } from "@/generated/prisma/client";
import { summarizeFees, type FeeCycleStatus } from "@/lib/fees";
import { formatFeeDueDate } from "@/lib/payments";
import { formatPLN } from "@/lib/money";
import { parseCustomData } from "@/lib/links";
import { PayFeeButton } from "@/components/pay-fee-button";

// Wspólny select członka dla widoku profilu — używany przez „Mój profil" (własny)
// oraz szczegóły członka w panelu (/members/[id]), by oba widoki były spójne.
export const memberProfileSelect = {
  firstName: true,
  lastName: true,
  email: true,
  birthDate: true,
  phone: true,
  address: true,
  customData: true,
  joinedAt: true,
  role: { select: { name: true, feeExempt: true } },
  paymentTier: { select: { label: true, amount: true } },
  membershipFees: { select: { year: true, amount: true } },
} satisfies Prisma.MemberSelect;

export type MemberProfileData = Prisma.MemberGetPayload<{
  select: typeof memberProfileSelect;
}>;

export type MemberProfileOrg = {
  membershipPaid: boolean;
  feeDueMonth: number | null;
  feeDueDay: number | null;
  foundedYear: number | null;
} | null;

const dateFmt = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function initials(firstName: string, lastName: string | null): string {
  const a = firstName.trim()[0] ?? "";
  const b = lastName?.trim()[0] ?? "";
  return (a + b || a || "?").toUpperCase();
}

// Etykieta + kolorystyka statusu składki za dany rok (paleta z projektu).
const STATUS_BADGE: Record<
  Exclude<FeeCycleStatus, "NA">,
  { label: string; className: string; dot: string }
> = {
  PAID: {
    label: "Opłacona",
    className: "text-[#2f7d4f] bg-[#e7f1ea]",
    dot: "bg-[#3a9b62]",
  },
  OVERDUE: {
    label: "Zaległa",
    className: "text-destructive bg-[#f7e6e4]",
    dot: "bg-[#d3614f]",
  },
  PENDING: {
    label: "Oczekuje",
    className: "text-[#b5731a] bg-[#fbf0df]",
    dot: "bg-[#e0a64d]",
  },
};

// Karta profilu członka — hero, dane osobowe, pola dodatkowe i składki.
// Prezentacyjny komponent serwerowy: dane pobiera strona, tu tylko liczymy i renderujemy.
export function MemberProfile({
  member,
  org,
  payable = false,
}: {
  member: MemberProfileData;
  org: MemberProfileOrg;
  // Czy pokazać przycisk samodzielnego opłacenia składki online. Włączane tylko
  // na widoku własnego profilu — w panelu skarbnika (/members/[id]) pozostaje off.
  payable?: boolean;
}) {
  const now = new Date();
  const fullName = [member.firstName, member.lastName].filter(Boolean).join(" ");

  // Dane osobowe — pomijamy puste pola opcjonalne (telefon/adres/data urodzenia).
  const details: { label: string; value: string; mono?: boolean }[] = [
    { label: "Imię i nazwisko", value: fullName },
    { label: "Adres e-mail", value: member.email },
    ...(member.phone
      ? [{ label: "Telefon", value: member.phone, mono: true }]
      : []),
    ...(member.birthDate
      ? [
          {
            label: "Data urodzenia",
            value: dateFmt.format(member.birthDate),
            mono: true,
          },
        ]
      : []),
    ...(member.address ? [{ label: "Adres", value: member.address }] : []),
    { label: "Funkcja", value: member.role.name },
  ];

  const customFields = parseCustomData(member.customData);

  // Składki członka — tylko gdy członkostwo jest płatne.
  const feeResult = org?.membershipPaid
    ? summarizeFees([{ ...member, feeExempt: member.role.feeExempt }], {
        feeDueMonth: org.feeDueMonth,
        feeDueDay: org.feeDueDay,
        foundedYear: org.foundedYear,
        now,
      }).results[0]
    : null;
  const isExempt = feeResult?.currentStatus === "EXEMPT";

  const paidByYear = new Map(member.membershipFees.map((f) => [f.year, f.amount]));
  const dueDate = formatFeeDueDate(org?.feeDueMonth, org?.feeDueDay);

  // Wiersze historii składek — pomijamy okresy sprzed wstąpienia/założenia (NA).
  const dues = feeResult
    ? feeResult.cycles
        .filter((c) => c.status !== "NA")
        .map((c) => {
          const paidAmount = paidByYear.get(c.year);
          const amount =
            c.status === "PAID"
              ? (paidAmount ?? feeResult.feeAmount)
              : feeResult.feeAmount;
          return {
            year: c.year,
            status: c.status as Exclude<FeeCycleStatus, "NA">,
            amount,
            // Termin opłacenia składki za dany rok (dd.mm.rrrr) z konfiguracji.
            due:
              org?.feeDueMonth && org?.feeDueDay
                ? dateFmt.format(
                    new Date(c.year, org.feeDueMonth - 1, org.feeDueDay),
                  )
                : "—",
          };
        })
        .reverse() // najnowszy okres na górze
    : [];

  return (
    <>
      {/* hero profilu */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="relative h-24 overflow-hidden bg-brand">
          <div className="absolute -top-16 right-10 size-52 rounded-full border border-[#5b87ff]/20" />
          <div className="absolute -top-7 right-28 size-32 rounded-full border border-white/10" />
        </div>
        <div className="relative flex flex-wrap items-start gap-5 px-7 pb-6 pt-3.5">
          <div className="-mt-14 flex size-24 shrink-0 items-center justify-center rounded-[22px] border-4 border-card bg-primary font-heading text-3xl font-extrabold text-primary-foreground">
            {initials(member.firstName, member.lastName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-heading text-2xl font-extrabold tracking-tight">
                {fullName}
              </h1>
              <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                {member.role.name}
              </span>
              <span className="rounded-full bg-[#e7f1ea] px-2.5 py-1 text-xs font-semibold text-[#2f7d4f]">
                Członek aktywny
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>Członek od {dateFmt.format(member.joinedAt)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.45fr]">
        {/* LEWA KOLUMNA */}
        <div className="flex flex-col gap-5">
          {/* dane osobowe */}
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="border-b px-5 py-4">
              <h3 className="font-heading text-base font-bold">Dane osobowe</h3>
            </div>
            <div className="px-5 py-1">
              {details.map((d) => (
                <div
                  key={d.label}
                  className="flex items-baseline justify-between gap-4 border-b border-border/60 py-3 last:border-0"
                >
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {d.label}
                  </span>
                  <span
                    className={`text-right text-sm font-semibold text-secondary-foreground ${
                      d.mono ? "font-mono" : ""
                    }`}
                  >
                    {d.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* pola dodatkowe (w miejsce „dodatkowych linków") */}
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="border-b px-5 py-4">
              <h3 className="font-heading text-base font-bold">
                Dodatkowe informacje
              </h3>
            </div>
            {customFields.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                Brak dodatkowych informacji.
              </p>
            ) : (
              <div className="flex flex-col gap-0.5 p-3">
                {customFields.map((f, i) => {
                  const inner = (
                    <>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent font-heading text-sm font-extrabold text-accent-foreground">
                        {f.label.trim().charAt(0).toUpperCase() || "•"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-muted-foreground">
                          {f.label}
                        </span>
                        <span className="block truncate text-sm font-semibold text-secondary-foreground">
                          {f.value}
                        </span>
                      </span>
                      {f.url ? (
                        <span className="shrink-0 text-muted-foreground">↗</span>
                      ) : null}
                    </>
                  );
                  return f.url ? (
                    <a
                      key={i}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-muted"
                    >
                      {inner}
                    </a>
                  ) : (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-2.5"
                    >
                      {inner}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* PRAWA KOLUMNA: SKŁADKI */}
        {feeResult ? (
          <div className="overflow-hidden rounded-xl border bg-card">
            {/* podsumowanie */}
            <div className="border-b px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-heading text-[17px] font-bold">
                    Składki
                  </h3>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {isExempt
                      ? "Twoja rola jest zwolniona ze składek"
                      : member.paymentTier
                        ? `${member.paymentTier.label} · ${formatPLN(member.paymentTier.amount)} / rok`
                        : "Składka nieprzypisana"}
                  </div>
                </div>
                {isExempt ? (
                  <div className="flex items-center gap-2 rounded-[10px] bg-[#f1f3f8] px-3.5 py-2">
                    <span className="text-sm font-bold text-[#56627d]">
                      Zwolniony ze składek
                    </span>
                  </div>
                ) : feeResult.currentStatus === "PAID" ? (
                  <div className="flex items-center gap-2 rounded-[10px] bg-[#e7f1ea] px-3.5 py-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-[#2f7d4f] text-xs font-bold text-white">
                      ✓
                    </span>
                    <span className="text-sm font-bold text-[#2f7d4f]">
                      Składki opłacone
                    </span>
                  </div>
                ) : feeResult.feeAmount != null ? (
                  <div className="text-right">
                    <div className="mb-0.5 text-[11px] font-bold tracking-wide text-destructive">
                      DO ZAPŁATY
                    </div>
                    <div className="font-heading text-2xl font-extrabold leading-none text-destructive">
                      {formatPLN(feeResult.feeAmount)}
                    </div>
                  </div>
                ) : null}
              </div>
              {feeResult.currentStatus !== "PAID" &&
              feeResult.feeAmount != null ? (
                payable ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <PayFeeButton amountLabel={formatPLN(feeResult.feeAmount)} />
                    <p className="text-xs text-muted-foreground">
                      Opłać składkę online{dueDate ? ` (termin do ${dueDate})` : ""} —
                      wpłata zostanie odnotowana automatycznie.
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Składkę uregulujesz przelewem na konto stowarzyszenia
                    {dueDate ? ` (termin do ${dueDate})` : ""}. Skarbnik odnotuje
                    wpłatę w rejestrze składek.
                  </p>
                )
              ) : null}
            </div>

            {/* historia składek (pomijana dla ról zwolnionych ze składek) */}
            {isExempt ? (
              <p className="px-6 py-6 text-sm text-muted-foreground">
                Członkowie z tą rolą nie opłacają składek, więc nie prowadzimy dla
                nich historii rozliczeń.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_90px_110px_84px] gap-3 border-b px-6 py-3 text-[11px] font-bold tracking-wide text-muted-foreground">
                  <span>OKRES</span>
                  <span>KWOTA</span>
                  <span>TERMIN</span>
                  <span className="text-right">STATUS</span>
                </div>
                {dues.map((d) => {
              const badge = STATUS_BADGE[d.status];
              return (
                <div
                  key={d.year}
                  className="grid grid-cols-[1fr_90px_110px_84px] items-center gap-3 border-b border-border/60 px-6 py-3.5 last:border-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`size-2.5 shrink-0 rounded-full ${badge.dot}`} />
                    <span className="truncate text-sm font-semibold text-secondary-foreground">
                      Składka {d.year}
                    </span>
                  </div>
                  <span className="font-mono text-[13px] text-secondary-foreground">
                    {d.amount != null ? formatPLN(d.amount) : "—"}
                  </span>
                  <span className="font-mono text-[13px] text-muted-foreground">
                    {d.due}
                  </span>
                  <div className="flex justify-end">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                </div>
              );
                })}
              </>
            )}
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-8 text-center">
            <h3 className="font-heading text-base font-bold">Składki</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Członkostwo jest obecnie bezpłatne — nie naliczamy składek.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
