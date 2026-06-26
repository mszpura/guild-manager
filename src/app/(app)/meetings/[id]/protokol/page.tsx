import { notFound, redirect } from "next/navigation";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import {
  MEETING_TYPE_LABELS,
  QUORUM_THRESHOLD,
  hasQuorum,
} from "@/lib/meetings";
import { ProtocolPrintBar } from "@/components/protocol-print-bar";
import { OrgDocumentIdentity } from "@/components/org-document-identity";

const dateFmt = new Intl.DateTimeFormat("pl-PL", { dateStyle: "long" });
const timeFmt = new Intl.DateTimeFormat("pl-PL", {
  hour: "2-digit",
  minute: "2-digit",
});

const STATUS_LABEL = {
  APPROVED: "Przyjęty",
  REJECTED: "Odrzucony",
  PENDING: "Nierozpatrzony",
} as const;

export default async function MeetingProtocolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const orgId = data.active.organizationId;

  await requireMember(orgId, "MEETINGS", "READ");

  const meeting = await prisma.meeting.findFirst({
    where: { id, organizationId: orgId },
    select: {
      id: true,
      title: true,
      type: true,
      startsAt: true,
      endedAt: true,
      location: true,
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
          logoUrl: true,
        },
      },
      allowedRoles: { select: { role: { select: { id: true } } } },
      agendaItems: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          votable: true,
          votes: { select: { choice: true } },
        },
      },
      attendances: { select: { memberId: true, present: true } },
    },
  });
  if (!meeting) notFound();

  // Protokół dostępny wyłącznie po zakończeniu spotkania.
  if (meeting.endedAt === null) redirect(`/meetings/${id}`);

  const allowedRoleIds = meeting.allowedRoles.map((r) => r.role.id);
  const members = await prisma.member.findMany({
    where: {
      organizationId: orgId,
      ...(allowedRoleIds.length ? { roleId: { in: allowedRoleIds } } : {}),
    },
    orderBy: [
      { role: { isOwner: "desc" } },
      { lastName: "asc" },
      { firstName: "asc" },
    ],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: { select: { name: true } },
    },
  });

  const presentMap = new Map(meeting.attendances.map((a) => [a.memberId, a.present]));
  const attendees = members.map((m) => ({
    ...m,
    present: presentMap.get(m.id) ?? false,
  }));
  const attTotal = attendees.length;
  const presentCount = attendees.filter((a) => a.present).length;
  const quorumPct = attTotal > 0 ? Math.round((presentCount / attTotal) * 100) : 0;
  const quorumOk = hasQuorum(presentCount, attTotal);

  return (
    <div className="bg-background pb-16">
      <ProtocolPrintBar backHref={`/meetings/${meeting.id}`} />

      {/* arkusz protokołu */}
      <div className="mx-auto max-w-3xl space-y-7 rounded-xl border bg-white p-8 text-[13px] leading-relaxed text-foreground print:border-0 print:p-0 sm:p-12">
        {/* nagłówek */}
        <header className="border-b pb-5 text-center">
          <OrgDocumentIdentity org={meeting.organization} />
          <h1 className="mt-3 font-heading text-2xl font-extrabold tracking-tight">
            Protokół
          </h1>
          <div className="mt-1 text-sm text-muted-foreground">
            {MEETING_TYPE_LABELS[meeting.type]}
          </div>
          <div className="mt-2 text-base font-bold">{meeting.title}</div>
        </header>

        {/* metryczka */}
        <section className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
          <Meta label="Data">{dateFmt.format(meeting.startsAt)}</Meta>
          <Meta label="Miejsce">{meeting.location ?? "—"}</Meta>
          <Meta label="Rozpoczęcie">{timeFmt.format(meeting.startsAt)}</Meta>
          <Meta label="Zakończenie">{timeFmt.format(meeting.endedAt)}</Meta>
        </section>

        {/* frekwencja */}
        <section>
          <SectionTitle>Frekwencja i kworum</SectionTitle>
          <p>
            Obecnych {presentCount} z {attTotal} uprawnionych do udziału (
            {quorumPct}%).{" "}
            <strong>
              {quorumOk
                ? `Kworum spełnione (próg ${QUORUM_THRESHOLD}%).`
                : `Kworum niespełnione (próg ${QUORUM_THRESHOLD}%).`}
            </strong>
          </p>
        </section>

        {/* lista obecności */}
        <section>
          <SectionTitle>Lista obecności</SectionTitle>
          {attendees.length === 0 ? (
            <p className="text-muted-foreground">Brak uprawnionych członków.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="w-8 py-1.5 font-semibold">Lp.</th>
                  <th className="py-1.5 font-semibold">Imię i nazwisko</th>
                  <th className="py-1.5 font-semibold">Rola</th>
                  <th className="py-1.5 text-right font-semibold">Obecność</th>
                </tr>
              </thead>
              <tbody>
                {attendees.map((p, i) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-1.5 text-muted-foreground">{i + 1}.</td>
                    <td className="py-1.5 font-medium">
                      {p.firstName} {p.lastName ?? ""}
                    </td>
                    <td className="py-1.5 text-muted-foreground">{p.role.name}</td>
                    <td className="py-1.5 text-right">
                      {p.present ? "Obecny/a" : "Nieobecny/a"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* porządek obrad i decyzje */}
        <section>
          <SectionTitle>Porządek obrad i podjęte decyzje</SectionTitle>
          {meeting.agendaItems.length === 0 ? (
            <p className="text-muted-foreground">Brak punktów porządku obrad.</p>
          ) : (
            <ol className="space-y-4">
              {meeting.agendaItems.map((item, i) => {
                const za = item.votes.filter((v) => v.choice === "FOR").length;
                const przeciw = item.votes.filter(
                  (v) => v.choice === "AGAINST",
                ).length;
                const wstrzym = item.votes.filter(
                  (v) => v.choice === "ABSTAIN",
                ).length;
                return (
                  <li key={item.id} className="break-inside-avoid">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-bold">
                        {i + 1}. {item.title}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                        {STATUS_LABEL[item.status]}
                      </span>
                    </div>
                    {item.description ? (
                      <p className="mt-0.5 text-muted-foreground">
                        {item.description}
                      </p>
                    ) : null}
                    {item.votable ? (
                      <p className="mt-1 text-muted-foreground">
                        Głosowanie — za: {za}, przeciw: {przeciw}, wstrzymujących
                        się: {wstrzym}.
                      </p>
                    ) : (
                      <p className="mt-1 text-muted-foreground">
                        Punkt informacyjny — bez głosowania.
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* podpisy */}
        <section className="grid grid-cols-2 gap-10 pt-10">
          <Signature label="Przewodniczący zebrania" />
          <Signature label="Protokolant" />
        </section>
      </div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold text-muted-foreground">{label}:</span>
      <span>{children}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 border-b pb-1 font-heading text-sm font-bold uppercase tracking-wide">
      {children}
    </h2>
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
