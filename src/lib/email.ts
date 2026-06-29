import "server-only";
import nodemailer from "nodemailer";

// Transport SMTP z EMAIL_SERVER (ten sam, którego używa magic link Auth.js).
// Brak konfiguracji → null (wysyłka jest pomijana, nie wywala aplikacji).
function getTransport() {
  const server = process.env.EMAIL_SERVER;
  if (!server) return null;
  return nodemailer.createTransport(server);
}

const FROM = process.env.EMAIL_FROM ?? "Stowarzyszenie <no-reply@example.com>";

// Wysyła e-mail powitalny do zatwierdzonego członka.
// Zwraca true przy sukcesie, false gdy pominięto/nie udało się — wywołujący
// traktuje to jako miękki błąd (nie przerywa zatwierdzenia zgłoszenia).
export async function sendWelcomeEmail(params: {
  to: string;
  firstName: string;
  organizationName: string;
}): Promise<boolean> {
  const transport = getTransport();
  if (!transport) {
    console.warn(
      "[email] EMAIL_SERVER nie ustawiony — pomijam e-mail powitalny do",
      params.to,
    );
    return false;
  }

  try {
    await transport.sendMail({
      from: FROM,
      to: params.to,
      subject: `Witamy w ${params.organizationName}`,
      text: `Cześć ${params.firstName},\n\nTwoje zgłoszenie do stowarzyszenia „${params.organizationName}" zostało zatwierdzone. Witamy na pokładzie!`,
      html: `<p>Cześć ${params.firstName},</p><p>Twoje zgłoszenie do stowarzyszenia „<strong>${params.organizationName}</strong>" zostało zatwierdzone. Witamy na pokładzie!</p>`,
    });
    return true;
  } catch (error) {
    console.error("[email] Nie udało się wysłać e-maila powitalnego:", error);
    return false;
  }
}

// Wysyła przypomnienie o nieopłaconej składce członkowskiej (wysyłka zbiorowa
// z poziomu rejestru składek). Miękki błąd — wywołujący zlicza sukcesy/porażki.
export async function sendFeeReminderEmail(params: {
  to: string;
  firstName: string;
  organizationName: string;
  year: number;
  amountText: string; // sformatowana kwota, np. "100,00 zł"
  dueText?: string | null; // termin roczny, np. "31 stycznia"
  profileUrl?: string | null; // link do profilu, gdzie można opłacić online
}): Promise<boolean> {
  const transport = getTransport();
  if (!transport) {
    console.warn(
      "[email] EMAIL_SERVER nie ustawiony — pomijam przypomnienie o składce do",
      params.to,
    );
    return false;
  }

  const dueLine = params.dueText
    ? ` Termin opłacenia składki upływa ${params.dueText}.`
    : "";

  try {
    await transport.sendMail({
      from: FROM,
      to: params.to,
      subject: `Przypomnienie o składce za ${params.year} — ${params.organizationName}`,
      text:
        `Cześć ${params.firstName},\n\n` +
        `Przypominamy o nieopłaconej składce członkowskiej w „${params.organizationName}" za rok ${params.year} ` +
        `w wysokości ${params.amountText}.${dueLine}\n` +
        (params.profileUrl
          ? `\nSkładkę możesz opłacić w swoim profilu:\n${params.profileUrl}\n`
          : ""),
      html:
        `<p>Cześć ${params.firstName},</p>` +
        `<p>Przypominamy o nieopłaconej składce członkowskiej w „<strong>${params.organizationName}</strong>" ` +
        `za rok <strong>${params.year}</strong> w wysokości <strong>${params.amountText}</strong>.${dueLine}</p>` +
        (params.profileUrl
          ? `<p>Składkę możesz opłacić w swoim <a href="${params.profileUrl}">profilu</a>.</p>`
          : ""),
    });
    return true;
  } catch (error) {
    console.error("[email] Nie udało się wysłać przypomnienia o składce:", error);
    return false;
  }
}

// Wysyła link do dokończenia płatności składki (na wypadek nieudanej płatności).
export async function sendPaymentLinkEmail(params: {
  to: string;
  firstName: string;
  organizationName: string;
  amountText: string; // sformatowana kwota, np. "100,00 zł"
  paymentUrl: string;
}): Promise<boolean> {
  const transport = getTransport();
  if (!transport) {
    console.warn(
      "[email] EMAIL_SERVER nie ustawiony — pomijam e-mail z linkiem do płatności do",
      params.to,
    );
    return false;
  }

  try {
    await transport.sendMail({
      from: FROM,
      to: params.to,
      subject: `Płatność składki — ${params.organizationName}`,
      text: `Cześć ${params.firstName},\n\nDziękujemy za zgłoszenie do „${params.organizationName}". Składka: ${params.amountText}.\nJeśli płatność nie została dokończona, opłać ją tutaj:\n${params.paymentUrl}`,
      html: `<p>Cześć ${params.firstName},</p><p>Dziękujemy za zgłoszenie do „<strong>${params.organizationName}</strong>". Składka: <strong>${params.amountText}</strong>.</p><p>Jeśli płatność nie została dokończona, opłać ją tutaj:</p><p><a href="${params.paymentUrl}">Dokończ płatność</a></p>`,
    });
    return true;
  } catch (error) {
    console.error("[email] Nie udało się wysłać linku do płatności:", error);
    return false;
  }
}
