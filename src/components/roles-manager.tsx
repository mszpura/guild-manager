"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { addRole, updateRole, deleteRole } from "@/lib/actions/roles";
import {
  AREAS,
  LEVELS,
  AREA_LABELS,
  LEVEL_LABELS,
  getLevel,
  type Area,
  type Level,
} from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RoleItem = {
  id: string;
  name: string;
  permissions: unknown;
  isOwner: boolean;
  isSystem: boolean;
  feeExempt: boolean;
  canVote: boolean;
  memberCount: number;
};

// Przełącznik (checkbox) cechy roli — zwolnienie ze składek / prawo głosu.
function RoleFlag({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
      />
      <span>
        <span className="font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

// Kolory żetonów uprawnień wg poziomu dostępu — spójne z projektem „Associacion".
const LEVEL_STYLE: Record<Level, { color: string; bg: string }> = {
  WRITE: { color: "#2f7d4f", bg: "#e7f1ea" },
  READ: { color: "#2f5fd0", bg: "#ecf1fc" },
  NONE: { color: "#9aa3b8", bg: "#f1f3f8" },
};

// Polska odmiana rzeczownika „osoba" zależnie od liczby.
function membersLabel(n: number): string {
  if (n === 1) return "1 osoba";
  const ones = n % 10;
  const tens = n % 100;
  if (ones >= 2 && ones <= 4 && !(tens >= 12 && tens <= 14)) return `${n} osoby`;
  return `${n} osób`;
}

// Żeton jednego obszaru, pokolorowany poziomem dostępu danej roli.
function PermPill({ area, level }: { area: Area; level: Level }) {
  const s = LEVEL_STYLE[level];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
      style={{ color: s.color, backgroundColor: s.bg }}
      title={`${AREA_LABELS[area]}: ${LEVEL_LABELS[level]}`}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: s.color }}
      />
      {AREA_LABELS[area]}
    </span>
  );
}

// Żeton cechy roli (prawo głosu / składki) — zawsze widoczny przy każdej roli,
// żeby na liście było jasne, czy rola głosuje i czy płaci składki.
function AttrPill({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "blue" | "muted";
}) {
  const styles: Record<typeof tone, { color: string; bg: string }> = {
    green: { color: "#2f7d4f", bg: "#e7f1ea" },
    blue: { color: "#2f5fd0", bg: "#ecf1fc" },
    muted: { color: "#56627d", bg: "#f1f3f8" },
  };
  const s = styles[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
      {label}
    </span>
  );
}

// Pełen, czytelny rząd żetonów dla wszystkich obszarów — sedno tej zakładki.
function PermPills({ permissions }: { permissions: unknown }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {AREAS.map((area) => (
        <PermPill key={area} area={area} level={getLevel(permissions, area)} />
      ))}
    </div>
  );
}

