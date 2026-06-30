"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin, Users, UserRound, FileText, ArrowRight } from "lucide-react";
import { MeetingFormDialog, type MeetingFormValues } from "@/components/meeting-form-dialog";
import { MeetingDeleteButton } from "@/components/meeting-delete-button";

export type BoardMeeting = {
  id: string;
  title: string;
  kind: string;
  // kafelek daty
  mon: string;
  day: string;
  year: string;
  dateLong: string;
  // status / termin
  state: "live" | "upcoming" | "done";
  statusLabel: string;
  whenLabel: string;
  timeLabel: string;
  // meta
  location: string | null;
  isOnline: boolean;
  eligibility: string;
  organizer: string | null;
  agendaCount: number;
  // filtrowanie / sortowanie
  bucket: "upcoming" | "done";
  ts: number;
  // zarządzanie (tylko dla uprawnionych, gdy spotkanie nie jest zakończone)
  edit: MeetingFormValues | null;
};

type RoleOption = { id: string; name: string };
type Filter = "all" | "upcoming" | "done";

// Kolory statusu — spójne z kafelkiem daty i etykietą terminu.
const STATUS_STYLES: Record<BoardMeeting["state"], string> = {
  live: "bg-accent text-accent-foreground",
  upcoming: "bg-[#fbf0df] text-[#b5731a]",
  done: "bg-[#e7f1ea] text-[#2f7d4f]",
};
const STATUS_DOT: Record<BoardMeeting["state"], string> = {
  live: "bg-primary",
  upcoming: "bg-[#e0a64d]",
  done: "bg-[#3a9b62]",
};

