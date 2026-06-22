"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import {
  setMembershipPaid,
  addPaymentTier,
  deletePaymentTier,
  type TierFormState,
} from "@/lib/actions/payments";
import { formatPLN } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";

type Tier = { id: string; label: string; amount: number };

export function PaymentSettings({
  organizationId,
  membershipPaid,
  tiers,
}: {
  organizationId: string;
  membershipPaid: boolean;
  tiers: Tier[];
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
              ? "Zgłaszający wybiera próg składki i opłaca ją po wysłaniu formularza."
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
        <TierManager organizationId={organizationId} tiers={tiers} />
      ) : null}
    </div>
  );
}

function TierManager({
  organizationId,
  tiers,
}: {
  organizationId: string;
  tiers: Tier[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const action = addPaymentTier.bind(null, organizationId);
  const [state, formAction, pending] = useActionState<TierFormState, FormData>(
    action,
    undefined,
  );
  const [deleting, startDelete] = useTransition();

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      toast.success("Dodano próg składki.");
    }
  }, [state]);

  function remove(id: string) {
    startDelete(async () => {
      await deletePaymentTier(id);
      router.refresh();
      toast.success("Usunięto próg.");
    });
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground">
        Progi składki
      </h3>

      {tiers.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {tiers.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <span>
                <span className="font-medium">{t.label}</span>
                <span className="ml-2 text-muted-foreground">
                  {formatPLN(t.amount)}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(t.id)}
                disabled={deleting}
                aria-label={`Usuń próg ${t.label}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Brak progów. Dodaj pierwszy poniżej.
        </p>
      )}

      <form ref={formRef} action={formAction} className="flex items-end gap-3">
        <Field className="flex-1">
          <FieldLabel htmlFor="tier-label">Nazwa progu</FieldLabel>
          <Input id="tier-label" name="label" placeholder="np. Dzieci" required />
        </Field>
        <Field className="w-32">
          <FieldLabel htmlFor="tier-amount">Kwota (zł)</FieldLabel>
          <Input
            id="tier-amount"
            name="amount"
            inputMode="decimal"
            placeholder="70"
            required
          />
        </Field>
        <Button type="submit" disabled={pending} className="mb-0.5">
          <Plus className="size-4" />
          Dodaj
        </Button>
      </form>
      {state?.error ? <FieldError>{state.error}</FieldError> : null}
    </div>
  );
}
