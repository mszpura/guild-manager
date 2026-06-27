"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, RotateCcw, Search } from "lucide-react";
import { setFeePaid, setMemberTier } from "@/lib/actions/fees";
import { formatPLN } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FeeStatus = "PAID" | "OVERDUE" | "PENDING";
export type CycleStatus = FeeStatus | "NA";

export type FeeCycle = {
  year: number;
  short: string; // np. „'26"
  label: string; // pełny opis okresu (tooltip)
  status: CycleStatus;
};

export type FeeTier = { id: string; label: string; amount: number };

export type FeeRow = {
  memberId: string;
  name: string;
  initials: string;
  roleName: string;
  tierId: string | null; // przypisany próg składki, null = nieprzypisany
  saldo: number | null; // saldo (grosze, ≤ 0), null gdy brak przypisanej składki
  status: FeeStatus; // status bieżącego okresu (filtry/statystyki)
  cycles: FeeCycle[]; // historia cykli, od najstarszego do bieżącego
};

// Kolory/oznaczenia cykli składki — komórki jak w szablonie „Associacion".
const CYCLE_STYLE: Record<
  CycleStatus,
  { label: string; mark: string; color: string; bg: string }
> = {
  PAID: { label: "Opłacona", mark: "✓", color: "#2f7d4f", bg: "#e7f1ea" },
  OVERDUE: { label: "Zaległa", mark: "!", color: "#c0392b", bg: "#f7e6e4" },
  PENDING: { label: "Do zapłaty", mark: "•", color: "#b5731a", bg: "#fbf0df" },
  NA: { label: "Nie dotyczy", mark: "–", color: "#bcc4d4", bg: "#f1f3f8" },
};

type Filter = "ALL" | "PAID" | "UNPAID";

// Polska odmiana: „1 osoba zalega", „2 osoby zalegają", „5 osób zalega".
function debtorsLabel(n: number): string {
  const ones = n % 10;
  const tens = n % 100;
  if (n === 1) return "1 osoba zalega";
  if (ones >= 2 && ones <= 4 && !(tens >= 12 && tens <= 14))
    return `${n} osoby zalegają`;
  return `${n} osób zalega`;
}

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

// Pojedyncza komórka cyklu składkowego — etykieta okresu + kolorowy znacznik.
function CycleCell({ cycle }: { cycle: FeeCycle }) {
  const s = CYCLE_STYLE[cycle.status];
  return (
    <div
      className="flex flex-col items-center gap-1"
      title={`${cycle.label}: ${s.label}`}
    >
      <span className="font-mono text-[9.5px] text-muted-foreground">
        {cycle.short}
      </span>
      <span
        className="flex h-[26px] w-[30px] items-center justify-center rounded-md text-[13px] font-bold"
        style={{ backgroundColor: s.bg, color: s.color }}
      >
        {s.mark}
      </span>
    </div>
  );
}

// Wybór składki (progu) dla członka — z listy zdefiniowanej w ustawieniach.
function TierSelect({
  memberId,
  tierId,
  tiers,
  canManage,
}: {
  memberId: string;
  tierId: string | null;
  tiers: FeeTier[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(tierId ?? "");
  const [saving, startSave] = useTransition();

  const current = tiers.find((t) => t.id === value);

  if (!canManage) {
    return (
      <span className="text-xs text-muted-foreground">
        {current ? `${current.label} · ${formatPLN(current.amount)}` : "brak składki"}
      </span>
    );
  }

  return (
    <select
      value={value}
      disabled={saving}
      aria-label="Składka członka"
      className="h-6 max-w-[180px] rounded border bg-card px-1 text-xs text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
      onChange={(e) => {
        const next = e.target.value;
        const prev = value;
        setValue(next);
        startSave(async () => {
          try {
            await setMemberTier(memberId, next);
            router.refresh();
            toast.success("Zapisano składkę członka.");
          } catch (err) {
            setValue(prev); // przywróć poprzedni wybór przy błędzie
            toast.error(err instanceof Error ? err.message : "Nie udało się zapisać.");
          }
        });
      }}
    >
      <option value="">— wybierz składkę —</option>
      {tiers.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label} · {formatPLN(t.amount)}
        </option>
      ))}
    </select>
  );
}

export function FeesManager({
  year,
  rows,
  tiers,
  canManage,
  collected,
  charged,
  arrears,
  debtorCount,
}: {
  year: number;
  rows: FeeRow[];
  tiers: FeeTier[];
  canManage: boolean;
  collected: number; // zebrano w bieżącym roku (grosze)
  charged: number; // naliczono w bieżącym roku (grosze)
  arrears: number; // suma zaległości (grosze)
  debtorCount: number; // liczba członków z zaległościami
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

  // Opłacalność liczona kwotowo (zebrano/naliczono); bez naliczeń — wg liczby wpłat.
  const rate =
    charged > 0
      ? Math.round((collected / charged) * 100)
      : counts.all > 0
        ? Math.round((counts.paid / counts.all) * 100)
        : 0;

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
          label={`Zebrano ${year}`}
          value={formatPLN(collected)}
          hint={`z ${formatPLN(charged)} naliczonych`}
        />
        <StatCard label="Opłacalność" value={`${rate}%`} bar={rate} />
        <StatCard
          label="Zaległości"
          value={formatPLN(arrears)}
          hint={debtorCount > 0 ? debtorsLabel(debtorCount) : "brak zaległości"}
          accent={arrears > 0}
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
        <div className="grid grid-cols-[minmax(180px,1fr)_160px_96px_150px] gap-4 border-b px-5 py-3 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
          <span>Członek</span>
          <span>Okres składkowy</span>
          <span>Saldo</span>
          <span className="text-right">Akcja</span>
        </div>

        {visible.map((row) => (
          <div
            key={row.memberId}
            className="grid grid-cols-[minmax(180px,1fr)_160px_96px_150px] items-center gap-4 border-b px-5 py-3.5 transition-colors last:border-b-0 hover:bg-muted/40"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                {row.initials}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">
                  {row.name}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="shrink-0 truncate">{row.roleName}</span>
                  <span aria-hidden>·</span>
                  <TierSelect
                    memberId={row.memberId}
                    tierId={row.tierId}
                    tiers={tiers}
                    canManage={canManage}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              {row.cycles.map((c) => (
                <CycleCell key={c.year} cycle={c} />
              ))}
            </div>

            <div
              className={cn(
                "font-mono text-[13px]",
                row.saldo != null && row.saldo < 0
                  ? "font-semibold text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {row.saldo == null ? "—" : formatPLN(row.saldo)}
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

        {/* legenda — oznaczenia cykli faktycznie występujące na liście */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t bg-muted/40 px-5 py-3">
          {(["PAID", "OVERDUE", "PENDING", "NA"] as CycleStatus[])
            .filter((st) => rows.some((r) => r.cycles.some((c) => c.status === st)))
            .map((st) => {
              const s = CYCLE_STYLE[st];
              return (
                <div
                  key={st}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <span
                    className="flex size-4 items-center justify-center rounded text-[10px] font-bold"
                    style={{ backgroundColor: s.bg, color: s.color }}
                  >
                    {s.mark}
                  </span>
                  {s.label}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
