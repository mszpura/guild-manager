"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, RotateCcw, Search } from "lucide-react";
import { setFeePaid } from "@/lib/actions/fees";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FeeStatus = "PAID" | "OVERDUE" | "PENDING";

export type FeeRow = {
  memberId: string;
  name: string;
  initials: string;
  roleName: string;
  status: FeeStatus;
};

// Kolory statusów składki — spójne z paletą statusów w projekcie „Associacion".
const STATUS_STYLE: Record<FeeStatus, { label: string; color: string; bg: string }> = {
  PAID: { label: "Opłacona", color: "#2f7d4f", bg: "#e7f1ea" },
  OVERDUE: { label: "Zaległa", color: "#c0392b", bg: "#f7e6e4" },
  PENDING: { label: "Do zapłaty", color: "#b5731a", bg: "#fbf0df" },
};

type Filter = "ALL" | "PAID" | "UNPAID";

function StatCard({
  label,
  value,
  hint,
  accent,
  bar,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  bar?: number;
}) {
  return (
    <div className="rounded-xl border bg-card p-[18px]">
      <div className="text-[11.5px] font-bold tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={cn(
          "mt-2 font-heading text-3xl leading-none font-extrabold",
          accent ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </div>
      {bar != null ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-[#2f7d4f]"
            style={{ width: `${bar}%` }}
          />
        </div>
      ) : null}
      {hint ? (
        <div
          className={cn(
            "mt-2 text-[12.5px]",
            accent ? "font-semibold text-destructive" : "text-muted-foreground",
          )}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      <span className={cn("text-xs font-bold", active ? "opacity-70" : "opacity-60")}>
        {count}
      </span>
    </button>
  );
}

function StatusBadge({ status }: { status: FeeStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className="inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap"
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      {s.label}
    </span>
  );
}

export function FeesManager({
  year,
  rows,
  canManage,
  hasDueDate,
}: {
  year: number;
  rows: FeeRow[];
  canManage: boolean;
  hasDueDate: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const counts = useMemo(() => {
    const paid = rows.filter((r) => r.status === "PAID").length;
    return { all: rows.length, paid, unpaid: rows.length - paid };
  }, [rows]);

  const rate = counts.all > 0 ? Math.round((counts.paid / counts.all) * 100) : 0;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "PAID" && r.status !== "PAID") return false;
      if (filter === "UNPAID" && r.status === "PAID") return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filter, query]);

  function toggle(row: FeeRow) {
    const nextPaid = row.status !== "PAID";
    setPendingId(row.memberId);
    startTransition(async () => {
      try {
        await setFeePaid(row.memberId, year, nextPaid);
        router.refresh();
        toast.success(
          nextPaid
            ? `Składka za ${year} oznaczona jako opłacona.`
            : `Cofnięto oznaczenie składki za ${year}.`,
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać.");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* karty statystyk */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={`Opłacone ${year}`}
          value={`${counts.paid} / ${counts.all}`}
          hint="opłaconych składek"
        />
        <StatCard label="Opłacalność" value={`${rate}%`} bar={rate} />
        <StatCard
          label="Nieopłacone"
          value={String(counts.unpaid)}
          hint={counts.unpaid > 0 ? `${counts.unpaid} bez opłaty` : "wszyscy opłacili"}
          accent={counts.unpaid > 0}
        />
      </div>

      {/* filtry + szukaj */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <FilterChip active={filter === "ALL"} count={counts.all} onClick={() => setFilter("ALL")}>
            Wszyscy
          </FilterChip>
          <FilterChip active={filter === "PAID"} count={counts.paid} onClick={() => setFilter("PAID")}>
            Opłacone
          </FilterChip>
          <FilterChip
            active={filter === "UNPAID"}
            count={counts.unpaid}
            onClick={() => setFilter("UNPAID")}
          >
            Nieopłacone
          </FilterChip>
        </div>
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj członka…"
            className="h-9 w-52 rounded-md border bg-card pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>
      </div>

      {/* tabela */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-[minmax(180px,1fr)_120px_150px] gap-4 border-b px-5 py-3 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
          <span>Członek</span>
          <span>Status</span>
          <span className="text-right">Akcja</span>
        </div>

        {visible.map((row) => (
          <div
            key={row.memberId}
            className="grid grid-cols-[minmax(180px,1fr)_120px_150px] items-center gap-4 border-b px-5 py-3.5 transition-colors last:border-b-0 hover:bg-muted/40"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                {row.initials}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">
                  {row.name}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {row.roleName}
                </div>
              </div>
            </div>

            <div>
              <StatusBadge status={row.status} />
            </div>

            <div className="flex justify-end">
              {canManage ? (
                row.status === "PAID" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggle(row)}
                    disabled={pendingId === row.memberId}
                  >
                    <RotateCcw className="size-3.5" />
                    Cofnij
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => toggle(row)}
                    disabled={pendingId === row.memberId}
                  >
                    <Check className="size-3.5" />
                    Oznacz opłaconą
                  </Button>
                )
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </div>
          </div>
        ))}

        {visible.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            Brak członków w tej kategorii.
          </div>
        ) : null}

        {/* legenda */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t bg-muted/40 px-5 py-3">
          {(["PAID", hasDueDate ? "OVERDUE" : "PENDING"] as FeeStatus[]).map((st) => (
            <div key={st} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: STATUS_STYLE[st].color }}
              />
              {STATUS_STYLE[st].label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
