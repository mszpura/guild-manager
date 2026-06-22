import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { PaymentStatus } from "@/generated/prisma/client";

// Webhook Stripe — potwierdza opłacenie składki. Wymaga surowego body do
// weryfikacji podpisu, dlatego czytamy req.text() (bez parsowania).
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return new Response("Stripe nie jest skonfigurowany.", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Brak podpisu.", { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    return new Response("Nieprawidłowy podpis webhooka.", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const applicationId = session.metadata?.applicationId;
    if (applicationId) {
      // Idempotentnie: aktualizujemy tylko gdy nadal PENDING.
      await prisma.membershipApplication.updateMany({
        where: { id: applicationId, paymentStatus: PaymentStatus.PENDING },
        data: { paymentStatus: PaymentStatus.PAID },
      });
    }
  }

  return new Response(null, { status: 200 });
}
