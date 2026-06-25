import { redirect } from "next/navigation";
import { getActiveOrg, getSession } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ApplicationStatus } from "@/generated/prisma/client";
import { can } from "@/lib/permissions";
import { OrgSwitcher } from "@/components/org-switcher";
import { UserMenu } from "@/components/user-menu";
import { NavLink } from "@/components/nav-link";
import {
  Users,
  CalendarClock,
  Gavel,
  LayoutDashboard,
  Inbox,
  Settings,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await getActiveOrg();
  if (!data) redirect("/signin"); // niezalogowany
  if (!data.active) redirect("/organizations/new"); // brak stowarzyszenia

  const session = await getSession();
  const { members, active } = data;
  const role = active.role;

  // Widoczność sekcji wg uprawnień roli (jak menu boczne).
  const canApplications = can(role, "APPLICATIONS", "READ");
  const pendingCount = canApplications
    ? await prisma.membershipApplication.count({
        where: {
          organizationId: active.organizationId,
          status: ApplicationStatus.PENDING,
        },
      })
    : 0;

  const nav: {
    href: string;
    label: string;
    icon: LucideIcon;
    ready: boolean;
    count?: number;
  }[] = [
    { href: "/dashboard", label: "Pulpit", icon: LayoutDashboard, ready: true },
    ...(can(role, "MEMBERS", "READ")
      ? [{ href: "/members", label: "Członkowie", icon: Users, ready: true }]
      : []),
    ...(canApplications
      ? [
          {
            href: "/applications",
            label: "Zgłoszenia",
            icon: Inbox,
            ready: true,
            count: pendingCount,
          },
        ]
      : []),
    ...(can(role, "MEETINGS", "READ")
      ? [{ href: "/meetings", label: "Spotkania", icon: CalendarClock, ready: true }]
      : []),
    ...(can(role, "RESOLUTIONS", "READ")
      ? [{ href: "/resolutions", label: "Uchwały", icon: Gavel, ready: true }]
      : []),
    ...(can(role, "SETTINGS", "WRITE")
      ? [{ href: "/settings", label: "Ustawienia", icon: Settings, ready: true }]
      : []),
  ];

  return (
    <div className="flex min-h-svh flex-col">
      {/* górny app bar */}
      <header className="sticky top-0 z-30 flex h-[62px] items-center justify-between border-b bg-card px-6 print:hidden">
        <div className="flex items-center gap-5">
          <Brand />
          <span className="h-6 w-px bg-border" />
          <OrgSwitcher members={members} activeId={active.organizationId} />
        </div>
        <UserMenu
          name={session?.user?.name}
          email={session?.user?.email}
          image={session?.user?.image}
        />
      </header>

      <div className="flex flex-1">
        {/* sidebar */}
        <aside className="sticky top-[62px] hidden h-[calc(100svh-62px)] w-[236px] shrink-0 overflow-y-auto border-r bg-sidebar p-4 md:block print:hidden">
          <p className="mb-3 px-3 text-[11px] font-bold tracking-[0.1em] text-muted-foreground">
            ZARZĄDZANIE
          </p>
          <nav className="space-y-1">
            {nav.map((item) => (
              <NavLink
                key={item.label}
                href={item.href}
                label={item.label}
                ready={item.ready}
                count={item.count}
                icon={<item.icon className="size-[18px]" />}
              />
            ))}
          </nav>
        </aside>

        {/* treść */}
        <main className="min-w-0 flex-1 p-6 sm:p-8">{children}</main>
      </div>
    </div>
  );
}

// Znak marki — dwa nachodzące kółka + wordmark (Libre Franklin).
function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <span className="flex items-center">
        <span className="size-3.5 rounded-full border-2 border-brand" />
        <span className="-ml-1.5 size-3.5 rounded-full border-2 border-primary" />
      </span>
      <span className="font-heading text-lg font-extrabold tracking-tight text-foreground">
        associacion
      </span>
    </Link>
  );
}
