"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setMemberRole } from "@/lib/actions/members";

type RoleOption = { id: string; name: string };

export function MemberRoleSelect({
  memberId,
  roleId,
  roles,
}: {
  memberId: string;
  roleId: string;
  roles: RoleOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRoleId = e.target.value;
    if (newRoleId === roleId) return;
    startTransition(async () => {
      try {
        await setMemberRole(memberId, newRoleId);
        router.refresh();
        toast.success("Zmieniono rolę.");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Nie udało się zmienić roli.",
        );
        router.refresh(); // przywróć poprzednią wartość w select
      }
    });
  }

  return (
    <select
      defaultValue={roleId}
      onChange={onChange}
      disabled={pending}
      aria-label="Rola członka"
      className="h-8 rounded-md border bg-transparent px-2 text-sm disabled:opacity-60"
    >
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
}
