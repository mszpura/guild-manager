import "server-only";
import Stripe from "stripe";

// Leniwy klient Stripe. Brak STRIPE_SECRET_KEY → null (płatności wyłączone,
// aplikacja nie wywala się — łagodnie jak przy e-mailu).
let cached: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  cached = key ? new Stripe(key) : null;
  return cached;
}

// Tworzy hostowaną sesję Checkout (jednorazowa płatność w PLN). Metadane wracają
// w webhooku i decydują, co potwierdzić (zgłoszenie albo składkę członka).
// Metody płatności (karta/BLIK/Przelewy24) wg ustawień konta Stripe.
async function createCheckout(params: {
  amount: number; // grosze
  label: string;
  email: string;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string } | null> {
  const stripe = getStripe();
  if (!stripe) return null;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: params.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "pln",
            unit_amount: params.amount,
            product_data: { name: `Składka członkowska — ${params.label}` },
          },
        },
      ],
      metadata: params.metadata,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });

    return session.url ? { id: session.id, url: session.url } : null;
  } catch (error) {
    console.error("[stripe] Nie udało się utworzyć sesji Checkout:", error);
    return null;
  }
}

// Sesja Checkout dla płatności składki ze zgłoszenia (publiczny formularz).
export async function createCheckoutSession(params: {
  amount: number; // grosze
  label: string;
  email: string;
  applicationId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string } | null> {
  return createCheckout({
    amount: params.amount,
    label: params.label,
    email: params.email,
    metadata: { applicationId: params.applicationId },
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
  });
}

// Sesja Checkout dla samodzielnego opłacenia rocznej składki przez członka
// (z poziomu „Mój profil"). Metadane (kind=fee) pozwalają webhookowi odnotować
// wpłatę w rejestrze składek bez udziału skarbnika.
export async function createFeeCheckoutSession(params: {
  amount: number; // grosze
  label: string;
  email: string;
  organizationId: string;
  memberId: string;
  year: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string } | null> {
  return createCheckout({
    amount: params.amount,
    label: params.label,
    email: params.email,
    metadata: {
      kind: "fee",
      organizationId: params.organizationId,
      memberId: params.memberId,
      year: String(params.year),
    },
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
  });
}
