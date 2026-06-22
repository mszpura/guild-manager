import { randomBytes } from "crypto";

// Losowy, URL-bezpieczny token linku zapraszającego (~32 znaki base64url).
export function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}
