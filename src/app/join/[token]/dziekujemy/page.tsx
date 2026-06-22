import { CheckCircle2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Publiczna strona powrotu ze Stripe Checkout (success_url). Sam status płatności
// potwierdza webhook — tu tylko podziękowanie.
export default function ThankYouPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="size-10 text-green-600" />
          <CardTitle>Dziękujemy!</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          Twoje zgłoszenie zostało przyjęte. Jeśli płatność została zakończona,
          status zaktualizuje się automatycznie. Administrator stowarzyszenia
          rozpatrzy zgłoszenie.
        </CardContent>
      </Card>
    </main>
  );
}
