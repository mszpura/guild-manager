import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Zaloguj się</CardTitle>
          <CardDescription>
            System zarządzania stowarzyszeniem
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {sent ? (
            <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">
              Wysłaliśmy link do logowania na podany adres e-mail. Sprawdź
              skrzynkę.
            </p>
          ) : null}

          {/* Logowanie przez Google */}
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
          >
            <Button type="submit" variant="outline" className="w-full">
              Zaloguj przez Google
            </Button>
          </form>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">lub</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Magic link na e-mail */}
          <form
            action={async (formData: FormData) => {
              "use server";
              await signIn("nodemailer", {
                email: String(formData.get("email") ?? ""),
                redirectTo: "/dashboard",
              });
            }}
            className="space-y-3"
          >
            <Field>
              <FieldLabel htmlFor="email">Adres e-mail</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="ty@example.com"
                required
              />
            </Field>
            <Button type="submit" className="w-full">
              Wyślij link do logowania
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
