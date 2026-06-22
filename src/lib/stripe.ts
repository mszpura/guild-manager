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

// Tworzy hostowaną sesję Checkout (jednorazowa płatność w PLN).
// Metody płatności (karta/BLIK/Przelewy24) wg ustawień konta Stripe.
export async function createCheckoutSession(params: {
  amount: number; // grosze
  label: string;
  email: string;
  applicationId: string;
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
      metadata: { applicationId: params.applicationId },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });

    return session.url ? { id: session.id, url: session.url } : null;
  } catch (error) {
    console.error("[stripe] Nie udało się utworzyć sesji Checkout:", error);
    return null;
  }
}
