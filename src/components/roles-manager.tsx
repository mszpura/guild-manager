"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus, Lock } from "lucide-react";
import {
  addRole,
  updateRole,
  deleteRole,
  type RoleFormState,
} from "@/lib/actions/roles";
import {
  AREAS,
  LEVELS,
  AREA_LABELS,
  LEVEL_LABELS,
  getLevel,
  type Area,
} from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type RoleItem = {
  id: string;
  name: string;
  permissions: unknown;
  isOwner: boolean;
  isSystem: boolean;
};

// Pojedynczy select poziomu uprawnień dla obszaru.
function PermSelect({
  area,
  value,
  disabled,
}: {
  area: Area;
  value: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{AREA_LABELS[area]}</span>
      <select
        name={`perm_${area}`}
        defaultValue={value}
        disabled={disabled}
        className="h-9 rounded-md border bg-transparent px-2 text-sm disabled:opacity-60"
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

function PermGrid({
  permissions,
  disabled,
}: {
  permissions: unknown;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
      {AREAS.map((area) => (
        <PermSelect
          key={area}
          area={area}
          value={getLevel(permissions, area)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function RoleCard({ role }: { role: RoleItem }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<RoleFormState, FormData>(
    updateRole.bind(null, role.id),
    undefined,
  );
  const [deleting, startDelete] = useTransition();

  useEffect(() => {
    if (state?.ok) toast.success("Zapisano rolę.");
  }, [state]);

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

  return (
    <form action={formAction} className="space-y-3 rounded-md border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {role.isSystem ? (
            <span className="font-medium">{role.name}</span>
          ) : (
            <Input
              name="name"
              defaultValue={role.name}
              className="h-8 w-48"
              aria-label="Nazwa roli"
            />
          )}
          {role.isOwner ? (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Lock className="size-3" /> pełne uprawnienia
            </Badge>
          ) : role.isSystem ? (
            <Badge variant="secondary" className="text-[10px]">
              systemowa
            </Badge>
          ) : null}
        </div>
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

      <PermGrid permissions={role.permissions} disabled={role.isOwner} />

      {state?.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      {!role.isOwner ? (
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Zapisywanie…" : "Zapisz"}
        </Button>
      ) : null}
    </form>
  );
}

function AddRoleCard({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<RoleFormState, FormData>(
    addRole.bind(null, organizationId),
    undefined,
  );

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      toast.success("Dodano rolę.");
    }
  }, [state, router]);

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-md border border-dashed p-4"
    >
      <div className="flex items-center gap-2">
        <Input
          name="name"
          placeholder="Nazwa nowej roli (np. Skarbnik)"
          className="h-8 w-64"
          required
        />
      </div>
      <PermGrid permissions={{}} />
      {state?.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" size="sm" disabled={pending}>
        <Plus className="size-4" />
        Dodaj rolę
      </Button>
    </form>
  );
}

export function RolesManager({
  organizationId,
  roles,
}: {
  organizationId: string;
  roles: RoleItem[];
}) {
  return (
    <div className="space-y-4">
      {roles.map((role) => (
        <RoleCard key={role.id} role={role} />
      ))}
      <AddRoleCard organizationId={organizationId} />
    </div>
  );
}
