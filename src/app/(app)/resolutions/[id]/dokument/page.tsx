import { notFound, redirect } from "next/navigation";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { RESOLUTION_STATUS_LABELS, tallyVotes } from "@/lib/resolutions";
import { ProtocolPrintBar } from "@/components/protocol-print-bar";
import { OrgDocumentIdentity } from "@/components/org-document-identity";

const dateFmt = new Intl.DateTimeFormat("pl-PL", { dateStyle: "long" });

const VOTE_LABEL = {
  FOR: "Za",
  AGAINST: "Przeciw",
  ABSTAIN: "Wstrzymał(a) się",
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

  const resolution = await prisma.resolution.findFirst({
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
        },
      },
      votes: {
        orderBy: { createdAt: "asc" },
        select: {
          choice: true,
          member: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!resolution) notFound();

  // Dokument dostępny dopiero po zamknięciu głosowania (uchwała rozstrzygnięta).
  if (resolution.status !== "PASSED" && resolution.status !== "REJECTED") {
    redirect(`/resolutions/${id}`);
  }

  const tally = tallyVotes(resolution.votes);
  const date = resolution.decidedAt ?? resolution.openedAt;

  return (
    <div className="bg-background pb-16">
      <ProtocolPrintBar backHref={`/resolutions/${resolution.id}`} />

      <div className="mx-auto max-w-3xl space-y-7 rounded-xl border bg-white p-8 text-[13px] leading-relaxed text-foreground print:border-0 print:p-0 sm:p-12">
        <header className="border-b pb-5 text-center">
          <OrgDocumentIdentity org={resolution.organization} />
          <h1 className="mt-3 font-heading text-2xl font-extrabold tracking-tight">
            Uchwała nr {resolution.number}
          </h1>
          {date ? (
            <div className="mt-1 text-sm text-muted-foreground">
              z dnia {dateFmt.format(date)}
            </div>
          ) : null}
          <div className="mt-3 text-base font-bold">{resolution.title}</div>
        </header>

        {resolution.content ? (
          <section className="whitespace-pre-wrap">{resolution.content}</section>
        ) : (
          <section className="text-muted-foreground">
            (Brak treści uchwały.)
          </section>
        )}

        <section className="border-t pt-5">
          <h2 className="mb-2 font-heading text-sm font-bold uppercase tracking-wide">
            Wynik głosowania
          </h2>
          <p className="mb-1 text-muted-foreground">
            Tryb głosowania:{" "}
            {resolution.secretBallot ? "tajne" : "jawne"}.
          </p>
          <p>
            Za: {tally.FOR}, przeciw: {tally.AGAINST}, wstrzymujących się:{" "}
            {tally.ABSTAIN}.{" "}
            <strong>
              Uchwała {RESOLUTION_STATUS_LABELS[resolution.status].toLowerCase()}.
            </strong>
          </p>

          {!resolution.secretBallot && resolution.votes.length > 0 ? (
            <table className="mt-4 w-full border-collapse">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="w-8 py-1.5 font-semibold">Lp.</th>
                  <th className="py-1.5 font-semibold">Imię i nazwisko</th>
                  <th className="py-1.5 text-right font-semibold">Głos</th>
                </tr>
              </thead>
              <tbody>
                {resolution.votes.map((v, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1.5 text-muted-foreground">{i + 1}.</td>
                    <td className="py-1.5 font-medium">
                      {v.member.firstName} {v.member.lastName ?? ""}
                    </td>
                    <td className="py-1.5 text-right">{VOTE_LABEL[v.choice]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>

        <section className="grid grid-cols-2 gap-10 pt-10">
          <Signature label="Przewodniczący zebrania" />
          <Signature label="Protokolant" />
        </section>
      </div>
    </div>
  );
}

function Signature({ label }: { label: string }) {
  return (
    <div className="text-center">
      <div className="mb-1 h-12 border-b border-dashed" />
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
