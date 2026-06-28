// Klient darmowego, oficjalnego API KRS Ministerstwa Sprawiedliwości
// (https://api-krs.ms.gov.pl). Pobiera aktualny odpis po numerze KRS i wyciąga
// dane rejestrowe potrzebne przy zakładaniu stowarzyszenia.

const API_BASE = "https://api-krs.ms.gov.pl/api/krs/OdpisAktualny";

// Rejestry KRS: S — stowarzyszenia/fundacje/organizacje społeczne; P — przedsiębiorcy.
// Numer KRS jest unikalny w skali kraju, ale podmiot figuruje w jednym z rejestrów,
// więc próbujemy obu (najpierw S — typowy dla stowarzyszeń).
const REGISTERS = ["S", "P"] as const;

// Dane rejestrowe wyciągnięte z odpisu. NIP/REGON bywają puste — KRS nie zawsze je
// podaje (np. stowarzyszenia/fundacje nieprowadzące działalności gospodarczej).
export type KrsData = {
  name: string;
  nip: string | null;
  regon: string | null;
  foundedYear: number | null; // rok rejestracji w KRS (najlepsze dostępne przybliżenie)
  street: string | null; // ulica + nr domu (+ nr lokalu)
  postalCode: string | null;
  city: string | null;
};

export type KrsLookupResult =
  | { ok: true; krs: string; data: KrsData } // krs = numer znormalizowany do 10 cyfr
  | { ok: false; error: string };

// Normalizuje numer KRS do 10 cyfr (dokładając wiodące zera). null = format zły.
export function normalizeKrs(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 0 || digits.length > 10) return null;
  return digits.padStart(10, "0");
}

// Składa wiersz adresu „ULICA nrDomu/nrLokalu" z części odpisu (puste → null).
function buildStreet(adres: {
  ulica?: string;
  nrDomu?: string;
  nrLokalu?: string;
} | null | undefined): string | null {
  if (!adres) return null;
  const ulica = (adres.ulica ?? "").trim();
  const nrDomu = (adres.nrDomu ?? "").trim();
  const nrLokalu = (adres.nrLokalu ?? "").trim();
  let line = ulica;
  if (nrDomu) line = line ? `${line} ${nrDomu}` : nrDomu;
  if (nrLokalu) line = line ? `${line}/${nrLokalu}` : line;
  return line.trim() === "" ? null : line.trim();
}

// Wyciąga rok z daty rejestracji KRS w formacie „DD.MM.RRRR".
function yearFromKrsDate(date: unknown): number | null {
  if (typeof date !== "string") return null;
  const m = date.match(/(\d{4})\s*$/);
  return m ? Number(m[1]) : null;
}

// Pobiera dane podmiotu z API KRS po numerze. Próbuje rejestru S, potem P.
export async function fetchKrsData(krs: string): Promise<KrsLookupResult> {
  const normalized = normalizeKrs(krs);
  if (!normalized) {
    return { ok: false, error: "Podaj poprawny numer KRS (do 10 cyfr)." };
  }

  for (const rejestr of REGISTERS) {
    let res: Response;
    try {
      res = await fetch(
        `${API_BASE}/${normalized}?rejestr=${rejestr}&format=json`,
        { cache: "no-store" },
      );
    } catch {
      return {
        ok: false,
        error: "Nie udało się połączyć z API KRS. Spróbuj ponownie.",
      };
    }

    if (res.status === 404) continue; // brak w tym rejestrze — spróbuj kolejnego
    if (!res.ok) {
      return { ok: false, error: `API KRS zwróciło błąd (HTTP ${res.status}).` };
    }

    const json = await res.json().catch(() => null);
    const dzial1 = json?.odpis?.dane?.dzial1;
    const podmiot = dzial1?.danePodmiotu;
    const nazwa = podmiot?.nazwa;
    if (!nazwa) continue; // odpowiedź bez nazwy — traktuj jak brak danych

    const adres = dzial1?.siedzibaIAdres?.adres;
    const ident = podmiot?.identyfikatory ?? {};

    return {
      ok: true,
      krs: normalized,
      data: {
        name: String(nazwa),
        nip: ident.nip ?? null,
        regon: ident.regon ?? null,
        foundedYear: yearFromKrsDate(
          json?.odpis?.naglowekA?.dataRejestracjiWKRS,
        ),
        street: buildStreet(adres),
        postalCode: adres?.kodPocztowy ?? null,
        city: adres?.miejscowosc ?? null,
      },
    };
  }

  return { ok: false, error: "Nie znaleziono podmiotu o tym numerze KRS." };
}
