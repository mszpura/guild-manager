"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { MemberRoleSelect } from "@/components/member-role-select";

export type DuesStatus = "PAID" | "OVERDUE" | "PENDING" | "EXEMPT" | "NA";

export type BoardMember = {
  id: string;
  roleId: string;
  initials: string;
  name: string;
  email: string; // pusty dla niezarządzających (nie ujawniamy)
  roleName: string;
  isOwnerRole: boolean;
  since: string; // sformatowana data dołączenia (MM.RRRR)
  duesStatus: DuesStatus;
};

type RoleOption = { id: string; name: string };

type Stats = {
  total: number;
  active: number;
  pendingApplications: number;
  debtorCount: number;
  arrears: string; // sformatowana kwota (PLN)
};

// Etykiety i kolory statusu składki — spójne z paletą projektu.
const DUES: Record<DuesStatus, { label: string; cls: string }> = {
  PAID: { label: "Opłacona", cls: "bg-emerald-50 text-emerald-700" },
  OVERDUE: { label: "Zaległość", cls: "bg-destructive/10 text-destructive" },
  PENDING: { label: "Oczekuje", cls: "bg-amber-50 text-amber-700" },
  EXEMPT: { label: "Zwolniony", cls: "bg-muted text-muted-foreground" },
  NA: { label: "—", cls: "bg-muted/50 text-muted-foreground/70" },
};

