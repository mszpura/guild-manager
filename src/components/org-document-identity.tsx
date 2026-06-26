// Nagłówek tożsamości stowarzyszenia na dokumentach PDF (protokół, uchwała).
// Pokazuje wyłącznie wypełnione dane — puste pola są pomijane.

export type OrgDocumentInfo = {
  name: string;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  nip?: string | null;
  regon?: string | null;
  krs?: string | null;
  contactEmail?: string | null;
  logoUrl?: string | null;
};

export function OrgDocumentIdentity({ org }: { org: OrgDocumentInfo }) {
  // Adres: „ulica, 00-000 Miasto" — składamy tylko z wypełnionych części.
  const address = [
    org.street,
    [org.postalCode, org.city].filter(Boolean).join(" "),
  ]
    .filter((part) => part && part.trim().length > 0)
    .join(", ");

  // Numery rejestrowe w jednym wierszu (tylko te uzupełnione).
  const identifiers = [
    org.nip ? `NIP: ${org.nip}` : null,
    org.regon ? `REGON: ${org.regon}` : null,
    org.krs ? `KRS: ${org.krs}` : null,
  ].filter(Boolean);

  return (
    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {org.logoUrl ? (
        <img
          src={org.logoUrl}
          alt=""
          className="mx-auto mb-2 h-14 w-auto max-w-[180px] object-contain [-webkit-print-color-adjust:exact] [print-color-adjust:exact]"
        />
      ) : null}
      {org.name}
      {address ? (
        <div className="mt-0.5 font-normal normal-case">{address}</div>
      ) : null}
      {identifiers.length > 0 ? (
        <div className="mt-0.5 font-normal normal-case">
          {identifiers.join(" · ")}
        </div>
      ) : null}
      {org.contactEmail ? (
        <div className="mt-0.5 font-normal normal-case">{org.contactEmail}</div>
      ) : null}
    </div>
  );
}
