import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { MemberProfile, memberProfileSelect } from "@/components/member-profile";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const orgId = data.active.organizationId;
  // Podgląd cudzego profilu (dane osobowe, składki) — tylko zarządzający członkami.
  await requireMember(orgId, "MEMBERS", "WRITE");

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
    // Tenant-scope: członek musi należeć do aktywnego stowarzyszenia.
    prisma.member.findFirst({
      where: { id, organizationId: orgId },
      select: memberProfileSelect,
    }),
  ]);
  if (!member) redirect("/members");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link
        href="/members"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Wróć do listy członków
      </Link>
      <MemberProfile member={member} org={org} />
    </div>
  );
}
