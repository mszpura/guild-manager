"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  addMeetingType,
  updateMeetingType,
  deleteMeetingType,
} from "@/lib/actions/meeting-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RoleOption = { id: string; name: string };

type MeetingTypeItem = {
  id: string;
  name: string;
  requiresQuorum: boolean;
  roleIds: string[];
  meetingCount: number;
};

// Żeton informacyjny (rola udziału / wymóg kworum).
function Pill({
  label,
  tone,
}: {
  label: string;
  tone: "blue" | "green" | "muted";
}) {
  const styles = {
    blue: { color: "#2f5fd0", bg: "#ecf1fc" },
    green: { color: "#2f7d4f", bg: "#e7f1ea" },
    muted: { color: "#56627d", bg: "#f1f3f8" },
  } as const;
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

// Pola wspólne formularza (dodawanie i edycja): role udziału + wymóg kworum.
function TypeFields({
  roles,
  selectedRoleIds,
  requiresQuorum,
}: {
  roles: RoleOption[];
  selectedRoleIds: string[];
  requiresQuorum: boolean;
}) {
  return (
    <>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Role biorące udział</legend>
        <p className="text-xs text-muted-foreground">
          Nie zaznaczaj żadnej roli, aby w spotkaniach tego typu brali udział
          wszyscy członkowie.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {roles.map((r) => (
            <label
              key={r.id}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                name="roleIds"
                value={r.id}
                defaultChecked={selectedRoleIds.includes(r.id)}
                className="size-4 rounded border-input accent-primary"
              />
              {r.name}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-start gap-2.5 border-t pt-4 text-sm">
        <input
          type="checkbox"
          name="requiresQuorum"
          defaultChecked={requiresQuorum}
          className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
        />
        <span>
          <span className="font-medium text-foreground">Wymaga kworum</span>
          <span className="block text-xs text-muted-foreground">
            Do ważnego głosowania potrzebna jest obecność wymaganej większości
            uprawnionych.
          </span>
        </span>
      </label>
    </>
  );
}

function TypeRow({
  type,
  roles,
}: {
  type: MeetingTypeItem;
  roles: RoleOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();

  const roleNames = type.roleIds.length
    ? roles
        .filter((r) => type.roleIds.includes(r.id))
        .map((r) => r.name)
    : [];

  function save(formData: FormData) {
    startSave(async () => {
      const res = await updateMeetingType(type.id, undefined, formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setError(undefined);
      setEditing(false);
      router.refresh();
      toast.success("Zapisano typ spotkania.");
    });
  }

  function remove() {
    startDelete(async () => {
      try {
        await deleteMeetingType(type.id);
        router.refresh();
        toast.success("Usunięto typ spotkania.");
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
        <Input
          name="name"
          defaultValue={type.name}
          className="h-9 w-64"
          aria-label="Nazwa typu spotkania"
          required
        />
        <TypeFields
          roles={roles}
          selectedRoleIds={type.roleIds}
          requiresQuorum={type.requiresQuorum}
        />
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
          {type.meetingCount === 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto"
              onClick={remove}
              disabled={deleting}
              aria-label={`Usuń typ ${type.name}`}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 border-b px-6 py-4 transition-colors last:border-b-0 hover:bg-muted/40">
      <div className="w-48 shrink-0">
        <div className="text-sm font-bold text-foreground">{type.name}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {type.meetingCount === 0
            ? "brak spotkań"
            : `${type.meetingCount} spotkań`}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-1.5">
          {roleNames.length === 0 ? (
            <Pill label="Wszyscy członkowie" tone="muted" />
          ) : (
            roleNames.map((name) => <Pill key={name} label={name} tone="blue" />)
          )}
        </div>
        <div className="mt-2">
          <Pill
            label={type.requiresQuorum ? "Wymaga kworum" : "Bez kworum"}
            tone={type.requiresQuorum ? "green" : "muted"}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        <Pencil className="size-3.5" />
        Edytuj
      </button>
    </div>
  );
}

function AddTypeRow({
  organizationId,
  roles,
  onDone,
  onCancel,
}: {
  organizationId: string;
  roles: RoleOption[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startAdd] = useTransition();

  function add(formData: FormData) {
    startAdd(async () => {
      const res = await addMeetingType(organizationId, undefined, formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
      toast.success("Dodano typ spotkania.");
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
        placeholder="Nazwa typu spotkania (np. Komisja rewizyjna)"
        className="h-9 w-72"
        required
        autoFocus
      />
      <TypeFields roles={roles} selectedRoleIds={[]} requiresQuorum />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Dodawanie…" : "Dodaj typ"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Anuluj
        </Button>
      </div>
    </form>
  );
}

export function MeetingTypesManager({
  organizationId,
  meetingTypes,
  roles,
}: {
  organizationId: string;
  meetingTypes: MeetingTypeItem[];
  roles: RoleOption[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-4 border-b px-6 py-5">
        <div>
          <h3 className="font-heading text-base font-bold text-foreground">
            Typy spotkań
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Zdefiniuj typy spotkań — role biorące udział oraz wymóg kworum.
            Spotkania dziedziczą te ustawienia po wybranym typie.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setAdding(true)}
          disabled={adding}
        >
          <Plus className="size-4" />
          Dodaj typ
        </Button>
      </div>

      {meetingTypes.length === 0 && !adding ? (
        <p className="px-6 py-8 text-center text-sm text-muted-foreground">
          Brak typów spotkań. Dodaj pierwszy, aby móc planować spotkania.
        </p>
      ) : null}

      {meetingTypes.map((type) => (
        <TypeRow key={type.id} type={type} roles={roles} />
      ))}

      {adding ? (
        <AddTypeRow
          organizationId={organizationId}
          roles={roles}
          onDone={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}
