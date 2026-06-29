// Pola-linki formularza zgłoszeniowego. Użytkownik podaje wyłącznie identyfikator
// (np. nazwę profilu albo numer EGD); pełny adres budujemy z szablonu danego typu.
// Brak zależności serwerowych — plik używany i na kliencie (formularz), i na serwerze.

export type LinkType = "FACEBOOK" | "LINKEDIN" | "EGD";

type LinkConfig = {
  label: string; // etykieta pola (wynika z typu)
  // Szablon adresu z miejscem na identyfikator ({id}).
  urlTemplate: string;
  // Podpowiedź dla pola identyfikatora na formularzu.
  placeholder: string;
};

export const LINK_CONFIG: Record<LinkType, LinkConfig> = {
  FACEBOOK: {
    label: "Facebook",
    urlTemplate: "https://www.facebook.com/{id}",
    placeholder: "np. jan.kowalski lub link do profilu",
  },
  LINKEDIN: {
    label: "LinkedIn",
    urlTemplate: "https://www.linkedin.com/in/{id}",
    placeholder: "np. jan-kowalski lub link do profilu",
  },
  EGD: {
    label: "EGD",
    urlTemplate: "https://europeangodatabase.eu/EGD/Player_Card.php?&key={id}",
    placeholder: "np. 15732286 lub link do karty gracza",
  },
};

// Kolejność typów na liście wyboru w ustawieniach.
export const LINK_TYPES: LinkType[] = ["FACEBOOK", "LINKEDIN", "EGD"];

export function isLinkType(value: unknown): value is LinkType {
  return value === "FACEBOOK" || value === "LINKEDIN" || value === "EGD";
}

// Buduje pełny adres z identyfikatora wg szablonu typu.
export function buildLinkUrl(type: LinkType, id: string): string {
  return LINK_CONFIG[type].urlTemplate.replace("{id}", encodeURIComponent(id));
}

// Adres-podgląd z szablonu (z miejscem na identyfikator) — do podpowiedzi w UI.
export function linkUrlPreview(type: LinkType): string {
  return LINK_CONFIG[type].urlTemplate.replace("{id}", "…");
}

// Ostatni niepusty segment ścieżki (gdy ktoś wklei adres bez znanego hosta).
function lastSegment(raw: string): string {
  const v = raw
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[?#]/)[0];
  const parts = v.split("/").filter(Boolean);
  return (parts[parts.length - 1] ?? v).trim();
}

// Wyłuskuje sam identyfikator z tego, co podał użytkownik. Przyjmuje zarówno goły
// identyfikator, jak i wklejony pełny/częściowy adres — nadmiarowy tekst odcinamy.
export function extractLinkId(type: LinkType, raw: string): string {
  const input = raw.trim();
  if (!input) return "";

  switch (type) {
    case "EGD": {
      // ...Player_Card.php?&key=15732286 → 15732286; goły numer zostaje numerem.
      const m = input.match(/key=([A-Za-z0-9]+)/i);
      if (m) return m[1];
      return input.replace(/[^A-Za-z0-9]/g, "");
    }
    case "FACEBOOK": {
      // facebook.com/zuck, facebook.com/profile.php?id=4 → zuck / 4
      const m = input.match(
        /facebook\.com\/(?:profile\.php\?id=)?([^/?#\s]+)/i,
      );
      if (m) return decodeURIComponent(m[1]);
      return lastSegment(input);
    }
    case "LINKEDIN": {
      // linkedin.com/in/jan-kowalski → jan-kowalski
      const m = input.match(/linkedin\.com\/(?:in\/)?([^/?#\s]+)/i);
      if (m) return decodeURIComponent(m[1]);
      return lastSegment(input);
    }
  }
}

// ─── Migawka pól własnych zgłoszenia (customData) ───────────────────────────
// Pole własne to wpis { label, value }. Pola-linki dokładają linkType + gotowy url.

export type CustomDatum = {
  label: string;
  value: string;
  linkType?: LinkType;
  url?: string;
};

// Parsuje migawkę customData (Json) do listy wpisów. Odporny na nieznany kształt.
export function parseCustomData(data: unknown): CustomDatum[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      !("label" in item) ||
      !("value" in item)
    ) {
      return [];
    }
    const o = item as Record<string, unknown>;
    const datum: CustomDatum = { label: String(o.label), value: String(o.value) };
    if (isLinkType(o.linkType)) {
      datum.linkType = o.linkType;
      datum.url =
        typeof o.url === "string" && o.url
          ? o.url
          : buildLinkUrl(o.linkType, datum.value);
    }
    return [datum];
  });
}
