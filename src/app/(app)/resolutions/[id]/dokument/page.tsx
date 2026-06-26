import { notFound, redirect } from "next/navigation";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { tallyVotes } from "@/lib/resolutions";
import { ProtocolPrintBar } from "@/components/protocol-print-bar";

const dateLongFmt = new Intl.DateTimeFormat("pl-PL", { dateStyle: "long" });
const dateNumFmt = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// Style znaczników (pigułek) głosu — spójne z paletą projektu.
const VOTE = {
  FOR: { label: "Za", className: "text-[#2f7d4f] bg-[#e7f1ea]" },
  AGAINST: { label: "Przeciw", className: "text-destructive bg-[#f7e6e4]" },
  ABSTAIN: { label: "Wstrzymał(a) się", className: "text-muted-foreground bg-secondary" },
} as const;

export default async function ResolutionDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const orgId = data.active.organizationId;

  await requireMember(orgId, "RESOLUTIONS", "READ");

  const [resolution, voters] = await Promise.all([
    prisma.resolution.findFirst({
      where: { id, organizationId: orgId },
      select: {
        id: true,
        number: true,
        title: true,
        content: true,
        status: true,
        secretBallot: true,
        openedAt: true,
        decidedAt: true,
        organization: {
          select: {
            name: true,
            street: true,
            postalCode: true,
            city: true,
            nip: true,
            regon: true,
            krs: true,
            contactEmail: true,
            phone: true,
          },
        },
        votes: {
          orderBy: { createdAt: "asc" },
          select: {
            choice: true,
            member: {
              select: {
                firstName: true,
                lastName: true,
                role: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    // Uprawnieni do głosowania = członkowie z dostępem WRITE do Uchwał (frekwencja).
    prisma.member.findMany({
      where: { organizationId: orgId },
      select: { role: { select: { isOwner: true, permissions: true } } },
    }),
  ]);
  if (!resolution) notFound();

  // Dokument dostępny dopiero po zamknięciu głosowania (uchwała rozstrzygnięta).
  if (resolution.status !== "PASSED" && resolution.status !== "REJECTED") {
    redirect(`/resolutions/${id}`);
  }

  const org = resolution.organization;
  const tally = tallyVotes(resolution.votes);
  const castCount = tally.FOR + tally.AGAINST + tally.ABSTAIN;
  const eligibleCount = voters.filter((m) =>
    can(m.role, "RESOLUTIONS", "WRITE"),
  ).length;
  const date = resolution.decidedAt ?? resolution.openedAt;
  const passed = resolution.status === "PASSED";
  const showVoters = !resolution.secretBallot && resolution.votes.length > 0;

  // Szerokości segmentów paska wyniku (udział w oddanych głosach).
  const pct = (n: number) => (castCount > 0 ? (n / castCount) * 100 : 0);

  // Dane adresowe / rejestrowe — pokazujemy tylko wypełnione.
  const addressLine = [
    org.street,
    [org.postalCode, org.city].filter(Boolean).join(" "),
  ]
    .filter((p) => p && p.trim().length > 0)
    .join(", ");
  const contactLine = [org.contactEmail, org.phone].filter(Boolean).join(" · ");
  const registry = [
    org.krs ? `KRS ${org.krs}` : null,
    org.nip ? `NIP ${org.nip}` : null,
    org.regon ? `REGON ${org.regon}` : null,
  ].filter(Boolean);

  return (
    <div className="bg-background pb-16">
      <ProtocolPrintBar
        backHref={`/resolutions/${resolution.id}`}
        backLabel="Wróć do uchwały"
      />

      {/* Arkusz A4 — wymuszamy wierne kolory także w wydruku. */}
      <div className="mx-auto max-w-3xl rounded-xl border bg-white p-8 text-[13px] leading-relaxed text-foreground shadow-sm [-webkit-print-color-adjust:exact] [print-color-adjust:exact] print:border-0 print:p-0 print:shadow-none sm:p-12">
        {/* Papier firmowy */}
        <header className="flex items-start justify-between gap-6 border-b-2 border-foreground pb-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex items-center">
              <span className="size-4 rounded-full border-[2.2px] border-foreground" />
              <span className="-ml-1.5 size-4 rounded-full border-[2.2px] border-primary" />
            </span>
            <div>
              <div className="font-heading text-base font-extrabold leading-tight tracking-tight text-foreground">
                {org.name}
              </div>
              {addressLine || contactLine ? (
                <div className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                  {addressLine ? <div>{addressLine}</div> : null}
                  {contactLine ? <div>{contactLine}</div> : null}
                </div>
              ) : null}
            </div>
          </div>
          {registry.length > 0 ? (
            <div className="shrink-0 text-right font-mono text-[10.5px] leading-relaxed text-muted-foreground">
              {registry.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          ) : null}
        </header>

        {/* Tytuł */}
        <div className="my-8 text-center">
          <div className="font-heading text-[27px] font-extrabold tracking-tight text-foreground">
            Uchwała nr {resolution.number}
          </div>
          {date ? (
            <div className="mt-2.5 text-[13px] text-muted-foreground">
              z dnia {dateLongFmt.format(date)} r.
            </div>
          ) : null}
          <div className="mx-auto mt-5 h-0.5 w-14 bg-primary" />
          <div className="mx-auto mt-4 max-w-md text-[14.5px] font-semibold leading-snug text-foreground">
            {resolution.title}
          </div>
        </div>

        {/* Treść uchwały */}
        {resolution.content ? (
          <section className="whitespace-pre-wrap text-justify text-[13px] leading-[1.72] text-foreground">
            {resolution.content}
          </section>
        ) : (
          <section className="text-muted-foreground">
            (Brak treści uchwały.)
          </section>
        )}

        {/* Wynik głosowania */}
        <section className="keep mt-8 overflow-hidden rounded-[10px] border border-border">
          <div className="flex items-center justify-between border-b border-border bg-secondary/60 px-4 py-2.5">
            <span className="font-heading text-[12.5px] font-bold text-foreground">
              Wynik głosowania
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                passed
                  ? "bg-[#e7f1ea] text-[#2f7d4f]"
                  : "bg-[#f7e6e4] text-destructive"
              }`}
            >
              {passed ? "Uchwałę przyjęto" : "Uchwałę odrzucono"}
            </span>
          </div>
          <div className="grid grid-cols-4">
            <Stat value={tally.FOR} label="Za" className="text-[#2f7d4f]" />
            <Stat
              value={tally.AGAINST}
              label="Przeciw"
              className="text-destructive"
            />
            <Stat
              value={tally.ABSTAIN}
              label="Wstrzymał się"
              className="text-muted-foreground"
            />
            <Stat
              value={`${castCount}/${eligibleCount}`}
              label="Frekwencja"
              className="text-foreground"
              last
            />
          </div>
          <div className="flex h-[7px]">
            <div className="bg-[#3a9b62]" style={{ width: `${pct(tally.FOR)}%` }} />
            <div
              className="bg-[#d3614f]"
              style={{ width: `${pct(tally.AGAINST)}%` }}
            />
            <div
              className="bg-[#b9c2d3]"
              style={{ width: `${pct(tally.ABSTAIN)}%` }}
            />
          </div>
        </section>

        {/* Lista głosujących — wyłącznie przy głosowaniu jawnym */}
        {resolution.secretBallot ? (
          <p className="mt-6 text-xs text-muted-foreground">
            Głosowanie tajne — imienna lista głosujących nie jest ujawniana.
          </p>
        ) : showVoters ? (
          <section className="mt-7">
            <div className="keep-next font-heading text-[13px] font-bold text-foreground">
              Lista głosujących
            </div>
            <div className="mb-3 text-[11px] text-muted-foreground">
              Głosowanie jawne · {castCount} z {eligibleCount} uprawnionych
              oddało głos
            </div>
            <table className="w-full border-collapse text-[11.5px]">
              <thead>
                <tr className="bg-brand text-left text-brand-foreground">
                  <th className="w-8 rounded-tl-md px-3 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">Imię i nazwisko</th>
                  <th className="px-3 py-2 font-semibold">Funkcja</th>
                  <th className="w-28 rounded-tr-md px-3 py-2 text-center font-semibold">
                    Głos
                  </th>
                </tr>
              </thead>
              <tbody>
                {resolution.votes.map((v, i) => (
                  <tr
                    key={i}
                    className="border-b border-[#eef1f7] last:border-0 odd:bg-[#fafbfd]"
                  >
                    <td className="px-3 py-1.5 font-mono text-[10.5px] text-muted-foreground">
                      {i + 1}
                    </td>
                    <td className="px-3 py-1.5 font-medium text-foreground">
                      {v.member.firstName} {v.member.lastName ?? ""}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {v.member.role.name}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold whitespace-nowrap ${VOTE[v.choice].className}`}
                      >
                        {VOTE[v.choice].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {/* Podpisy */}
        <section className="keep mt-12 grid grid-cols-2 gap-12 pt-2">
          <Signature label="Przewodniczący zebrania" />
          <Signature label="Protokolant" />
        </section>

        {/* Stopka */}
        <div className="mt-8 flex justify-between border-t border-[#eef1f7] pt-3 font-mono text-[9.5px] text-muted-foreground">
          <span>
            {org.name}
            {org.krs ? ` · KRS ${org.krs}` : ""}
          </span>
          <span>
            Uchwała nr {resolution.number}
            {date ? ` · ${dateNumFmt.format(date)}` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  className,
  last,
}: {
  value: React.ReactNode;
  label: string;
  className?: string;
  last?: boolean;
}) {
  return (
    <div className={`px-4 py-4 ${last ? "" : "border-r border-[#eef1f7]"}`}>
      <div
        className={`font-heading text-2xl font-extrabold leading-none ${className ?? ""}`}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Signature({ label }: { label: string }) {
  return (
    <div className="text-center">
      <div className="mb-1 h-12 border-b border-dashed border-foreground/40" />
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
