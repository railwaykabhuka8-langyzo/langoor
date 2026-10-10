import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ComponentType,
  EmbedBuilder,
  type Client,
  type Message,
} from "discord.js";
import { config, panelMessage } from "./config.js";

export const APPLY_BUTTON_ID = "apply-tier-test";
export const CLOSE_BUTTON_ID = "close-tier-ticket";
export const RESULT_BUTTON_ID = "upload-tier-result";

export function buildApplyRow() {
  const button = new ButtonBuilder()
    .setCustomId(APPLY_BUTTON_ID)
    .setLabel("Apply for Tier Test")
    .setStyle(ButtonStyle.Primary);
  if (config.applyEmojiId) button.setEmoji({ id: config.applyEmojiId });

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    button,
  );
}

export function buildTicketRow(disabledClose = false, disabledResult = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CLOSE_BUTTON_ID)
      .setLabel("Close")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabledClose),
    new ButtonBuilder()
      .setCustomId(RESULT_BUTTON_ID)
      .setLabel("Upload Result")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabledResult),
  );
}

function isTextSendable(channel: unknown): channel is {
  type: ChannelType.GuildText;
  messages: { fetch: (options: { limit: number }) => Promise<Map<string, Message>> };
  send: (options: {
    content?: string;
    embeds?: EmbedBuilder[];
    components: ReturnType<typeof buildApplyRow>[];
  }) => Promise<Message>;
} {
  return (
    typeof channel === "object" &&
    channel !== null &&
    "type" in channel &&
    channel.type === ChannelType.GuildText &&
    "messages" in channel &&
    "send" in channel
  );
}

export async function postPanel(client: Client, avoidDuplicate = false) {
  const channel = await client.channels.fetch(config.panelChannelId);
  if (!isTextSendable(channel)) {
    throw new Error(`Panel channel ${config.panelChannelId} is missing or is not a text channel.`);
  }

  if (avoidDuplicate) {
    const recentMessages = await channel.messages.fetch({ limit: 50 });
    const alreadyPosted = [...recentMessages.values()].find(
      (message) =>
        message.author.id === client.user?.id &&
        message.components.some((row) =>
          row.type === ComponentType.ActionRow &&
          row.components.some(
            (component) =>
              component.type === ComponentType.Button && component.customId === APPLY_BUTTON_ID,
          ),
        ),
    );
    if (alreadyPosted) {
      const currentEmbed = alreadyPosted.embeds[0];
      const isCurrentEmbed =
        alreadyPosted.content.length === 0 &&
        currentEmbed?.title === "Bedfight Tier Testing" &&
        currentEmbed.description === panelMessage;
      if (!isCurrentEmbed) {
        await alreadyPosted.edit({
          content: "",
          embeds: [
            new EmbedBuilder()
              .setColor(0x48c879)
              .setTitle("Bedfight Tier Testing")
              .setDescription(panelMessage),
          ],
          components: [buildApplyRow()],
        });
        console.info("Updated the existing tier testing panel to an embed.");
        return;
      }
      console.info("Tier testing panel embed is already present.");
      return;
    }
  }

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x48c879)
        .setTitle("Bedfight Tier Testing")
        .setDescription(panelMessage),
    ],
    components: [buildApplyRow()],
  });
  console.info(`Tier testing panel posted in #${config.panelChannelId}.`);
}
