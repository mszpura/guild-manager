import Link from "next/link";
import { MailCheck } from "lucide-react";
import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";

const FEATURES = [
  "Uchwały i głosowania online",
  "Rejestr członków i składek",
  "Protokoły i sprawozdania ze spotkań",
];

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

  return (
    <main className="grid min-h-svh md:grid-cols-[1.05fr_1fr]">
      {/* lewy panel brandowy */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand p-14 text-brand-foreground md:flex">
        <div className="pointer-events-none absolute -top-28 -right-28 size-80 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -top-14 -right-14 size-52 rounded-full border border-primary/30" />

        <div className="relative flex items-center gap-2.5">
          <span className="flex items-center">
            <span className="size-3.5 rounded-full border-2 border-white" />
            <span className="-ml-1.5 size-3.5 rounded-full border-2 border-primary" />
          </span>
          <span className="font-heading text-xl font-extrabold tracking-tight">
            associacion
          </span>
        </div>

        <div className="relative max-w-md">
          <h1 className="mb-7 font-heading text-4xl font-extrabold leading-tight tracking-tight">
            Zaloguj się do swojego stowarzyszenia.
          </h1>
          <ul className="space-y-4">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/20 text-sm text-primary-foreground">
                  ✓
                </span>
                <span className="text-[15px] text-white/80">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative font-mono text-xs tracking-wide text-white/45">
          Dane szyfrowane i przechowywane w Polsce
        </p>
      </div>

      {/* prawy formularz */}
      <div className="flex items-center justify-center bg-card p-8 sm:p-12">
        <div className="w-full max-w-sm">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-accent">
                <MailCheck className="size-6 text-primary" />
              </div>
              <h2 className="mb-2.5 font-heading text-2xl font-extrabold tracking-tight">
                Sprawdź skrzynkę
              </h2>
              <p className="mb-7 text-[15px] leading-relaxed text-muted-foreground">
                Wysłaliśmy link do logowania na Twój adres e-mail. Kliknij go,
                aby przejść do panelu — link jest ważny przez 15 minut.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/signin">Użyj innego adresu</Link>
              </Button>
            </div>
          ) : (
            <>
              <h2 className="mb-2 font-heading text-[27px] font-extrabold tracking-tight">
                Witaj ponownie
              </h2>
              <p className="mb-7 text-[15px] text-muted-foreground">
                Zaloguj się, aby zarządzać swoim stowarzyszeniem.
              </p>

              {/* Logowanie przez Google */}
              <form
                action={async () => {
                  "use server";
                  await signIn("google", { redirectTo: "/dashboard" });
                }}
              >
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full gap-2.5"
                >
                  <span className="flex size-5 items-center justify-center rounded-full border-2 border-primary font-heading text-[11px] font-extrabold text-primary">
                    G
                  </span>
                  Kontynuuj z Google
                </Button>
              </form>

              <div className="my-6 flex items-center gap-3.5">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground">
                  lub przez e-mail
                </span>
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
                className="space-y-4"
              >
                <Field>
                  <FieldLabel htmlFor="email">Adres e-mail</FieldLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="imie@stowarzyszenie.pl"
                    required
                  />
                </Field>
                <Button
                  type="submit"
                  className="w-full bg-brand text-brand-foreground hover:bg-brand/90"
                >
                  Wyślij link logowania
                </Button>
              </form>

              <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
                Wyślemy bezpieczny link do logowania — bez hasła.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
