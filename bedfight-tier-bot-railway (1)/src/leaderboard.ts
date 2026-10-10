import { resolve } from "node:path";
import {
  AttachmentBuilder,
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Guild,
} from "discord.js";
import sharp from "sharp";
import { config, parseTicketTopic, tiers } from "./config.js";

const IMAGE_WIDTH = 1200;
const BACKGROUND_PATH = resolve(process.cwd(), "assets/minecraft-background.jpg");

type LeaderboardEntry = {
  applicantId: string;
  ign: string;
  tier: string;
  completedAt: number;
};

const TOP_PLAYER_LIMIT = 10;
const ROW_START_Y = 168;
const ROW_HEIGHT = 44;
const ROW_STEP = 51;

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function sortLeaderboardEntries(entries: LeaderboardEntry[]) {
  return [...entries].sort((left, right) => {
    const rankDifference =
      tiers.indexOf(left.tier as (typeof tiers)[number]) -
      tiers.indexOf(right.tier as (typeof tiers)[number]);
    return rankDifference || right.completedAt - left.completedAt || left.ign.localeCompare(right.ign);
  });
}

async function getLeaderboardEntries(guild: Guild): Promise<LeaderboardEntry[]> {
  const category = await guild.channels.fetch(config.ticketCategoryId);
  if (!category || category.type !== ChannelType.GuildCategory) {
    throw new Error("The configured ticket category is missing from this server.");
  }

  await guild.channels.fetch();
  const latestByIgn = new Map<string, LeaderboardEntry>();

  for (const channel of guild.channels.cache.values()) {
    if (channel.type !== ChannelType.GuildText || channel.parentId !== category.id) continue;

    const ticket = parseTicketTopic(channel.topic);
    if (ticket?.status !== "completed" || !ticket.tier) continue;
    if (!(tiers as readonly string[]).includes(ticket.tier)) continue;

    const entry: LeaderboardEntry = {
      applicantId: ticket.applicantId,
      ign: ticket.ign,
      tier: ticket.tier,
      completedAt: ticket.completedAt ?? channel.createdTimestamp,
    };
    const key = ticket.ign.toLowerCase();
    const previous = latestByIgn.get(key);
    if (!previous || entry.completedAt > previous.completedAt) {
      latestByIgn.set(key, entry);
    }
  }

  return sortLeaderboardEntries([...latestByIgn.values()]);
}

export async function renderLeaderboard(entries: LeaderboardEntry[]) {
  const topPlayers = sortLeaderboardEntries(entries).slice(0, TOP_PLAYER_LIMIT);
  const imageHeight = Math.max(
    490,
    ROW_START_Y + Math.max(topPlayers.length, 1) * ROW_STEP + 44,
  );
  const rowsSvg =
    topPlayers.length === 0
      ? `<rect x="48" y="${ROW_START_Y}" width="1104" height="54" rx="14" fill="#071421" fill-opacity="0.8" />
         <text x="600" y="${ROW_START_Y + 34}" class="empty" text-anchor="middle">No completed tier tests yet</text>`
      : topPlayers
          .map((player, index) => {
            const y = ROW_START_Y + index * ROW_STEP;
            const rank = String(index + 1).padStart(2, "0");
            return `
              <g>
                <rect x="48" y="${y}" width="1104" height="${ROW_HEIGHT}" rx="14"
                  fill="#071421" fill-opacity="0.82" stroke="#b7d4cc" stroke-opacity="0.22" />
                <rect x="64" y="${y + 7}" width="58" height="30" rx="9"
                  fill="#60c88f" fill-opacity="0.95" />
                <text x="93" y="${y + 27}" class="rank" text-anchor="middle">#${rank}</text>
                <text x="145" y="${y + 29}" class="ign">${escapeXml(player.ign)}</text>
                <rect x="1048" y="${y + 7}" width="100" height="30" rx="9"
                  fill="#173d32" stroke="#60c88f" stroke-opacity="0.65" />
                <text x="1098" y="${y + 28}" class="tier" text-anchor="middle">${escapeXml(player.tier)}</text>
              </g>`;
          })
          .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${imageHeight}" viewBox="0 0 ${IMAGE_WIDTH} ${imageHeight}">
      <defs>
        <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#07131f" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#102a2b" stop-opacity="0.82"/>
        </linearGradient>
      </defs>
      <rect x="18" y="18" width="${IMAGE_WIDTH - 36}" height="${imageHeight - 36}" rx="26"
        fill="url(#panel)" stroke="#d9f0de" stroke-opacity="0.35" stroke-width="2"/>
      <text x="48" y="71" class="title">BEDFIGHT TOP 10</text>
      <text x="50" y="108" class="subtitle">RANKED BY TIER · HT1 TO LT5 · LATEST TEST BREAKS TIES</text>
      <line x1="48" y1="132" x2="${IMAGE_WIDTH - 48}" y2="132" stroke="#d9f0de" stroke-opacity="0.34"/>
      <text x="64" y="157" class="column">RANK</text>
      <text x="145" y="157" class="column">PLAYER IGN</text>
      <text x="1098" y="157" class="column" text-anchor="middle">TIER</text>
      ${rowsSvg}
      <text x="48" y="${imageHeight - 27}" class="footer">Latest completed tier per IGN · Up to 10 players shown</text>
      <style>
        .title { font-family: Arial, sans-serif; font-size: 38px; font-weight: 800; letter-spacing: 1.5px; fill: #f5fff7; }
        .subtitle { font-family: Arial, sans-serif; font-size: 15px; font-weight: 600; letter-spacing: 1.5px; fill: #b7d4cc; }
        .column { font-family: Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 1.5px; fill: #b7d4cc; }
        .rank { font-family: Arial, sans-serif; font-size: 15px; font-weight: 800; fill: #062315; }
        .ign { font-family: Arial, sans-serif; font-size: 20px; font-weight: 700; fill: #f1f5f2; }
        .tier { font-family: Arial, sans-serif; font-size: 17px; font-weight: 800; fill: #e9fff0; }
        .empty { font-family: Arial, sans-serif; font-size: 18px; font-weight: 700; fill: #f1f5f2; }
        .footer { font-family: Arial, sans-serif; font-size: 13px; font-weight: 500; fill: #b7d4cc; }
      </style>
    </svg>`;

  const background = await sharp(BACKGROUND_PATH)
    .resize({ width: IMAGE_WIDTH, height: imageHeight, fit: "cover", position: "attention" })
    .jpeg({ quality: 86 })
    .toBuffer();

  return sharp(background)
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer();
}

export async function handleLeaderboardCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: "Use this command inside the Bedfight server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();
  try {
    const entries = await getLeaderboardEntries(interaction.guild);
    const image = await renderLeaderboard(entries);
    const attachmentName = "bedfight-leaderboard.png";
    await interaction.editReply({
      files: [new AttachmentBuilder(image, { name: attachmentName })],
    });
  } catch (error) {
    console.error("Could not create the Bedfight leaderboard.", error);
    await interaction.editReply({
      content:
        "The leaderboard could not be generated. Check that the bot can view the tier testing category.",
    });
  }
}
