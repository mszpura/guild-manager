"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  addResolutionType,
  updateResolutionType,
  deleteResolutionType,
} from "@/lib/actions/resolution-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ResolutionTypeItem = {
  id: string;
  name: string;
  voteThreshold: number;
  requiresMeeting: boolean;
  resolutionCount: number;
};

// Żeton informacyjny (próg głosów / tryb głosowania).
function Pill({
  label,
  tone,
}: {
  label: string;
  tone: "blue" | "green" | "amber" | "muted";
}) {
  const styles = {
    blue: { color: "#2f5fd0", bg: "#ecf1fc" },
    green: { color: "#2f7d4f", bg: "#e7f1ea" },
    amber: { color: "#9a6b1f", bg: "#fbf1de" },
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

// Pola wspólne formularza (dodawanie i edycja): próg głosów + wymóg spotkania.
function TypeFields({
  voteThreshold,
  requiresMeeting,
}: {
  voteThreshold: number;
  requiresMeeting: boolean;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor="voteThreshold" className="text-sm font-medium">
          Wymagany próg głosów
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="voteThreshold"
            name="voteThreshold"
            type="number"
            min={1}
            max={100}
            defaultValue={voteThreshold}
            className="h-9 w-24"
            required
          />
          <span className="text-sm text-muted-foreground">% głosów „za”</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Udział głosów „za” wśród oddanych, przy którym uchwała zostaje przyjęta.
        </p>
      </div>

      <label className="flex items-start gap-2.5 border-t pt-4 text-sm">
        <input
          type="checkbox"
          name="requiresMeeting"
          defaultChecked={requiresMeeting}
          className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
        />
        <span>
          <span className="font-medium text-foreground">
            Wymaga głosowania na spotkaniu
          </span>
          <span className="block text-xs text-muted-foreground">
            Głosowanie online w szczegółach uchwały jest dla takiego typu na razie
            wyłączone.
          </span>
        </span>
      </label>
    </>
  );
}

function TypeRow({ type }: { type: ResolutionTypeItem }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();

  function save(formData: FormData) {
    startSave(async () => {
      const res = await updateResolutionType(type.id, undefined, formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setError(undefined);
      setEditing(false);
      router.refresh();
      toast.success("Zapisano typ uchwały.");
    });
  }

  function remove() {
    startDelete(async () => {
      try {
        await deleteResolutionType(type.id);
        router.refresh();
        toast.success("Usunięto typ uchwały.");
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
          aria-label="Nazwa typu uchwały"
          required
        />
        <TypeFields
          voteThreshold={type.voteThreshold}
          requiresMeeting={type.requiresMeeting}
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
          {type.resolutionCount === 0 ? (
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
          {type.resolutionCount === 0
            ? "brak uchwał"
            : `${type.resolutionCount} uchwał`}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-1.5">
          <Pill label={`Próg ${type.voteThreshold}%`} tone="blue" />
          <Pill
            label={
              type.requiresMeeting
                ? "Głosowanie na spotkaniu"
                : "Głosowanie online"
            }
            tone={type.requiresMeeting ? "amber" : "green"}
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
      const res = await addResolutionType(organizationId, undefined, formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      router.refresh();
      toast.success("Dodano typ uchwały.");
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
        placeholder="Nazwa typu uchwały (np. Zmiana statutu)"
        className="h-9 w-72"
        required
        autoFocus
      />
      <TypeFields voteThreshold={50} requiresMeeting={false} />
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

export function ResolutionTypesManager({
  organizationId,
  resolutionTypes,
}: {
  organizationId: string;
  resolutionTypes: ResolutionTypeItem[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-4 border-b px-6 py-5">
        <div>
          <h3 className="font-heading text-base font-bold text-foreground">
            Typy uchwał
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Zdefiniuj typy uchwał — wymagany próg głosów oraz to, czy głosowanie
            musi odbyć się na spotkaniu. Uchwała dziedziczy te ustawienia po
            wybranym typie.
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

      {resolutionTypes.length === 0 && !adding ? (
        <p className="px-6 py-8 text-center text-sm text-muted-foreground">
          Brak typów uchwał. Dodaj pierwszy, aby móc tworzyć uchwały.
        </p>
      ) : null}

      {resolutionTypes.map((type) => (
        <TypeRow key={type.id} type={type} />
      ))}

      {adding ? (
        <AddTypeRow
          organizationId={organizationId}
          onDone={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}
