"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { setActiveOrganization } from "@/lib/actions/organization";
import type { MemberWithOrg } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function OrgSwitcher({
  members,
  activeId,
  activeLogoUrl,
}: {
  members: MemberWithOrg[];
  activeId: string;
  activeLogoUrl?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = members.find((m) => m.organizationId === activeId);

  function switchTo(organizationId: string) {
    if (organizationId === activeId) return;
    startTransition(async () => {
      await setActiveOrganization(organizationId);
      router.refresh();
    });
  }

  const orgName = active?.organization.name ?? "Wybierz";
  const orgInitial = orgName.trim().charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={pending}
          className="h-auto gap-2.5 rounded-lg bg-muted py-1.5 pr-2.5 pl-2 font-normal"
        >
          {activeLogoUrl ? (
            <img
              src={activeLogoUrl}
              alt=""
              className="size-6 rounded-md border bg-white object-contain"
            />
          ) : (
            <span className="flex size-6 items-center justify-center rounded-md bg-brand text-xs font-bold text-brand-foreground">
              {orgInitial}
            </span>
          )}
          <span className="text-sm font-semibold text-foreground">
            {orgName}
          </span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-60">
        <DropdownMenuLabel>Twoje stowarzyszenia</DropdownMenuLabel>
        {members.map((m) => (
          <DropdownMenuItem
            key={m.organizationId}
            onSelect={() => switchTo(m.organizationId)}
            className="justify-between"
          >
            <span className="truncate">{m.organization.name}</span>
            {m.organizationId === activeId ? (
              <Check className="size-4" />
            ) : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/organizations/new")}>
          <Plus className="size-4" />
          Nowe stowarzyszenie
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
