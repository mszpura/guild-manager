import { redirect } from "next/navigation";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { MemberProfile, memberProfileSelect } from "@/components/member-profile";

export default async function ProfilePage() {
  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const orgId = data.active.organizationId;
  // Każdy członek widzi własny profil — wystarczy przynależność (bez dodatkowych uprawnień).
  const me = await requireMember(orgId);

  const [org, member] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        membershipPaid: true,
        feeDueMonth: true,
        feeDueDay: true,
        foundedYear: true,
      },
    }),
    prisma.member.findUnique({
      where: { id: me.id },
      select: memberProfileSelect,
    }),
  ]);
  if (!member) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <MemberProfile member={member} org={org} />
    </div>
  );
}
