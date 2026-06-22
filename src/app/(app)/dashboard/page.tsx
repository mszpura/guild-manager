import { redirect } from "next/navigation";
import Link from "next/link";
import { getActiveOrg } from "@/lib/tenant";
import { ROLE_LABELS } from "@/lib/roles";
import { Role } from "@/generated/prisma/client";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Inbox, FileText, Gavel, type LucideIcon } from "lucide-react";

type Tile = {
  title: string;
  description: string;
  icon: LucideIcon;
  href?: string; // ustawione → kafelek aktywny (link); brak → „wkrótce"
};

export default async function DashboardPage() {
  // Layout (app) pełni rolę bramki, ale page i layout renderują się
  // niezależnie — dlatego zabezpieczamy się też tutaj.
  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const active = data.active;

  const isAdmin = active.role === Role.OWNER || active.role === Role.BOARD;

  const tiles: Tile[] = [
    {
      title: "Członkowie",
      description: "Lista członków stowarzyszenia.",
      icon: Users,
      href: "/members",
    },
    ...(isAdmin
      ? [
          {
            title: "Zgłoszenia",
            description: "Rozpatruj zgłoszenia nowych członków.",
            icon: Inbox,
            href: "/applications",
          },
        ]
      : []),
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

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{active.organization.name}</h1>
        <p className="text-muted-foreground">
          Twoja rola: {ROLE_LABELS[active.role]}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => {
          const inner = (
            <CardHeader>
              <tile.icon className="size-6 text-muted-foreground" />
              <CardTitle className="mt-2 flex items-center gap-2">
                {tile.title}
                {!tile.href ? (
                  <Badge variant="secondary" className="text-[10px]">
                    wkrótce
                  </Badge>
                ) : null}
              </CardTitle>
              <CardDescription>{tile.description}</CardDescription>
            </CardHeader>
          );

          return tile.href ? (
            <Link key={tile.title} href={tile.href}>
              <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/40">
                {inner}
              </Card>
            </Link>
          ) : (
            <Card key={tile.title} className="h-full opacity-80">
              {inner}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
