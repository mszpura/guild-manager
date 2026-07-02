"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, Search } from "lucide-react";
import { setFeePaid, sendFeeReminders, sendFeeReminder } from "@/lib/actions/fees";
import { formatPLN } from "@/lib/money";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const selectClass =
  "h-9 rounded-md border bg-card px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export type FeeStatus = "PAID" | "OVERDUE" | "PENDING" | "EXEMPT";
export type CycleStatus = "PAID" | "OVERDUE" | "PENDING" | "NA";

export type FeeCycle = {
  year: number;
  short: string; // np. „'26"
  label: string; // pełny opis okresu (tooltip)
  status: CycleStatus;
};

export type FeeRow = {
  memberId: string;
  name: string;
  initials: string;
  roleName: string;
  rate: number | null; // roczna składka z roli (grosze); null = zwolniony ze składek
  saldo: number | null; // saldo (grosze, ≤ 0), null gdy zwolniony
  status: FeeStatus; // status bieżącego okresu (filtry/statystyki)
  cycles: FeeCycle[]; // historia cykli (siatka), od najstarszego do bieżącego
  paidYears: number[]; // wszystkie opłacone lata — do listy okresów w oknie rozliczenia
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

export type Filter = "ALL" | "PAID" | "UNPAID" | "EXEMPT";

// Polska odmiana: „1 osoba zalega", „2 osoby zalegają", „5 osób zalega".
function debtorsLabel(n: number): string {
  const ones = n % 10;
  const tens = n % 100;
  if (n === 1) return "1 osoba zalega";
  if (ones >= 2 && ones <= 4 && !(tens >= 12 && tens <= 14))
    return `${n} osoby zalegają`;
  return `${n} osób zalega`;
}

// Polska odmiana rzeczownika „przypomnienie": 1 → „przypomnienie",
// 2–4 → „przypomnienia", pozostałe → „przypomnień".
function remindersNoun(n: number): string {
  const ones = n % 10;
  const tens = n % 100;
  if (n === 1) return "przypomnienie";
  if (ones >= 2 && ones <= 4 && !(tens >= 12 && tens <= 14)) return "przypomnienia";
  return "przypomnień";
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

// Karta „Przypomnienia" (granatowa) — podsumowanie zaległości + zbiorcza wysyłka
// przypomnień e-mail do dłużników bieżącego roku. Sama wysyłka wymaga MEMBERS WRITE
// (canManage); osoby z samym odczytem widzą jedynie podsumowanie.
function RemindersCard({
  organizationId,
  year,
  debtorCount,
  canManage,
}: {
  organizationId: string;
  year: number;
  debtorCount: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sending, startSend] = useTransition();

  function send() {
    startSend(async () => {
      const result = await sendFeeReminders(organizationId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (result.total === 0) {
        toast.info("Brak zaległości — nie wysłano przypomnień.");
      } else if (result.failed === 0) {
        toast.success(
          `Wysłano ${result.sent} ${remindersNoun(result.sent)}.`,
        );
      } else {
        toast.warning(
          `Wysłano ${result.sent} z ${result.total} — ${result.failed} nie powiodło się.`,
        );
      }
      setOpen(false);
      router.refresh();
    });
  }

  const hasDebtors = debtorCount > 0;

  return (
    <div className="flex flex-col rounded-xl bg-brand p-[18px] text-brand-foreground">
      <div className="text-[11.5px] font-bold tracking-wide text-[#8ea3c9] uppercase">
        Przypomnienia
      </div>
      <p className="mt-2 mb-3.5 flex-1 text-[13.5px] leading-snug text-[#cdd5e6]">
        {hasDebtors
          ? `${debtorsLabel(debtorCount)} ze składką za ${year}.`
          : `Brak zaległości — wszyscy opłacili składkę za ${year}.`}
      </p>
      {hasDebtors && canManage ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-[13px] font-bold text-primary-foreground transition-colors hover:bg-primary/85"
            >
              <Bell className="size-3.5" />
              Wyślij {debtorCount} {remindersNoun(debtorCount)}
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Wyślij przypomnienia o składce</DialogTitle>
              <DialogDescription>
                Do {debtorCount} {debtorCount === 1 ? "osoby" : "osób"} zalegających
                ze składką za {year} zostanie wysłany e-mail z przypomnieniem.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Anuluj
              </Button>
              <Button type="button" onClick={send} disabled={sending}>
                {sending
                  ? "Wysyłam…"
                  : `Wyślij ${debtorCount} ${remindersNoun(debtorCount)}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
// Z `onClick` staje się klikalna (otwiera rozliczenie składki za dany rok).
function CycleCell({ cycle, onClick }: { cycle: FeeCycle; onClick?: () => void }) {
  const s = CYCLE_STYLE[cycle.status];
  const interactive = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={cn(
        "flex flex-col items-center gap-1 rounded-md",
        interactive
          ? "cursor-pointer transition-opacity hover:opacity-70"
          : "cursor-default",
      )}
      title={
        interactive
          ? `${cycle.label}: ${s.label} — kliknij, aby rozliczyć`
          : `${cycle.label}: ${s.label}`
      }
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
    </button>
  );
}

// Formularz rozliczenia składki: wybór okresu (kwota wynika z roli członka).
function SettleFeeDialog({
  open,
  onOpenChange,
  initialYear,
  memberId,
  memberName,
  rate,
  year,
  foundedYear,
  paidYears,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialYear: number | null; // rok klikniętej komórki — podstawiany przy otwarciu
  memberId: string;
  memberName: string;
  rate: number | null; // roczna składka z roli (grosze)
  year: number;
  foundedYear: number | null;
  paidYears: number[];
}) {
  const router = useRouter();
  // Okresy do rozliczenia: od roku założenia stowarzyszenia (gdy jest starsze niż
  // bieżący rok) do bieżącego — malejąco. Bez roku założenia tylko bieżący rok.
  const periods = useMemo(() => {
    const start = foundedYear != null && foundedYear < year ? foundedYear : year;
    const list: { year: number; paid: boolean }[] = [];
    for (let y = year; y >= start; y--) {
      list.push({ year: y, paid: paidYears.includes(y) });
    }
    return list;
  }, [foundedYear, year, paidYears]);

  const [yearSel, setYearSel] = useState(String(year));
  const [saving, startSave] = useTransition();

  // Przy każdym otwarciu ustaw okres: kliknięty rok (initialYear), a gdy go brak —
  // pierwszy nieopłacony (od najnowszego), inaczej bieżący. Wzorzec „dostosuj stan
  // przy zmianie propsa w trakcie renderu" — bez useEffect (zob. react.dev).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const firstUnpaid = periods.find((p) => !p.paid)?.year ?? year;
      setYearSel(String(initialYear ?? firstUnpaid));
    }
  }

  const selected = periods.find((p) => String(p.year) === yearSel);
  const isPaid = selected?.paid ?? false;

  function submit() {
    startSave(async () => {
      try {
        if (isPaid) {
          await setFeePaid(memberId, Number(yearSel), false);
          toast.success(`Cofnięto rozliczenie składki za ${yearSel}.`);
        } else {
          await setFeePaid(memberId, Number(yearSel), true);
          toast.success(`Rozliczono składkę za ${yearSel}.`);
        }
        router.refresh();
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rozlicz składkę</DialogTitle>
          <DialogDescription>{memberName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Okres rozliczeniowy</span>
            <select
              value={yearSel}
              onChange={(e) => setYearSel(e.target.value)}
              className={selectClass}
            >
              {periods.map((p) => (
                <option key={p.year} value={p.year}>
                  {p.year}
                  {p.paid ? " — opłacona" : ""}
                </option>
              ))}
            </select>
          </label>

          {isPaid ? (
            <p className="text-sm text-muted-foreground">
              Ten okres jest już rozliczony — możesz cofnąć rozliczenie.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Kwota składki wynika z roli członka:{" "}
              <span className="font-semibold text-foreground">
                {rate != null ? formatPLN(rate) : "—"}
              </span>
              .
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={saving}
            variant={isPaid ? "destructive" : "default"}
          >
            {isPaid ? "Cofnij rozliczenie" : "Oznacz opłaconą"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Wiersz listy składek. Komórki kolumny „Okres składkowy" są klikalne i otwierają
// okno rozliczenia z podstawionym rokiem klikniętego okresu (zastępuje dawny przycisk
// „Oznacz opłaconą"). Kolumna „Akcja" pozwala wysłać przypomnienie, gdy bieżąca
// składka nie jest rozliczona.
function FeeRowItem({
  row,
  year,
  foundedYear,
  canManage,
}: {
  row: FeeRow;
  year: number;
  foundedYear: number | null;
  canManage: boolean;
}) {
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleYear, setSettleYear] = useState<number | null>(null);
  const [reminding, startRemind] = useTransition();

  function openSettle(y: number) {
    setSettleYear(y);
    setSettleOpen(true);
  }

  function remind() {
    startRemind(async () => {
      const result = await sendFeeReminder(row.memberId);
      if ("error" in result) toast.error(result.error);
      else toast.success(`Wysłano przypomnienie do ${row.name}.`);
    });
  }

  // Typ i stawka pod nazwą członka — jak w projekcie: „Rola · 120,00 zł / rok"
  // albo „Rola · zwolniony ze składki" dla ról bez kwoty.
  const typeRate =
    row.status === "EXEMPT" || row.rate == null
      ? `${row.roleName} · zwolniony ze składki`
      : `${row.roleName} · ${formatPLN(row.rate)} / rok`;

  return (
    <div className="grid grid-cols-[minmax(180px,1fr)_220px_96px_150px] items-center gap-4 border-b px-5 py-3.5 transition-colors last:border-b-0 hover:bg-muted/40">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
          {row.initials}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {row.name}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {typeRate}
          </div>
        </div>
      </div>

      {/* okres składkowy — klikalne komórki otwierają rozliczenie z danym rokiem */}
      <div className="flex gap-2">
        {row.cycles.map((c) => (
          <CycleCell
            key={c.year}
            cycle={c}
            onClick={
              canManage && c.status !== "NA" ? () => openSettle(c.year) : undefined
            }
          />
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

      {/* akcja — przypomnienie o nierozliczonej składce */}
      <div className="flex justify-end">
        {canManage && row.status !== "PAID" && row.status !== "EXEMPT" ? (
          <button
            type="button"
            onClick={remind}
            disabled={reminding}
            className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-card px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
          >
            <Bell className="size-3.5" />
            {reminding ? "Wysyłam…" : "Przypomnij"}
          </button>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </div>

      {canManage ? (
        <SettleFeeDialog
          open={settleOpen}
          onOpenChange={setSettleOpen}
          initialYear={settleYear}
          memberId={row.memberId}
          memberName={row.name}
          rate={row.rate}
          year={year}
          foundedYear={foundedYear}
          paidYears={row.paidYears}
        />
      ) : null}
    </div>
  );
}

export function FeesManager({
  organizationId,
  year,
  foundedYear,
  rows,
  canManage,
  collected,
  charged,
  arrears,
  debtorCount,
  initialFilter = "ALL",
}: {
  organizationId: string;
  year: number;
  foundedYear: number | null;
  rows: FeeRow[];
  canManage: boolean;
  collected: number; // zebrano w bieżącym roku (grosze)
  charged: number; // naliczono w bieżącym roku (grosze)
  arrears: number; // suma zaległości (grosze)
  debtorCount: number; // liczba członków z zaległościami
  initialFilter?: Filter; // filtr początkowy z URL (np. przejście z pulpitu)
}) {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const paid = rows.filter((r) => r.status === "PAID").length;
    const exempt = rows.filter((r) => r.status === "EXEMPT").length;
    // Zwolnieni ze składek nie są ani „opłaceni", ani „nieopłaceni".
    return { all: rows.length, paid, exempt, unpaid: rows.length - paid - exempt };
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
      // „Nieopłacone" pomija też zwolnionych ze składek.
      if (filter === "UNPAID" && (r.status === "PAID" || r.status === "EXEMPT"))
        return false;
      if (filter === "EXEMPT" && r.status !== "EXEMPT") return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filter, query]);

  return (
    <div className="space-y-6">
      {/* karty statystyk */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <RemindersCard
          organizationId={organizationId}
          year={year}
          debtorCount={debtorCount}
          canManage={canManage}
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
          <FilterChip
            active={filter === "EXEMPT"}
            count={counts.exempt}
            onClick={() => setFilter("EXEMPT")}
          >
            Zwolnieni
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
        <div className="grid grid-cols-[minmax(180px,1fr)_220px_96px_150px] gap-4 border-b px-5 py-3 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
          <span>Członek</span>
          <span className="text-center">Okres składkowy</span>
          <span className="text-center">Saldo</span>
          <span className="text-center">Akcja</span>
        </div>

        {visible.map((row) => (
          <FeeRowItem
            key={row.memberId}
            row={row}
            year={year}
            foundedYear={foundedYear}
            canManage={canManage}
          />
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
