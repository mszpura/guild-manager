import { redirect } from "next/navigation";
import { getActiveOrg, requireMember } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { MemberProfile, memberProfileSelect } from "@/components/member-profile";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string }>;
}) {
  const data = await getActiveOrg();
  if (!data) redirect("/signin");
  if (!data.active) redirect("/organizations/new");
  const orgId = data.active.organizationId;
  // Każdy członek widzi własny profil — wystarczy przynależność (bez dodatkowych uprawnień).
  const me = await requireMember(orgId);

  // Powrót ze Stripe Checkout — potwierdzamy przyjęcie płatności (właściwy zapis
  // robi webhook, więc status w tabeli może pojawić się z chwilą jego dostarczenia).
  const justPaid = (await searchParams).paid === "1";

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

  // Płatność online dostępna tylko przy skonfigurowanym Stripe — inaczej nie
  // pokazujemy przycisku (pozostaje opłata przelewem odnotowywana przez skarbnika).
  const payable = !!getStripe();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {justPaid ? (
        <div className="rounded-xl border border-[#bfe0cb] bg-[#e7f1ea] px-5 py-4 text-sm text-[#2f7d4f]">
          Dziękujemy! Płatność została przyjęta i jest przetwarzana — status
          składki zaktualizuje się po potwierdzeniu przez operatora płatności.
        </div>
      ) : null}
      <MemberProfile member={member} org={org} payable={payable} />
    </div>
  );
}
