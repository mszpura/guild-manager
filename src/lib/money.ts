// Kwoty trzymamy w groszach (Int), formatujemy/parsujemy do/z złotówek.

const plnFormatter = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
});

// 10000 (grosze) → "100,00 zł"
export function formatPLN(grosze: number): string {
  return plnFormatter.format(grosze / 100);
}

// "100" / "100,50" / "100.50" → grosze (Int). Niepoprawne → null.
export function parsePLN(text: string): number | null {
  const normalized = text.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const grosze = Math.round(parseFloat(normalized) * 100);
  if (grosze <= 0 || grosze > 100_000_00) return null; // sanity: 1 gr – 100 000 zł
  return grosze;
}
