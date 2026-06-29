"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startOwnFeePayment } from "@/lib/actions/fees";

// Przycisk „Zapłać teraz" na profilu — uruchamia płatność składki online.
// W razie powodzenia akcja serwerowa przekierowuje do Stripe Checkout; błąd
// (np. brak konfiguracji płatności) pokazujemy toastem, bez opuszczania strony.
export function PayFeeButton({ amountLabel }: { amountLabel: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="lg"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startOwnFeePayment();
          if (result?.error) toast.error(result.error);
        })
      }
    >
      {pending ? "Przekierowuję…" : `Zapłać ${amountLabel}`}
    </Button>
  );
}
