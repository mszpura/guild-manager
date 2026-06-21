import { redirect } from "next/navigation";
import { getActiveOrg } from "@/lib/tenant";
import { ROLE_LABELS } from "@/lib/roles";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, FileText, Gavel } from "lucide-react";

const TILES = [
  {
    title: "Członkowie",
    description: "Lista członków, dane, składki, statusy.",
    icon: Users,
  },
  {
    title: "Spotkania",
    description: "Terminy spotkań i protokoły (eksport PDF).",
    icon: FileText,
  },
  {
    title: "Uchwały",
    description: "Numerowane uchwały z eksportem do PDF.",
    icon: Gavel,
  },
];

export default async function DashboardPage() {
  // Layout (app) pełni rolę bramki, ale page i layout renderują się
  // niezależnie — dlatego zabezpieczamy się też tutaj.
  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const active = data.active;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{active.organization.name}</h1>
        <p className="text-muted-foreground">
          Twoja rola: {ROLE_LABELS[active.role]}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((tile) => (
          <Card key={tile.title} className="relative opacity-80">
            <CardHeader>
              <tile.icon className="size-6 text-muted-foreground" />
              <CardTitle className="mt-2 flex items-center gap-2">
                {tile.title}
                <Badge variant="secondary" className="text-[10px]">
                  wkrótce
                </Badge>
              </CardTitle>
              <CardDescription>{tile.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
