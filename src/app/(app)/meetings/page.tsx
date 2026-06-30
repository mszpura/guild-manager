import { redirect } from "next/navigation";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import {
  MEETING_TYPE_LABELS,
  MONTHS_SHORT,
  MONTHS_LONG,
  attendableWhere,
  relativeDays,
  organizerLabel,
  toDateTimeLocalValue,
} from "@/lib/meetings";
import { MeetingFormDialog } from "@/components/meeting-form-dialog";
import { MeetingsBoard, type BoardMeeting } from "@/components/meetings-board";

const timeFmt = new Intl.DateTimeFormat("pl-PL", {
  hour: "2-digit",
  minute: "2-digit",
});

const meetingSelect = {
  id: true,
  title: true,
  type: true,
  startsAt: true,
  isOnline: true,
  location: true,
  endedAt: true,
  allowedRoles: { select: { role: { select: { id: true, name: true } } } },
  agendaItems: {
    select: { id: true, title: true, votable: true },
    orderBy: { order: "asc" },
  },
  createdBy: { select: { firstName: true, lastName: true } },
} as const;

// Pierwsza litera wielka — etykiety terminu z relativeDays są pisane małą literą.
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export default async function MeetingsPage() {
  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const orgId = data.active.organizationId;
  const myRoleId = data.active.role.id;

  // Podgląd wymaga MEETINGS≥READ; dodawanie/edycja/usuwanie → MEETINGS WRITE.
  const me = await requireMember(orgId, "MEETINGS", "READ");
  const isManager = can(me.role, "MEETINGS", "WRITE");

  const now = new Date();

  const [upcoming, past, roles] = await Promise.all([
    // Nadchodzące: zarządzający widzą wszystkie; pozostali tylko te, w których
    // mogą wziąć udział (rola na liście lub spotkanie otwarte dla wszystkich).
    prisma.meeting.findMany({
      where: {
        organizationId: orgId,
        startsAt: { gte: now },
        ...(isManager ? {} : attendableWhere(myRoleId)),
      },
      select: meetingSelect,
      orderBy: { startsAt: "asc" },
    }),
    prisma.meeting.findMany({
      where: {
        organizationId: orgId,
        startsAt: { lt: now },
        ...(isManager ? {} : attendableWhere(myRoleId)),
      },
      select: meetingSelect,
      orderBy: { startsAt: "desc" },
      take: 50,
    }),
    isManager
      ? prisma.role.findMany({
          where: { organizationId: orgId },
          orderBy: [{ isOwner: "desc" }, { isSystem: "desc" }, { createdAt: "asc" }],
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  type Row = (typeof upcoming)[number];

  const decorate = (m: Row): BoardMeeting => {
    const ended = m.endedAt !== null;
    const live = !ended && m.startsAt <= now;
    const state: BoardMeeting["state"] = ended
      ? "done"
      : live
        ? "live"
        : "upcoming";

    return {
      id: m.id,
      title: m.title,
      kind: MEETING_TYPE_LABELS[m.type].toUpperCase(),
      mon: MONTHS_SHORT[m.startsAt.getMonth()],
      day: String(m.startsAt.getDate()).padStart(2, "0"),
      year: String(m.startsAt.getFullYear()),
      dateLong: `${m.startsAt.getDate()} ${MONTHS_LONG[m.startsAt.getMonth()]} ${m.startsAt.getFullYear()}`,
      state,
      statusLabel: ended ? "Zakończone" : live ? "W toku" : "Zaplanowane",
      whenLabel: live ? "Trwa" : cap(relativeDays(m.startsAt, now)),
      timeLabel: timeFmt.format(m.startsAt),
      location: m.location,
      isOnline: m.isOnline,
      eligibility:
        m.allowedRoles.length === 0
          ? "Wszyscy członkowie"
          : m.allowedRoles.map((r) => r.role.name).join(", "),
      organizer: organizerLabel(m.createdBy),
      agendaCount: m.agendaItems.length,
      bucket: ended ? "done" : "upcoming",
      ts: m.startsAt.getTime(),
      // Zakończonych spotkań nie da się edytować (spójnie z updateMeeting).
      edit:
        isManager && !ended
          ? {
              id: m.id,
              title: m.title,
              type: m.type,
              startsAtValue: toDateTimeLocalValue(m.startsAt),
              isOnline: m.isOnline,
              location: m.location ?? "",
              agendaItems: m.agendaItems.map((a) => ({
                id: a.id,
                title: a.title,
                votable: a.votable,
              })),
              roleIds: m.allowedRoles.map((r) => r.role.id),
            }
          : null,
    };
  };

  // Łączymy oba zbiory i sortujemy: najpierw nadchodzące (od najbliższego),
  // potem zakończone (od najświeższego).
  const meetings = [...upcoming, ...past].map(decorate).sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket === "upcoming" ? -1 : 1;
    return a.bucket === "upcoming" ? a.ts - b.ts : b.ts - a.ts;
  });

  const today = `${now.getDate()} ${MONTHS_LONG[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <div className="mx-auto max-w-5xl space-y-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">
            Spotkania
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Zebrania, posiedzenia zarządu i spotkania robocze stowarzyszenia.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden font-mono text-[12.5px] text-muted-foreground sm:inline">
            Dziś · {today}
          </span>
          {isManager ? (
            <MeetingFormDialog organizationId={orgId} roles={roles} />
          ) : null}
        </div>
      </div>

      <MeetingsBoard meetings={meetings} isManager={isManager} roles={roles} />
    </div>
  );
}
