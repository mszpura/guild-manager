"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, RefreshCw, Power } from "lucide-react";
import {
  regenerateInviteLink,
  setInviteEnabled,
} from "@/lib/actions/organization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function InviteLinkCard({
  organizationId,
  inviteUrl,
  enabled,
}: {
  organizationId: string;
  inviteUrl: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function copy() {
    navigator.clipboard.writeText(inviteUrl).then(
      () => toast.success("Skopiowano link do schowka."),
      () => toast.error("Nie udało się skopiować linku."),
    );
  }

  function regenerate() {
    startTransition(async () => {
      await regenerateInviteLink(organizationId);
      router.refresh();
      toast.success("Wygenerowano nowy link. Poprzedni przestał działać.");
    });
  }

  function toggle() {
    startTransition(async () => {
      await setInviteEnabled(organizationId, !enabled);
      router.refresh();
      toast.success(enabled ? "Link wyłączony." : "Link włączony.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Link zapraszający
          <Badge variant={enabled ? "default" : "secondary"}>
            {enabled ? "aktywny" : "wyłączony"}
          </Badge>
        </CardTitle>
        <CardDescription>
          Wyślij ten link osobom, które chcą dołączyć do stowarzyszenia.
          Wypełnią formularz, a Ty zatwierdzisz lub odrzucisz zgłoszenie.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input readOnly value={inviteUrl} className="font-mono text-xs" />
          <Button
            type="button"
            variant="outline"
            onClick={copy}
            disabled={!enabled}
          >
            <Copy className="size-4" />
            Kopiuj
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={regenerate}
            disabled={pending}
          >
            <RefreshCw className="size-4" />
            Wygeneruj nowy
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={toggle}
            disabled={pending}
          >
            <Power className="size-4" />
            {enabled ? "Wyłącz" : "Włącz"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
