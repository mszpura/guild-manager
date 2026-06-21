import { redirect } from "next/navigation";
import { getSession } from "@/lib/tenant";
import { CreateOrgForm } from "@/components/create-org-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Strona poza grupą (app) — celowo, by uniknąć pętli przekierowań
// (layout (app) odsyła tu użytkownika bez stowarzyszenia).
export default async function NewOrganizationPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Utwórz stowarzyszenie</CardTitle>
          <CardDescription>
            Załóż nowe stowarzyszenie. Zostaniesz jego właścicielem i będziesz
            mógł dodawać członków oraz nadawać im role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrgForm />
        </CardContent>
      </Card>
    </main>
  );
}
