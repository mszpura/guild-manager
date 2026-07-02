import { redirect } from "next/navigation";
import Link from "next/link";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import {
  RESOLUTION_STATUS_LABELS,
  RESOLUTION_STATUS_BADGE,
  tallyVotes,
  voteSummary,
} from "@/lib/resolutions";
import { ResolutionFormDialog } from "@/components/resolution-form-dialog";
import type { ResolutionStatus, Prisma } from "@/generated/prisma/client";

const dateFmt = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// Filtry statusu (zakładki). „Wszystkie" obejmuje też odrzucone.
const FILTERS: { key: string; label: string; status?: ResolutionStatus }[] = [
  { key: "all", label: "Wszystkie" },
  { key: "passed", label: "Przyjęte", status: "PASSED" },
  { key: "voting", label: "W głosowaniu", status: "VOTING" },
  { key: "draft", label: "Szkice", status: "DRAFT" },
];

const GRID = "grid-cols-[70px_1fr_96px_minmax(170px,1fr)_120px_110px]";

export default async function ResolutionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const activeFilter = FILTERS.find((f) => f.key === sp.status) ?? FILTERS[0];
  const query = (sp.q ?? "").trim();

  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const orgId = data.active.organizationId;

  const me = await requireMember(orgId, "RESOLUTIONS", "READ");
  const isManager = can(me.role, "RESOLUTIONS", "WRITE");

  const where: Prisma.ResolutionWhereInput = {
    organizationId: orgId,
    ...(activeFilter.status ? { status: activeFilter.status } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { number: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, members, counts, resolutionTypes] = await Promise.all([
    prisma.resolution.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        openedAt: true,
        decidedAt: true,
        decidedEligibleCount: true,
        votes: { select: { choice: true } },
        // Uchwały głosowane na spotkaniu mają głosy na punkcie porządku obrad —
        // wynik pokazujemy po zakończeniu spotkania (gdy punkt poddano głosowaniu).
        agendaItem: {
          select: {
            meeting: {
              select: {
                endedAt: true,
                meetingType: { select: { roles: { select: { roleId: true } } } },
              },
            },
            votes: { select: { choice: true } },
          },
        },
      },
    }),
    prisma.member.findMany({
      where: { organizationId: orgId },
      select: {
        roleId: true,
        role: { select: { isOwner: true, permissions: true, canVote: true } },
      },
    }),
    prisma.resolution.groupBy({
      by: ["status"],
      where: { organizationId: orgId },
      _count: true,
    }),
    prisma.resolutionType.findMany({
      where: { organizationId: orgId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        voteThreshold: true,
        requiresMeeting: true,
      },
    }),
  ]);

  // Uprawnieni do głosowania online (dostęp do Uchwał co najmniej READ + prawo
  // głosu) — mianownik paska wyniku dla uchwał głosowanych online.
  const onlineEligibleCount = members.filter(
    (m) => can(m.role, "RESOLUTIONS", "READ") && m.role.canVote,
  ).length;
  // Liczba uprawnionych do głosowania na spotkaniu danego typu (rola z prawem
  // głosu i dopuszczona przez typ; pusta lista ról = wszyscy głosujący członkowie).
  const meetingEligibleCount = (allowedRoleIds: string[]) =>
    members.filter(
      (m) =>
        m.role.canVote &&
        (allowedRoleIds.length === 0 || allowedRoleIds.includes(m.roleId)),
    ).length;

  const countByStatus = (s: ResolutionStatus) =>
    counts.find((c) => c.status === s)?._count ?? 0;
  const total = counts.reduce((sum, c) => sum + c._count, 0);
  const cnt: Record<string, number> = {
    all: total,
    passed: countByStatus("PASSED"),
    voting: countByStatus("VOTING"),
    draft: countByStatus("DRAFT"),
  };

  function filterHref(key: string) {
    const p = new URLSearchParams();
    if (key !== "all") p.set("status", key);
    if (query) p.set("q", query);
    const qs = p.toString();
    return qs ? `/resolutions?${qs}` : "/resolutions";
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* nagłówek */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Uchwały</h1>
          <p className="text-sm text-muted-foreground">
            Rejestr uchwał walnego zebrania i zarządu.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form className="hidden sm:block">
            {sp.status ? (
              <input type="hidden" name="status" value={sp.status} />
            ) : null}
            <input
              name="q"
              defaultValue={query}
              placeholder="Szukaj uchwały…"
              className="h-9 w-56 rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </form>
          {isManager ? (
            <ResolutionFormDialog
              organizationId={orgId}
              resolutionTypes={resolutionTypes}
            />
          ) : null}
        </div>
      </div>

      {/* filtry statusu */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = f.key === activeFilter.key;
          return (
            <Link
              key={f.key}
              href={filterHref(f.key)}
              className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? "border-brand bg-brand text-brand-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-input hover:text-foreground"
              }`}
            >
              {f.label}
              <span
                className={`text-xs font-bold ${active ? "text-white/60" : "text-muted-foreground/70"}`}
              >
                {cnt[f.key]}
              </span>
            </Link>
          );
        })}
      </div>

      {/* tabela */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div
              className={`grid ${GRID} gap-3.5 border-b px-5 py-3 text-[11px] font-bold tracking-wide text-muted-foreground`}
            >
              <span>NR</span>
              <span>TYTUŁ</span>
              <span>DATA</span>
              <span>WYNIK GŁOSOWANIA</span>
              <span>STATUS</span>
              <span className="text-right">DOKUMENT</span>
            </div>

            {rows.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-muted-foreground">
                Brak uchwał w tej kategorii.
              </p>
            ) : (
              rows.map((r) => {
                // Wynik (pasek i data) ujawniamy po rozstrzygnięciu. Uchwała na
                // spotkaniu ma głosy na punkcie porządku obrad; online — własne.
                const meetingItem = r.agendaItem;
                const decided = r.status === "PASSED" || r.status === "REJECTED";
                const barVotes = meetingItem ? meetingItem.votes : r.votes;
                const revealBar = meetingItem ? decided : r.status !== "DRAFT";
                // Mianownik paska = liczba uprawnionych (spójnie z progiem/wynikiem).
                // Po rozstrzygnięciu bierzemy zamrożoną migawkę z chwili zamknięcia,
                // aby późniejsze zmiany członkostwa nie zmieniały paska wstecznie
                // (fallback do liczby bieżącej dla uchwał sprzed jej wprowadzenia).
                const eligibleCount =
                  decided && r.decidedEligibleCount != null
                    ? r.decidedEligibleCount
                    : meetingItem
                      ? meetingEligibleCount(
                          meetingItem.meeting.meetingType.roles.map(
                            (x) => x.roleId,
                          ),
                        )
                      : onlineEligibleCount;
                const date = meetingItem
                  ? decided
                    ? (r.decidedAt ?? meetingItem.meeting.endedAt)
                    : null
                  : r.status === "DRAFT"
                    ? null
                    : (r.decidedAt ?? r.openedAt);
                return (
                  <div
                    key={r.id}
                    className={`group relative grid ${GRID} items-center gap-3.5 border-b px-5 py-4 transition-colors last:border-0 hover:bg-muted/40`}
                  >
                    <Link
                      href={`/resolutions/${r.id}`}
                      aria-label={`Uchwała ${r.number}`}
                      className="absolute inset-0"
                    />
                    <span className="font-mono text-xs text-muted-foreground">
                      {r.number}
                    </span>
                    <span className="truncate pr-2 text-sm font-semibold group-hover:text-primary">
                      {r.title}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {date ? dateFmt.format(date) : "—"}
                    </span>
                    <VoteCell
                      votes={barVotes}
                      eligibleCount={eligibleCount}
                      hasVote={revealBar}
                    />
                    <span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${RESOLUTION_STATUS_BADGE[r.status]}`}
                      >
                        {r.status === "AWAITING_MEETING"
                          ? "Oczekuje"
                          : RESOLUTION_STATUS_LABELS[r.status]}
                      </span>
                    </span>
                    <div className="flex justify-end">
                      {r.status !== "PASSED" && r.status !== "REJECTED" ? (
                        <span className="text-xs italic text-muted-foreground/70">
                          {r.status === "VOTING" ? "w głosowaniu" : "w opracowaniu"}
                        </span>
                      ) : (
                        <Link
                          href={`/resolutions/${r.id}/dokument`}
                          className="relative z-10 rounded-md border px-3 py-1.5 text-xs font-semibold hover:border-primary hover:text-primary"
                        >
                          PDF
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function VoteCell({
  votes,
  eligibleCount,
  hasVote,
}: {
  votes: { choice: "FOR" | "AGAINST" | "ABSTAIN" }[];
  // Liczba uprawnionych do głosowania — mianownik proporcji na pasku.
  eligibleCount: number;
  hasVote: boolean;
}) {
  if (!hasVote || votes.length === 0) {
    return <span className="text-xs text-muted-foreground/60">—</span>;
  }
  const t = tallyVotes(votes);
  const base = Math.max(eligibleCount, t.FOR + t.AGAINST + t.ABSTAIN, 1);
  const pct = (n: number) => `${(n / base) * 100}%`;
  return (
    <div>
      <div className="mb-1.5 flex h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-emerald-600" style={{ width: pct(t.FOR) }} />
        <div className="h-full bg-destructive" style={{ width: pct(t.AGAINST) }} />
        <div className="h-full bg-slate-400" style={{ width: pct(t.ABSTAIN) }} />
      </div>
      <div className="whitespace-nowrap text-[11px] text-muted-foreground">
        {voteSummary(t)}
      </div>
    </div>
  );
}
