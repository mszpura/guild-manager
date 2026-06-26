"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// Pasek narzędzi protokołu — niewidoczny w wydruku (print:hidden).
// Po wejściu na stronę otwiera okno wydruku (Zapisz jako PDF).
export function ProtocolPrintBar({
  backHref,
  backLabel = "Wróć do spotkania",
}: {
  backHref: string;
  backLabel?: string;
}) {
  const printed = useRef(false);

  useEffect(() => {
    if (printed.current) return; // ochrona przed podwójnym wywołaniem (StrictMode)
    printed.current = true;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mx-auto mb-6 flex max-w-3xl items-center justify-between print:hidden">
      <Button asChild variant="ghost" size="sm">
        <Link href={backHref}>
          <ArrowLeft className="size-4" />
          {backLabel}
        </Link>
      </Button>
      <Button type="button" size="sm" onClick={() => window.print()}>
        <Printer className="size-4" />
        Pobierz PDF
      </Button>
    </div>
  );
}
