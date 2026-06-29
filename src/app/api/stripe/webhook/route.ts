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
    const meta = session.metadata ?? {};

    if (meta.kind === "fee" && meta.memberId && meta.organizationId) {
      // Samodzielna wpłata składki przez członka — odnotowujemy ją w rejestrze
      // bez udziału skarbnika. Idempotentnie: gdy składka za dany rok już istnieje,
      // nie nadpisujemy (powtórna dostawa webhooka nie zmienia daty/kwoty wpłaty).
      const year = Number(meta.year);
      if (Number.isInteger(year)) {
        await prisma.membershipFee.upsert({
          where: { memberId_year: { memberId: meta.memberId, year } },
          create: {
            organizationId: meta.organizationId,
            memberId: meta.memberId,
            year,
            amount: session.amount_total ?? null,
          },
          update: {},
        });
      }
    } else if (meta.applicationId) {
      // Płatność składki ze zgłoszenia. Idempotentnie: aktualizujemy tylko gdy PENDING.
      await prisma.membershipApplication.updateMany({
        where: { id: meta.applicationId, paymentStatus: PaymentStatus.PENDING },
        data: { paymentStatus: PaymentStatus.PAID },
      });
    }
  }

  return new Response(null, { status: 200 });
}
