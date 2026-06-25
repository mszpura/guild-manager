import { redirect } from "next/navigation";
import Link from "next/link";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import {
  MEETING_TYPE_LABELS,
  attendableWhere,
  relativeDays,
  toDateTimeLocalValue,
} from "@/lib/meetings";
import { MeetingFormDialog } from "@/components/meeting-form-dialog";
import { MeetingDeleteButton } from "@/components/meeting-delete-button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { CalendarClock, MapPin, Users } from "lucide-react";

const dateTimeFmt = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "full",
  timeStyle: "short",
});

const meetingSelect = {
  id: true,
  title: true,
  type: true,
  startsAt: true,
  location: true,
  endedAt: true,
  allowedRoles: { select: { role: { select: { id: true, name: true } } } },
  agendaItems: {
    select: { id: true, title: true },
    orderBy: { order: "asc" },
  },
} as const;

type MeetingCardData = {
  id: string;
  title: string;
  type: keyof typeof MEETING_TYPE_LABELS;
  startsAt: Date;
  location: string | null;
  endedAt: Date | null;
  allowedRoles: { role: { id: string; name: string } }[];
  agendaItems: { id: string; title: string }[];
};

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

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Spotkania</h1>
          <p className="text-sm text-muted-foreground">
            Walne zebrania i posiedzenia zarządu stowarzyszenia.
          </p>
        </div>
        {isManager ? (
          <MeetingFormDialog organizationId={orgId} roles={roles} />
        ) : null}
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList
          variant="line"
          className="h-auto w-full justify-start gap-[30px] rounded-none border-b bg-transparent p-0"
        >
          {[
            ["upcoming", `Nadchodzące (${upcoming.length})`],
            ["past", `Odbyte (${past.length})`],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="-mb-px flex-none rounded-none border-x-0 border-t-0 border-b-2 border-transparent px-0.5 pb-3.5 text-sm font-semibold text-muted-foreground shadow-none after:hidden hover:text-foreground data-active:border-b-primary data-active:font-bold data-active:text-foreground data-active:shadow-none"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="upcoming" className="pt-2">
          {upcoming.length === 0 ? (
            <EmptyState>Brak zaplanowanych spotkań.</EmptyState>
          ) : (
            <div className="space-y-3">
              {upcoming.map((m) => (
                <MeetingCard
                  key={m.id}
                  meeting={m}
                  isManager={isManager}
                  roles={roles}
                  now={now}
                  upcoming
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="past" className="pt-2">
          {past.length === 0 ? (
            <EmptyState>Brak odbytych spotkań.</EmptyState>
          ) : (
            <div className="space-y-3">
              {past.map((m) => (
                <MeetingCard
                  key={m.id}
                  meeting={m}
                  isManager={isManager}
                  roles={roles}
                  now={now}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MeetingCard({
  meeting,
  isManager,
  roles,
  now,
  upcoming,
}: {
  meeting: MeetingCardData;
  isManager: boolean;
  roles: { id: string; name: string }[];
  now: Date;
  upcoming?: boolean;
}) {
  const isUrl = /^https?:\/\//i.test(meeting.location ?? "");
  const ended = meeting.endedAt !== null;
  const inProgress = !ended && meeting.startsAt <= now;

  return (
    <div className="group relative rounded-xl border bg-card p-5 transition-colors hover:border-primary/50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{MEETING_TYPE_LABELS[meeting.type]}</Badge>
            {inProgress ? (
              <Badge className="gap-1">
                <span className="size-1.5 rounded-full bg-current" />
                Spotkanie w toku
              </Badge>
            ) : null}
            {ended ? (
              <Badge variant="outline" className="text-muted-foreground">
                Zakończone
              </Badge>
            ) : null}
            {upcoming && !inProgress ? (
              <span className="text-xs font-medium text-primary">
                {relativeDays(meeting.startsAt, now)}
              </span>
            ) : null}
          </div>
          <h3 className="font-heading text-base font-bold">
            <Link
              href={`/meetings/${meeting.id}`}
              className="after:absolute after:inset-0 after:rounded-xl hover:text-primary"
            >
              {meeting.title}
            </Link>
          </h3>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock className="size-4 shrink-0" />
            {dateTimeFmt.format(meeting.startsAt)}
          </div>
          {meeting.location ? (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" />
              {isUrl ? (
                <a
                  href={meeting.location}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative z-10 truncate text-primary underline-offset-4 hover:underline"
                >
                  {meeting.location}
                </a>
              ) : (
                <span className="truncate">{meeting.location}</span>
              )}
            </div>
          ) : null}
        </div>

        {isManager ? (
          <div className="relative z-10 flex shrink-0 items-center">
            <MeetingFormDialog
              organizationId=""
              roles={roles}
              meeting={{
                id: meeting.id,
                title: meeting.title,
                type: meeting.type,
                startsAtValue: toDateTimeLocalValue(meeting.startsAt),
                location: meeting.location ?? "",
                agendaItems: meeting.agendaItems.map((a) => ({
                  id: a.id,
                  title: a.title,
                })),
                roleIds: meeting.allowedRoles.map((r) => r.role.id),
              }}
            />
            <MeetingDeleteButton meetingId={meeting.id} title={meeting.title} />
          </div>
        ) : null}
      </div>

      {meeting.agendaItems.length > 0 ? (
        <div className="mt-4">
          <p className="mb-1 text-xs font-bold tracking-wide text-muted-foreground">
            PORZĄDEK OBRAD
          </p>
          <ul className="space-y-1 text-sm">
            {meeting.agendaItems.map((item) => (
              <li key={item.id} className="text-foreground/90">
                {item.title}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="size-3.5 shrink-0" />
        {meeting.allowedRoles.length === 0 ? (
          <span>Wszyscy członkowie</span>
        ) : (
          <span>{meeting.allowedRoles.map((r) => r.role.name).join(", ")}</span>
        )}
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
