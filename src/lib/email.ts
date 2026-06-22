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
