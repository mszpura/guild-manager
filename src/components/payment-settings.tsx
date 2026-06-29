"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  setMembershipPaid,
  setRoleFee,
  setFeeDueDate,
  type TierFormState,
} from "@/lib/actions/payments";
import { MONTHS_NOM, formatFeeDueDate } from "@/lib/payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";

type RoleFee = { id: string; name: string; feeAmount: number | null };

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
        <>
          <FeeDueDateForm
            organizationId={organizationId}
            feeDueMonth={feeDueMonth}
            feeDueDay={feeDueDay}
          />
          <RoleFeeManager roles={roles} />
        </>
      ) : null}
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

// Składka roczna per rola. Każda rola jest domyślnie zwolniona ze składek; podanie
// kwoty obciąża rolę składką, a wyczyszczenie pola przywraca zwolnienie.
function RoleFeeManager({ roles }: { roles: RoleFee[] }) {
  return (
    <div className="space-y-3 border-t pt-6">
      <div>
        <h3 className="text-sm font-medium">Składki według ról</h3>
        <p className="text-sm text-muted-foreground">
          Każda rola jest domyślnie zwolniona ze składek. Podaj roczną kwotę, aby
          obciążyć daną rolę składką (puste pole = zwolnienie ze składek).
        </p>
      </div>
      <ul className="divide-y rounded-md border">
        {roles.map((role) => (
          <RoleFeeRow key={role.id} role={role} />
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

function RoleFeeRow({ role }: { role: RoleFee }) {
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

  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{role.name}</div>
        <div className="text-xs text-muted-foreground">
          {exempt ? "Zwolniona ze składek" : "Składka roczna"}
        </div>
      </div>
      <div className="flex items-center gap-2">
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
      </div>
    </li>
  );
}