export function MeetingsBoard({
  meetings,
  isManager,
  roles,
}: {
  meetings: BoardMeeting[];
  isManager: boolean;
  roles: RoleOption[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [hidePast, setHidePast] = useState(false);

  const upcoming = meetings.filter((m) => m.bucket === "upcoming");
  const done = meetings.filter((m) => m.bucket === "done");

  let list: BoardMeeting[];
  if (filter === "upcoming") list = upcoming;
  else if (filter === "done") list = done;
  else list = hidePast ? upcoming : meetings;

  // Najbliższe spotkanie do wyróżnienia: pierwsze zaplanowane (nie „w toku"),
  // a w razie braku — pierwsze nadchodzące w ogóle.
  const hero =
    upcoming.find((m) => m.state === "upcoming") ?? upcoming[0] ?? null;

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "Wszystkie", count: meetings.length },
    { id: "upcoming", label: "Nadchodzące", count: upcoming.length },
    { id: "done", label: "Zakończone", count: done.length },
  ];

  return (
    <div className="space-y-[18px]">
      {hero ? <HeroCard meeting={hero} /> : null}

      {/* pasek filtrów */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-0.5 rounded-[10px] border bg-card p-1">
          {filters.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`flex items-center gap-2 rounded-[7px] px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${
                  active
                    ? "bg-foreground text-background"
                    : "text-sidebar-foreground hover:bg-muted"
                }`}
              >
                {f.label}
                <span
                  className={`rounded-full px-1.5 py-px font-mono text-[11.5px] font-medium ${
                    active
                      ? "bg-white/15 text-white/80"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setHidePast((v) => !v)}
          className="flex items-center gap-2.5 rounded-[9px] border bg-card px-3.5 py-2 transition-colors hover:border-input"
          aria-pressed={hidePast}
        >
          <span
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
              hidePast ? "bg-primary" : "bg-input"
            }`}
          >
            <span
              className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left] ${
                hidePast ? "left-[18px]" : "left-0.5"
              }`}
            />
          </span>
          <span className="text-[13.5px] font-semibold text-sidebar-foreground">
            Ukryj zakończone
          </span>
        </button>
      </div>

      {/* lista spotkań */}
      {list.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {list.map((m) => (
            <MeetingCard
              key={m.id}
              meeting={m}
              isManager={isManager}
              roles={roles}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HeroCard({ meeting }: { meeting: BoardMeeting }) {
  // „Dołącz" tylko dla spotkań online z podanym linkiem — przenosi wprost do linku.
  const canJoin = meeting.isOnline && !!meeting.location;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-foreground px-6 py-5 text-white sm:px-7">
      <div className="pointer-events-none absolute -top-16 -right-3 size-52 rounded-full border border-[#5b87ff]/15" />
      <div className="pointer-events-none absolute top-2 right-24 size-32 rounded-full border border-white/5" />
      <div className="relative flex flex-wrap items-center justify-between gap-5">
        <div className="min-w-0">
          <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#5b87ff]/20 px-3 py-1.5">
            <span className="size-[7px] rounded-full bg-[#7aa0ff]" />
            <span className="text-[11.5px] font-bold tracking-wide text-[#a9c2ff]">
              NAJBLIŻSZE SPOTKANIE · {meeting.whenLabel.toUpperCase()}
            </span>
          </span>
          <h2 className="font-heading text-[22px] font-extrabold tracking-tight text-white">
            {meeting.title}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[12.5px] text-[#9fb0cc]">
            <span>{meeting.dateLong}</span>
            <span className="text-[#3f5273]">·</span>
            <span>{meeting.timeLabel}</span>
            {meeting.location ? (
              <>
                <span className="text-[#3f5273]">·</span>
                <span className="truncate">{meeting.location}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <Link
            href={`/meetings/${meeting.id}`}
            className="rounded-[9px] border border-white/20 bg-white/10 px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-white/15"
          >
            Szczegóły
          </Link>
          {canJoin ? (
            <a
              href={meeting.location!}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-[9px] bg-primary px-4.5 py-2.5 text-[13.5px] font-bold text-primary-foreground transition-colors hover:bg-[#3f6ee0]"
            >
              Dołącz
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MeetingCard({
  meeting,
  isManager,
  roles,
}: {
  meeting: BoardMeeting;
  isManager: boolean;
  roles: RoleOption[];
}) {
  const isDone = meeting.state === "done";
  const chipTint = isDone
    ? "border-border bg-muted text-muted-foreground"
    : "border-[#d7e2fb] bg-accent text-[#5a82dd]";

  return (
    <div className="flex items-stretch gap-4 rounded-xl border bg-card p-4 transition-[border-color,box-shadow] hover:border-input hover:shadow-[0_4px_14px_-8px_rgba(20,35,63,0.16)] sm:p-5">
      {/* kafelek daty */}
      <div
        className={`flex w-[62px] shrink-0 flex-col items-center justify-center rounded-[10px] border py-2.5 ${chipTint}`}
      >
        <span className="text-[10.5px] font-bold tracking-wider">
          {meeting.mon}
        </span>
        <span
          className={`font-heading text-[26px] font-extrabold leading-none ${
            isDone ? "text-sidebar-foreground" : "text-primary"
          }`}
        >
          {meeting.day}
        </span>
        <span className="text-[10.5px] font-semibold">{meeting.year}</span>
      </div>

      {/* treść */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3.5">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold tracking-wide text-muted-foreground">
                {meeting.kind}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  STATUS_STYLES[meeting.state]
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${STATUS_DOT[meeting.state]}`}
                />
                {meeting.statusLabel}
              </span>
            </div>
            <h3 className="font-heading text-[17px] font-bold tracking-tight">
              <Link
                href={`/meetings/${meeting.id}`}
                className="hover:text-primary"
              >
                {meeting.title}
              </Link>
            </h3>
          </div>
          <div className="shrink-0 text-right">
            <div
              className={`text-[13.5px] font-bold whitespace-nowrap ${
                meeting.state === "done"
                  ? "text-muted-foreground"
                  : meeting.state === "live"
                    ? "text-primary"
                    : "text-secondary-foreground"
              }`}
            >
              {meeting.whenLabel}
            </div>
            <div className="mt-0.5 font-mono text-[11.5px] whitespace-nowrap text-muted-foreground">
              {meeting.timeLabel}
            </div>
          </div>
        </div>

        {/* meta */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground">
          {meeting.location ? (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0" />
              {meeting.isOnline ? (
                <a
                  href={meeting.location}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-primary underline-offset-4 hover:underline"
                >
                  {meeting.location}
                </a>
              ) : (
                <span className="truncate">{meeting.location}</span>
              )}
            </span>
          ) : null}
          <span className="flex items-center gap-1.5">
            <Users className="size-3.5 shrink-0" />
            {meeting.eligibility}
          </span>
          {meeting.organizer ? (
            <span className="flex items-center gap-1.5">
              <UserRound className="size-3.5 shrink-0" />
              Zwołał: {meeting.organizer}
            </span>
          ) : null}
        </div>

        {/* stopka akcji */}
        <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-[#f3f5f9] pt-3.5">
          <div className="flex flex-wrap items-center gap-2.5">
            {meeting.state === "done" ? (
              <>
                <Link
                  href={`/meetings/${meeting.id}/protokol`}
                  className="flex items-center gap-1.5 rounded-lg border bg-muted px-3 py-1.5 text-[12.5px] font-semibold text-secondary-foreground transition-colors hover:border-input"
                >
                  <FileText className="size-3.5" />
                  Protokół
                </Link>
                {meeting.agendaCount > 0 ? (
                  <span className="text-[12.5px] text-muted-foreground">
                    {meeting.agendaCount} pkt porządku obrad
                  </span>
                ) : null}
              </>
            ) : meeting.state === "live" ? (
              <>
                <Link
                  href={`/meetings/${meeting.id}`}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-[12.5px] font-bold text-primary-foreground transition-colors hover:bg-[#2851b8]"
                >
                  Otwórz spotkanie
                  <ArrowRight className="size-3.5" />
                </Link>
                <span className="text-[12.5px] font-semibold text-primary">
                  Trwa teraz
                </span>
              </>
            ) : (
              <>
                <Link
                  href={`/meetings/${meeting.id}`}
                  className="rounded-lg border border-input bg-card px-3 py-1.5 text-[12.5px] font-semibold text-secondary-foreground transition-colors hover:border-[#bcc6db]"
                >
                  Szczegóły
                </Link>
                {meeting.agendaCount > 0 ? (
                  <span className="text-[12.5px] text-muted-foreground">
                    Porządek obrad gotowy
                  </span>
                ) : null}
              </>
            )}
          </div>

          {isManager ? (
            <div className="flex shrink-0 items-center">
              {meeting.edit ? (
                <MeetingFormDialog
                  organizationId=""
                  roles={roles}
                  meeting={meeting.edit}
                />
              ) : null}
              <MeetingDeleteButton
                meetingId={meeting.id}
                title={meeting.title}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed p-12 text-center">
      <div className="mx-auto mb-3.5 flex size-12 items-center justify-center rounded-xl bg-muted">
        <span className="size-[18px] rounded border-2 border-[#c2cbdb]" />
      </div>
      <p className="text-[15px] font-bold text-secondary-foreground">
        Brak spotkań w tym widoku
      </p>
      <p className="mt-1 text-[13.5px] text-muted-foreground">
        Zmień filtr lub zaplanuj nowe spotkanie.
      </p>
    </div>
  );
}
