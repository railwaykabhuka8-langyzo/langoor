function envValue(name: string, fallback: string) {
  return process.env[name]?.trim() ?? fallback;
}

const cooldownDaysValue = process.env.COOLDOWN_DAYS?.trim();
export const cooldownDays = cooldownDaysValue ? Number(cooldownDaysValue) : 7;
if (!Number.isInteger(cooldownDays) || cooldownDays < 1) {
  throw new Error("COOLDOWN_DAYS must be a positive whole number.");
}

const applyEmojiValue = process.env.APPLY_EMOJI_ID?.trim();

export const config = {
  panelChannelId: envValue("PANEL_CHANNEL_ID", "1485604042829856878"),
  ticketCategoryId: envValue("TICKET_CATEGORY_ID", "1497455686689230951"),
  staffRoleId: envValue("TESTER_ROLE_ID", "1457637235875905708"),
  resultsChannelId: envValue("RESULTS_CHANNEL_ID", "1506995570068291804"),
  applyEmojiId:
    applyEmojiValue === undefined
      ? "1507499523122139176"
      : applyEmojiValue.toLowerCase() === "none"
        ? ""
        : applyEmojiValue,
} as const;

export const regions = ["AS", "NA", "SA", "EU"] as const;
export const devices = ["Mobile", "Controller", "PC"] as const;

export const tiers = [
  "HT1",
  "LT1",
  "HT2",
  "LT2",
  "HT3",
  "LT3",
  "HT4",
  "LT4",
  "HT5",
  "LT5",
] as const;

export const previousTiers = ["Unranked", ...tiers] as const;
export const TIER_COOLDOWN_MS = cooldownDays * 24 * 60 * 60 * 1000;

export const panelMessage = [
  "Want to know your current skill level? Apply for a tier test and prove your abilities.",
  "",
  "**How It Works**",
  "1. Select **Apply for Tier Test** below.",
  "2. Submit your Minecraft IGN and region.",
  "3. Wait for a tester to review your application.",
  "4. Join the test when a tester is available.",
  "5. Your tier will be assigned based on your performance.",
  "",
  "**Testing Information**",
  "- Gamemode: Bedfight",
  "- Testing Method: Live gameplay",
  "- Tier Range: LT5 – HT1",
  "- Fair testing and honest results are required.",
  "- Follow all tester instructions during your test.",
  "- Abusing the system or disrespecting staff may result in restrictions.",
  "",
  "**Ready to get tested?**",
  "",
  "Select the button below to begin your tier-testing application.",
].join("\n");

export function normalizeRegion(value: string): string | undefined {
  const normalized = value.trim().toUpperCase();
  return (regions as readonly string[]).includes(normalized) ? normalized : undefined;
}

export function normalizeDevice(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  return devices.find((device) => device.toLowerCase() === normalized);
}

export function normalizeTier(value: string, allowUnranked: boolean): string | undefined {
  const normalized = value.replace(/\s+/g, "").toUpperCase();
  const allowed = allowUnranked ? previousTiers : tiers;
  return allowed.find((tier) => tier.toUpperCase() === normalized);
}

export function parseTicketTopic(topic: string | null | undefined) {
  if (!topic?.startsWith("tier-test|")) return undefined;

  const [, applicantId, ign, region, device, statusToken, tier] = topic.split("|");
  if (!applicantId || !ign || !region || !device || !statusToken) return undefined;

  const [status, timestampValue] = statusToken.split("@");
  const completedAt =
    timestampValue && /^\d+$/.test(timestampValue) ? Number(timestampValue) : undefined;

  return { applicantId, ign, region, device, status, completedAt, tier };
}

export function ticketTopic(
  ticket: { applicantId: string; ign: string; region: string; device: string },
  status: string,
  tier?: string,
) {
  const tierPart = tier ? `|${tier}` : "";
  return `tier-test|${ticket.applicantId}|${ticket.ign}|${ticket.region}|${ticket.device}|${status}${tierPart}`;
}
