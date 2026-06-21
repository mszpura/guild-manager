"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { setActiveOrganization } from "@/lib/actions/organization";
import { ROLE_LABELS } from "@/lib/roles";
import type { MembershipWithOrg } from "@/lib/tenant";
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
  memberships,
  activeId,
}: {
  memberships: MembershipWithOrg[];
  activeId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = memberships.find((m) => m.organizationId === activeId);

  function switchTo(organizationId: string) {
    if (organizationId === activeId) return;
    startTransition(async () => {
      await setActiveOrganization(organizationId);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between"
          disabled={pending}
        >
          <span className="flex flex-col items-start truncate">
            <span className="truncate font-medium">
              {active?.organization.name ?? "Wybierz"}
            </span>
            {active ? (
              <span className="text-xs text-muted-foreground">
                {ROLE_LABELS[active.role]}
              </span>
            ) : null}
          </span>
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width)">
        <DropdownMenuLabel>Twoje stowarzyszenia</DropdownMenuLabel>
        {memberships.map((m) => (
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
