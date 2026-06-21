import { redirect } from "next/navigation";
import { getActiveOrg, getSession } from "@/lib/tenant";
import { OrgSwitcher } from "@/components/org-switcher";
import { UserMenu } from "@/components/user-menu";
import { Users, FileText, Gavel, LayoutDashboard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

// Pozycje nawigacji. Aktywne dziś tylko "Pulpit"; reszta dochodzi w kolejnych krokach.
const NAV = [
  { href: "/dashboard", label: "Pulpit", icon: LayoutDashboard, ready: true },
  { href: "#", label: "Członkowie", icon: Users, ready: false },
  { href: "#", label: "Spotkania", icon: FileText, ready: false },
  { href: "#", label: "Uchwały", icon: Gavel, ready: false },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await getActiveOrg();
  if (!data) redirect("/signin"); // niezalogowany
  if (!data.active) redirect("/organizations/new"); // brak stowarzyszenia

  const session = await getSession();
  const { memberships, active } = data;

  return (
    <div className="flex min-h-svh">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-muted/20">
        <div className="border-b p-3">
          <OrgSwitcher
            memberships={memberships}
            activeId={active.organizationId}
          />
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.ready ? item.href : "#"}
              aria-disabled={!item.ready}
              className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                item.ready
                  ? "hover:bg-accent hover:text-accent-foreground"
                  : "pointer-events-none opacity-50"
              }`}
            >
              <span className="flex items-center gap-2">
                <item.icon className="size-4" />
                {item.label}
              </span>
              {!item.ready ? (
                <Badge variant="secondary" className="text-[10px]">
                  wkrótce
                </Badge>
              ) : null}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <span className="font-semibold">{active.organization.name}</span>
          <UserMenu
            name={session?.user?.name}
            email={session?.user?.email}
            image={session?.user?.image}
          />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
