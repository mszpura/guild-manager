import { redirect } from "next/navigation";
import Link from "next/link";
import { getActiveOrg } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import {
  MEETING_TYPE_LABELS,
  attendableWhere,
  relativeDays,
} from "@/lib/meetings";
import {
  RESOLUTION_STATUS_LABELS,
  RESOLUTION_STATUS_BADGE,
} from "@/lib/resolutions";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const dateFmt = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" });
const fullDateFmt = new Intl.DateTimeFormat("pl-PL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const meetingDateFmt = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("pl-PL", {
  hour: "2-digit",
  minute: "2-digit",
});

export default async function DashboardPage() {
  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const orgId = data.active.organizationId;
  const role = data.active.role;
  const canMembers = can(role, "MEMBERS", "READ");
  const canMeetings = can(role, "MEETINGS", "READ");
  const canResolutions = can(role, "RESOLUTIONS", "READ");

  const now = new Date();

  const [
    org,
    memberCount,
    recentMembers,
    upcomingMeetings,
    passedResolutions,
    lastResolution,
    recentResolutions,
  ] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, krs: true },
    }),
    prisma.member.count({ where: { organizationId: orgId } }),
    canMembers
      ? prisma.member.findMany({
          where: { organizationId: orgId },
          include: { role: { select: { name: true, isOwner: true } } },
          orderBy: { joinedAt: "desc" },
          take: 6,
        })
      : Promise.resolve([]),
    // Nadchodzące spotkania, w których ten członek może wziąć udział
    // (rola na liście lub spotkanie otwarte dla wszystkich).
    prisma.meeting.findMany({
      where: {
        organizationId: orgId,
        startsAt: { gte: now },
        ...attendableWhere(role.id),
      },
      orderBy: { startsAt: "asc" },
      take: 3,
      select: {
        id: true,
        title: true,
        type: true,
        startsAt: true,
        location: true,
        agendaItems: {
          select: { id: true, title: true },
          orderBy: { order: "asc" },
          take: 3,
        },
      },
    }),
    prisma.resolution.count({
      where: { organizationId: orgId, status: "PASSED" },
    }),
    prisma.resolution.findFirst({
      where: { organizationId: orgId, status: "PASSED" },
      orderBy: { decidedAt: "desc" },
      select: { decidedAt: true },
    }),
    canResolutions
      ? prisma.resolution.findMany({
          where: { organizationId: orgId },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            number: true,
            title: true,
            status: true,
            openedAt: true,
            decidedAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const nextMeeting = upcomingMeetings[0];
  const today = fullDateFmt.format(new Date());
  const todayCap = today.charAt(0).toUpperCase() + today.slice(1);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* nagłówek */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Pulpit</h1>
          <p className="text-sm text-muted-foreground">
            {org?.name}
            {org?.krs ? ` · KRS ${org.krs}` : ""}
          </p>
        </div>
        <div className="font-mono text-xs text-muted-foreground">{todayCap}</div>
      </div>

      {/* karty statystyk */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/members"
          className="rounded-xl border bg-card p-5 transition-colors hover:border-primary/50"
        >
          <StatLabel>CZŁONKOWIE</StatLabel>
          <div className="font-heading text-3xl font-extrabold leading-none">
            {memberCount}
          </div>
          <div className="mt-2 text-xs font-medium text-muted-foreground">
            Łącznie w stowarzyszeniu
          </div>
        </Link>

        <ResolutionsStat
          canResolutions={canResolutions}
          passed={passedResolutions}
          lastDecidedAt={lastResolution?.decidedAt ?? null}
        />

        <div className="rounded-xl border bg-card p-5">
          <StatLabel>
            OPŁACONE SKŁADKI <Demo />
          </StatLabel>
          <div className="font-heading text-3xl font-extrabold leading-none">
            98%
          </div>
          <div className="mt-2 text-xs font-medium text-destructive">
            3 zaległości
          </div>
        </div>

        <Link
          href="/meetings"
          className="block rounded-xl bg-brand p-5 text-brand-foreground transition-opacity hover:opacity-95"
        >
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-[0.04em] text-white/60">
            NAJBLIŻSZE SPOTKANIE
          </div>
          {nextMeeting ? (
            <>
              <div className="font-heading text-lg font-extrabold leading-tight">
                {MEETING_TYPE_LABELS[nextMeeting.type]}
              </div>
              <div className="mt-2 text-xs font-medium text-white/70">
                {relativeDays(nextMeeting.startsAt, now)} ·{" "}
                {meetingDateFmt.format(nextMeeting.startsAt)}
              </div>
            </>
          ) : (
            <>
              <div className="font-heading text-lg font-extrabold leading-tight">
                Brak
              </div>
              <div className="mt-2 text-xs font-medium text-white/70">
                Nic nie zaplanowano
              </div>
            </>
          )}
        </Link>
      </div>

      {/* dwie kolumny */}
      <div className="grid items-start gap-5 lg:grid-cols-[1.7fr_1fr]">
        {/* lewa: ostatnie uchwały + lista członków */}
        <div className="flex flex-col gap-5">
        {canResolutions ? (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="font-heading text-base font-bold">
                Ostatnie uchwały
              </h3>
              <Link
                href="/resolutions"
                className="text-sm font-semibold text-primary"
              >
                Zobacz wszystkie →
              </Link>
            </div>
            {recentResolutions.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Brak uchwał.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>NR</TableHead>
                    <TableHead>Tytuł</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentResolutions.map((r) => {
                    const date =
                      r.status === "DRAFT" ? null : (r.decidedAt ?? r.openedAt);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {r.number}
                        </TableCell>
                        <TableCell className="font-medium">
                          <Link
                            href={`/resolutions/${r.id}`}
                            className="hover:text-primary"
                          >
                            {r.title}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {date ? dateFmt.format(date) : "—"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${RESOLUTION_STATUS_BADGE[r.status]}`}
                          >
                            {RESOLUTION_STATUS_LABELS[r.status]}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        ) : null}

        {/* realna lista członków */}
        {canMembers ? (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="font-heading text-base font-bold">
                Ostatni członkowie
              </h3>
              <Link
                href="/members"
                className="text-sm font-semibold text-primary"
              >
                Zobacz wszystkich →
              </Link>
            </div>
            {recentMembers.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Brak członków.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Imię i nazwisko</TableHead>
                    <TableHead>Rola</TableHead>
                    <TableHead>Dołączył(a)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentMembers.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        {m.firstName} {m.lastName ?? ""}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={m.role.isOwner ? "default" : "secondary"}
                        >
                          {m.role.name}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {dateFmt.format(m.joinedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        ) : null}
        </div>

        {/* prawa: widgety przykładowe */}
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-heading text-base font-bold">
                Nadchodzące spotkania
              </h3>
              <Link
                href="/meetings"
                className="text-sm font-semibold text-primary"
              >
                Wszystkie →
              </Link>
            </div>
            {upcomingMeetings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Brak zaplanowanych spotkań.
              </p>
            ) : (
              <ul className="space-y-4">
                {upcomingMeetings.map((m) => (
                  <li key={m.id} className="border-b pb-4 last:border-0 last:pb-0">
                    {canMeetings ? (
                      <Link
                        href={`/meetings/${m.id}`}
                        className="text-sm font-semibold hover:text-primary"
                      >
                        {m.title}
                      </Link>
                    ) : (
                      <div className="text-sm font-semibold">{m.title}</div>
                    )}
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      {meetingDateFmt.format(m.startsAt)} ·{" "}
                      {timeFmt.format(m.startsAt)}
                      {m.location ? ` · ${m.location}` : ""}
                    </div>
                    {m.agendaItems.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        {m.agendaItems.map((item) => (
                          <li key={item.id}>• {item.title}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-heading text-base font-bold">
                Składki do uregulowania
              </h3>
              <Demo />
            </div>
            <ul className="space-y-3 text-sm">
              {[
                ["Anna Nowak", "120 zł"],
                ["Piotr Wójcik", "120 zł"],
                ["Krzysztof Zając", "60 zł"],
              ].map(([name, amount]) => (
                <li key={name} className="flex items-center justify-between">
                  <span className="font-medium">{name}</span>
                  <span className="font-semibold text-destructive">
                    {amount}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// Karta statystyki uchwał (liczba przyjętych + data ostatniej). Link gdy dostępne.
function ResolutionsStat({
  canResolutions,
  passed,
  lastDecidedAt,
}: {
  canResolutions: boolean;
  passed: number;
  lastDecidedAt: Date | null;
}) {
  const inner = (
    <>
      <StatLabel>PRZYJĘTE UCHWAŁY</StatLabel>
      <div className="font-heading text-3xl font-extrabold leading-none">
        {passed}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        {lastDecidedAt
          ? `Ostatnia: ${meetingDateFmt.format(lastDecidedAt)}`
          : "Brak przyjętych uchwał"}
      </div>
    </>
  );
  return canResolutions ? (
    <Link
      href="/resolutions?status=passed"
      className="rounded-xl border bg-card p-5 transition-colors hover:border-primary/50"
    >
      {inner}
    </Link>
  ) : (
    <div className="rounded-xl border bg-card p-5">{inner}</div>
  );
}

function StatLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-[0.04em] text-muted-foreground">
      {children}
    </div>
  );
}

// Znacznik treści przykładowej (do wymiany na realne dane).
function Demo({ dark }: { dark?: boolean }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-normal ${
        dark ? "bg-white/15 text-white/70" : "bg-muted text-muted-foreground"
      }`}
    >
      przykładowe
    </span>
  );
}
