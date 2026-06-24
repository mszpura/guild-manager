"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";

export function NavLink({
  href,
  label,
  icon,
  ready,
  count,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  ready: boolean;
  count?: number;
}) {
  const pathname = usePathname();
  const active =
    ready && (pathname === href || pathname.startsWith(`${href}/`));

  return (
    <Link
      href={ready ? href : "#"}
      aria-disabled={!ready}
      aria-current={active ? "page" : undefined}
      className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${
        !ready
          ? "pointer-events-none text-sidebar-foreground opacity-50"
          : active
            ? "bg-accent font-semibold text-accent-foreground"
            : "font-medium text-sidebar-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <span className="flex items-center gap-3">
        {icon}
        {label}
      </span>
      {!ready ? (
        <Badge variant="secondary" className="text-[10px]">
          wkrótce
        </Badge>
      ) : count ? (
        <Badge className="text-[10px]">{count}</Badge>
      ) : null}
    </Link>
  );
}