function StatCard({
  label,
  value,
  hint,
  hintTone,
  dark,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  hintTone?: "muted" | "positive" | "warning";
  dark?: boolean;
  href?: string;
}) {
  const hintCls =
    hintTone === "positive"
      ? "text-emerald-600"
      : hintTone === "warning"
        ? "text-amber-600"
        : dark
          ? "text-white/70"
          : "text-muted-foreground";
  const body = (
    <>
      <div
        className={`text-[11.5px] font-bold tracking-[0.04em] ${dark ? "text-white/60" : "text-muted-foreground"}`}
      >
        {label}
      </div>
      <div
        className={`mt-2 font-heading text-3xl font-extrabold leading-none ${dark ? "text-white" : "text-foreground"}`}
      >
        {value}
      </div>
      {hint ? <div className={`mt-2 text-[12.5px] font-semibold ${hintCls}`}>{hint}</div> : null}
    </>
  );
  const base = `rounded-xl border p-[18px] ${dark ? "border-transparent bg-foreground" : "bg-card"}`;
  return href ? (
    <Link href={href} className={`${base} block transition-colors hover:border-input`}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}

export function MembersBoard({
  members,
  roles,
  isAdmin,
  membershipPaid,
  stats,
  feeYear,
  canViewApplications,
}: {
  members: BoardMember[];
  roles: RoleOption[];
  isAdmin: boolean;
  membershipPaid: boolean;
  stats: Stats;
  feeYear: number;
  canViewApplications: boolean;
}) {
  // Filtr: "all" albo roleId. Plus wyszukiwanie po nazwisku / e-mailu.
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const countByRole = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) map.set(m.roleId, (map.get(m.roleId) ?? 0) + 1);
    return map;
  }, [members]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (filter !== "all" && m.roleId !== filter) return false;
      if (q && !`${m.name} ${m.email}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [members, filter, query]);

  const tabs = [
    { id: "all", label: "Wszyscy", count: members.length },
    ...roles.map((r) => ({
      id: r.id,
      label: r.name,
      count: countByRole.get(r.id) ?? 0,
    })),
  ];

  const cols = isAdmin
    ? "grid-cols-[minmax(200px,2fr)_160px_140px_110px_44px]"
    : "grid-cols-[minmax(200px,2fr)_160px_110px]";

  return (
    <div className="space-y-5">
      {/* karty statystyk — tylko dla zarządzających */}
      {isAdmin ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="WSZYSCY CZŁONKOWIE" value={stats.total} />
          <StatCard
            label="Z PRAWEM GŁOSU"
            value={stats.active}
            hint="uprawnieni do głosowania"
          />
          <StatCard
            label="NOWE ZGŁOSZENIA"
            value={stats.pendingApplications}
            hint={stats.pendingApplications > 0 ? "czekają na decyzję" : "brak nowych"}
            hintTone={stats.pendingApplications > 0 ? "warning" : "muted"}
            href={canViewApplications ? "/applications" : undefined}
          />
          <StatCard
            label="ZALEGAJĄCY ZE SKŁADKĄ"
            value={membershipPaid ? stats.debtorCount : "—"}
            hint={
              membershipPaid && stats.debtorCount > 0
                ? `na łączną kwotę ${stats.arrears}`
                : membershipPaid
                  ? "brak zaległości"
                  : "członkostwo bezpłatne"
            }
            dark
          />
        </div>
      ) : null}

      {/* filtry (Wszyscy + role) + wyszukiwarka */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex flex-wrap gap-0.5 rounded-[10px] border bg-card p-1">
          {tabs.map((t) => {
            const active = filter === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilter(t.id)}
                className={`flex items-center gap-2 rounded-[7px] px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {t.label}
                <span
                  className={`rounded-full px-1.5 py-px font-mono text-[11.5px] font-medium ${
                    active ? "bg-white/15 text-white/80" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isAdmin ? "Szukaj po nazwisku lub e-mailu…" : "Szukaj po nazwisku…"
            }
            className="h-10 w-[262px] rounded-[9px] border bg-card pl-9 pr-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/40"
          />
        </div>
      </div>

      {/* tabela */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div
              className={`grid ${cols} gap-3.5 border-b px-5 py-3 text-[11px] font-bold tracking-[0.05em] text-muted-foreground`}
            >
              <span>CZŁONEK</span>
              <span>FUNKCJA</span>
              {isAdmin ? <span>SKŁADKA {feeYear}</span> : null}
              <span>CZŁONEK OD</span>
              {isAdmin ? <span></span> : null}
            </div>

            {list.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-muted-foreground">
                Brak członków pasujących do filtrów.
              </p>
            ) : (
              list.map((m) => (
                <div
                  key={m.id}
                  className={`grid ${cols} items-center gap-3.5 border-b px-5 py-3.5 transition-colors last:border-0 hover:bg-muted/40`}
                >
                  {/* członek */}
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                        m.isOwnerRole
                          ? "bg-foreground text-background"
                          : "bg-accent text-primary"
                      }`}
                    >
                      {m.initials}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {m.name}
                      </div>
                      {m.email ? (
                        <div className="truncate text-xs text-muted-foreground">
                          {m.email}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* funkcja */}
                  <div className="min-w-0">
                    {isAdmin ? (
                      <MemberRoleSelect
                        memberId={m.id}
                        roleId={m.roleId}
                        roles={roles}
                      />
                    ) : (
                      <span
                        className={`text-[13px] font-semibold ${m.isOwnerRole ? "text-foreground" : "text-muted-foreground"}`}
                      >
                        {m.roleName}
                      </span>
                    )}
                  </div>

                  {/* składka */}
                  {isAdmin ? (
                    <span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${DUES[m.duesStatus].cls}`}
                      >
                        {DUES[m.duesStatus].label}
                      </span>
                    </span>
                  ) : null}

                  {/* członek od */}
                  <span className="font-mono text-[12.5px] text-muted-foreground">
                    {m.since}
                  </span>

                  {/* akcje */}
                  {isAdmin ? (
                    <div className="flex justify-end">
                      <Link
                        href={`/members/${m.id}`}
                        className="text-sm font-semibold text-primary hover:underline"
                        aria-label={`Profil: ${m.name}`}
                      >
                        Profil →
                      </Link>
                    </div>
                  ) : null}
                </div>
              ))
            )}

            {/* stopka: legenda składek + licznik */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-5 py-3">
              {isAdmin && membershipPaid ? (
                <div className="flex flex-wrap items-center gap-4 text-[12px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-emerald-500" /> Opłacona
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-destructive" /> Zaległość
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-slate-400" /> Zwolniony
                  </span>
                </div>
              ) : (
                <span />
              )}
              <div className="text-[12.5px] text-muted-foreground">
                Wyświetlono {list.length} z {members.length} członków
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