// Pojedynczy select poziomu uprawnień dla obszaru (tryb edycji).
function PermSelect({ area, value }: { area: Area; value: Level }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-muted-foreground">
        {AREA_LABELS[area]}
      </span>
      <select
        name={`perm_${area}`}
        defaultValue={value}
        className="h-9 rounded-md border bg-transparent px-2 text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {LEVELS.map((l) => (
          <option key={l} value={l}>
            {LEVEL_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

function PermGrid({ permissions }: { permissions: unknown }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
      {AREAS.map((area) => (
        <PermSelect key={area} area={area} value={getLevel(permissions, area)} />
      ))}
    </div>
  );
}

function RoleRow({ role }: { role: RoleItem }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();

  function save(formData: FormData) {
    startSave(async () => {
      const res = await updateRole(role.id, undefined, formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setError(undefined);
      setEditing(false);
      toast.success("Zapisano rolę.");
    });
  }

  function remove() {
    startDelete(async () => {
      try {
        await deleteRole(role.id);
        router.refresh();
        toast.success("Usunięto rolę.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się usunąć.");
      }
    });
  }

  if (editing) {
    return (
      <form
        action={save}
        className="space-y-4 border-b bg-muted/30 px-6 py-5 last:border-b-0"
      >
        <div className="flex items-center justify-between gap-3">
          {role.isSystem ? (
            <span className="text-sm font-bold text-foreground">{role.name}</span>
          ) : (
            <Input
              name="name"
              defaultValue={role.name}
              className="h-9 w-56"
              aria-label="Nazwa roli"
            />
          )}
          {!role.isSystem ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={remove}
              disabled={deleting}
              aria-label={`Usuń rolę ${role.name}`}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </div>

        <PermGrid permissions={role.permissions} />

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:gap-8">
          <RoleFlag
            name="canVote"
            label="Może głosować"
            hint="Prawo głosu w uchwałach i punktach obrad."
            defaultChecked={role.canVote}
          />
          <RoleFlag
            name="feeExempt"
            label="Zwolniona ze składek"
            hint="Członkowie tej roli nie opłacają składek."
            defaultChecked={role.feeExempt}
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Zapisywanie…" : "Zapisz"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setError(undefined);
              setEditing(false);
            }}
          >
            Anuluj
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 border-b px-6 py-4 transition-colors last:border-b-0 hover:bg-muted/40">
      <div className="w-44 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-foreground">{role.name}</span>
          {role.isOwner ? (
            <Lock className="size-3.5 text-muted-foreground" />
          ) : null}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {membersLabel(role.memberCount)}
          {role.isSystem && !role.isOwner ? " · systemowa" : ""}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <PermPills permissions={role.permissions} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <AttrPill
            label={role.canVote ? "Może głosować" : "Bez prawa głosu"}
            tone={role.canVote ? "green" : "muted"}
          />
          <AttrPill
            label={role.feeExempt ? "Zwolniona ze składek" : "Opłaca składki"}
            tone={role.feeExempt ? "muted" : "green"}
          />
        </div>
      </div>

      {role.isOwner ? (
        <span className="shrink-0 text-sm font-medium text-muted-foreground">
          pełny dostęp
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          <Pencil className="size-3.5" />
          Edytuj
        </button>
      )}
    </div>
  );
}

function AddRoleRow({
  organizationId,
  onDone,
  onCancel,
}: {
  organizationId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startAdd] = useTransition();

  function add(formData: FormData) {
    startAdd(async () => {
      const res = await addRole(organizationId, undefined, formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
      toast.success("Dodano rolę.");
      onDone();
    });
  }

  return (
    <form
      action={add}
      className="space-y-4 border-b bg-accent/40 px-6 py-5 last:border-b-0"
    >
      <Input
        name="name"
        placeholder="Nazwa nowej roli (np. Skarbnik)"
        className="h-9 w-64"
        required
        autoFocus
      />
      <PermGrid permissions={{}} />
      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:gap-8">
        <RoleFlag
          name="canVote"
          label="Może głosować"
          hint="Prawo głosu w uchwałach i punktach obrad."
          defaultChecked
        />
        <RoleFlag
          name="feeExempt"
          label="Zwolniona ze składek"
          hint="Członkowie tej roli nie opłacają składek."
          defaultChecked={false}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Dodawanie…" : "Dodaj rolę"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Anuluj
        </Button>
      </div>
    </form>
  );
}

// Legenda poziomów dostępu — odwzorowuje kolory żetonów.
function Legend() {
  const items: { level: Level; label: string }[] = [
    { level: "WRITE", label: "Odczyt i zapis" },
    { level: "READ", label: "Tylko odczyt" },
    { level: "NONE", label: "Brak dostępu" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t bg-muted/40 px-6 py-3.5">
      <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
        Poziom dostępu
      </span>
      {items.map(({ level, label }) => (
        <div
          key={level}
          className="flex items-center gap-2 text-xs text-secondary-foreground"
        >
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: LEVEL_STYLE[level].color }}
          />
          {label}
        </div>
      ))}
    </div>
  );
}

export function RolesManager({
  organizationId,
  roles,
}: {
  organizationId: string;
  roles: RoleItem[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-4 border-b px-6 py-5">
        <div>
          <h3 className="font-heading text-base font-bold text-foreground">
            Role i uprawnienia
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Określ poziom dostępu każdej roli do poszczególnych obszarów
            platformy.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setAdding(true)}
          disabled={adding}
        >
          <Plus className="size-4" />
          Dodaj rolę
        </Button>
      </div>

      {roles.map((role) => (
        <RoleRow key={role.id} role={role} />
      ))}

      {adding ? (
        <AddRoleRow
          organizationId={organizationId}
          onDone={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      <Legend />
    </div>
  );
}
