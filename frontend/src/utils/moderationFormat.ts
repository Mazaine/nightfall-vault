import type { ModerationActionType } from "../api/moderation";

export const moderationActionLabels: Record<ModerationActionType, string> = {
  warning: "Figyelmeztetés",
  auction_creation_ban: "Aukció-létrehozási tiltás",
  bidding_ban: "Licitálási tiltás",
  chat_ban: "Chatküldési tiltás",
  temporary_ban: "Ideiglenes teljes tiltás",
  permanent_ban: "Végleges tiltás",
};

export const strikeSeverityLabels: Record<string, string> = {
  low: "Alacsony",
  medium: "Közepes",
  high: "Magas",
  critical: "Kritikus",
};

const moderationCodePattern = new RegExp(`\\b(${Object.keys(moderationActionLabels).join("|")})\\b`, "g");
const severityPrefixPattern = /^(low|medium|high|critical):\s*/;

export function localizeModerationMessage(message: string) {
  return message
    .replace(moderationCodePattern, (code) => moderationActionLabels[code as ModerationActionType])
    .replace(severityPrefixPattern, (_, severity: string) => `Súlyosság: ${strikeSeverityLabels[severity] ?? severity}. Indok: `);
}
