"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  setMembershipPaid,
  setRoleFee,
  setRoleShowInForm,
  setFeeDueDate,
  type TierFormState,
} from "@/lib/actions/payments";
import { MONTHS_NOM, formatFeeDueDate } from "@/lib/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type RoleFee = {
  id: string;
  name: string;
  feeAmount: number | null;
  isOwner: boolean;
  isDefault: boolean;
  showInForm: boolean;
};

export function PaymentSettings({
  organizationId,
  membershipPaid,
  roles,
  feeDueMonth,
  feeDueDay,
}: {
  organizationId: string;
  membershipPaid: boolean;
  roles: RoleFee[];
  feeDueMonth: number | null;
  feeDueDay: number | null;
}) {
  const router = useRouter();
  const [busy, startBusy] = useTransition();

  function togglePaid() {
    startBusy(async () => {
      await setMembershipPaid(organizationId, !membershipPaid);
      router.refresh();
      toast.success(
        membershipPaid ? "Członkostwo bezpłatne." : "Członkostwo płatne.",
      );
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium">Członkostwo płatne</p>
          <p className="text-sm text-muted-foreground">
            {membershipPaid
              ? "Wysokość składki ustalasz osobno dla każdej roli poniżej."
              : "Członkostwo jest bezpłatne — formularz bez płatności."}
          </p>
        </div>
        <Button
          type="button"
          variant={membershipPaid ? "default" : "outline"}
          onClick={togglePaid}
          disabled={busy}
        >
          {membershipPaid ? "Włączone" : "Wyłączone"}
        </Button>
      </div>

      {membershipPaid ? (
        <FeeDueDateForm
          organizationId={organizationId}
          feeDueMonth={feeDueMonth}
          feeDueDay={feeDueDay}
        />
      ) : null}

      <RoleListManager roles={roles} membershipPaid={membershipPaid} />
    </div>
  );
}

// Roczny termin opłacenia składki (dzień + miesiąc). Obsługujemy tylko składki roczne.
const inputClass =
  "h-10 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function FeeDueDateForm({
  organizationId,
  feeDueMonth,
  feeDueDay,
}: {
  organizationId: string;
  feeDueMonth: number | null;
  feeDueDay: number | null;
}) {
  const action = setFeeDueDate.bind(null, organizationId);
  const [state, formAction, pending] = useActionState<TierFormState, FormData>(
    action,
    undefined,
  );

  useEffect(() => {
    if (state?.ok) toast.success("Zapisano termin opłacenia składki.");
  }, [state]);

  const current = formatFeeDueDate(feeDueMonth, feeDueDay);

  return (
    <div className="space-y-3 border-t pt-6">
      <div>
        <h3 className="text-sm font-medium">Termin opłacenia składki</h3>
        <p className="text-sm text-muted-foreground">
          Coroczny termin wniesienia składki za dany rok (obsługujemy tylko
          składki roczne). Po tym dniu nieopłacona składka staje się zaległa.
          {current ? ` Obecnie: ${current}.` : " Obecnie nieustawiony."}
        </p>
      </div>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <Field className="w-24">
          <FieldLabel htmlFor="feeDueDay">Dzień</FieldLabel>
          <Input
            id="feeDueDay"
            name="feeDueDay"
            inputMode="numeric"
            placeholder="31"
            defaultValue={feeDueDay ?? ""}
          />
        </Field>
        <Field className="w-44">
          <FieldLabel htmlFor="feeDueMonth">Miesiąc</FieldLabel>
          <select
            id="feeDueMonth"
            name="feeDueMonth"
            defaultValue={feeDueMonth ?? ""}
            className={inputClass}
          >
            <option value="">—</option>
            {MONTHS_NOM.map((label, i) => (
              <option key={label} value={i + 1}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" disabled={pending} className="mb-0.5">
          Zapisz termin
        </Button>
      </form>
      {state?.error ? <FieldError>{state.error}</FieldError> : null}
    </div>
  );
}

// Lista ról: widoczność na formularzu zgłoszeniowym (zawsze) + roczna składka
// (gdy członkostwo płatne). Każda rola jest domyślnie zwolniona ze składek; podanie
// kwoty obciąża rolę składką, a wyczyszczenie pola przywraca zwolnienie.
function RoleListManager({
  roles,
  membershipPaid,
}: {
  roles: RoleFee[];
  membershipPaid: boolean;
}) {
  return (
    <div className="space-y-3 border-t pt-6">
      <div>
        <h3 className="text-sm font-medium">
          {membershipPaid ? "Role — formularz i składki" : "Role na formularzu"}
        </h3>
        <p className="text-sm text-muted-foreground">
          Zaznacz role, które mają być dostępne do wyboru na formularzu
          zgłoszeniowym. Gdy do wyboru jest więcej niż jedna rola, zgłaszający
          wybiera tę, do której dołącza i którą opłaca — Zarząd weryfikuje wybór
          przy zatwierdzaniu.
          {membershipPaid
            ? " Roczną składkę ustalasz osobno dla każdej roli (puste pole = zwolnienie ze składek)."
            : ""}
        </p>
      </div>
      <ul className="divide-y rounded-md border">
        {roles.map((role) => (
          <RoleRow key={role.id} role={role} membershipPaid={membershipPaid} />
        ))}
      </ul>
    </div>
  );
}

// Grosze → wartość wejściowa w złotówkach (np. 10000 → „100", 10050 → „100,50").
function groszeToInput(amount: number | null): string {
  if (amount == null) return "";
  return amount % 100 === 0
    ? String(amount / 100)
    : (amount / 100).toFixed(2).replace(".", ",");
}

// Przełącznik widoczności roli na formularzu. Prezes (isOwner) jest zablokowany w
// pozycji wyłączonej, rola domyślna (Członek, isDefault) — w pozycji włączonej.
function ShowInFormToggle({ role }: { role: RoleFee }) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const locked = role.isOwner || role.isDefault;
  const on = role.isDefault ? true : role.isOwner ? false : role.showInForm;

  function toggle() {
    if (locked) return;
    startSave(async () => {
      const res = await setRoleShowInForm(role.id, !on);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      router.refresh();
      toast.success(
        on
          ? `Rola „${role.name}" ukryta na formularzu.`
          : `Rola „${role.name}" pokazana na formularzu.`,
      );
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Pokaż rolę ${role.name} na formularzu`}
      onClick={toggle}
      disabled={locked || saving}
      title={
        role.isOwner
          ? "Roli Prezesa nie można pokazać na formularzu."
          : role.isDefault
            ? "Rola domyślna jest zawsze pokazana na formularzu."
            : undefined
      }
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        on ? "bg-primary" : "bg-input",
        locked ? "opacity-60" : "cursor-pointer",
      )}
    >
      <span
        className={cn(
          "inline-block size-4 rounded-full bg-background shadow transition-transform",
          on ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function RoleRow({
  role,
  membershipPaid,
}: {
  role: RoleFee;
  membershipPaid: boolean;
}) {
  const router = useRouter();
  const initial = groszeToInput(role.feeAmount);
  const [value, setValue] = useState(initial);
  const [saving, startSave] = useTransition();

  const dirty = value.trim() !== initial.trim();
  const exempt = value.trim() === "";

  function save() {
    startSave(async () => {
      const res = await setRoleFee(role.id, value);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      router.refresh();
      toast.success(
        exempt
          ? `Rola „${role.name}" zwolniona ze składek.`
          : `Zapisano składkę roli „${role.name}".`,
      );
    });
  }

  // Podpis pod nazwą roli: status widoczności na formularzu (+ składka, gdy płatne).
  const visHint = role.isOwner
    ? "Niedostępna na formularzu"
    : role.isDefault
      ? "Zawsze na formularzu"
      : role.showInForm
        ? "Na formularzu"
        : "Ukryta na formularzu";
  const subtitle = membershipPaid
    ? `${visHint} · ${exempt ? "zwolniona ze składek" : "składka roczna"}`
    : visHint;

  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{role.name}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <div className="flex items-center gap-3">
        {membershipPaid ? (
          <>
            <div className="relative w-28">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="decimal"
                placeholder="—"
                aria-label={`Roczna składka roli ${role.name}`}
                className="h-9 w-full rounded-md border border-input bg-transparent pr-8 pl-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
                zł
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={save}
              disabled={saving || !dirty}
            >
              Zapisz
            </Button>
          </>
        ) : null}
        <ShowInFormToggle role={role} />
      </div>
    </li>
  );
}
