import { resolve } from "node:path";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ChannelType,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Client,
  type Guild,
  type GuildTextBasedChannel,
  type ModalSubmitInteraction,
  type TextChannel,
} from "discord.js";
import {
  cooldownDays,
  config,
  normalizeDevice,
  normalizeRegion,
  normalizeTier,
  parseTicketTopic,
  TIER_COOLDOWN_MS,
  ticketTopic,
} from "./config.js";
import {
  APPLY_BUTTON_ID,
  buildTicketRow,
  CLOSE_BUTTON_ID,
  RESULT_BUTTON_ID,
} from "./panel.js";

const STAFF_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
];

const BEDFIGHT_THUMBNAIL = resolve(process.cwd(), "assets/bedfight.png");

function applicationModal() {
  const region = new TextInputBuilder()
    .setCustomId("apply-region")
    .setLabel("Region")
    .setPlaceholder("AS / NA / SA / EU")
    .setStyle(TextInputStyle.Short)
    .setMinLength(2)
    .setMaxLength(2)
    .setRequired(true);

  const ign = new TextInputBuilder()
    .setCustomId("apply-ign")
    .setLabel("Minecraft IGN")
    .setPlaceholder("Your in-game name")
    .setStyle(TextInputStyle.Short)
    .setMinLength(3)
    .setMaxLength(16)
    .setRequired(true);

  const device = new TextInputBuilder()
    .setCustomId("apply-device")
    .setLabel("Device")
    .setPlaceholder("Mobile / Controller / PC")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(10)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId("tier-apply-form")
    .setTitle("Bedfight Tier Test Application")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(region),
      new ActionRowBuilder<TextInputBuilder>().addComponents(ign),
      new ActionRowBuilder<TextInputBuilder>().addComponents(device),
    );
}

function resultModal(channelId: string) {
  const previous = new TextInputBuilder()
    .setCustomId("result-previous-tier")
    .setLabel("Previous tier")
    .setPlaceholder("Unranked, HT1, LT1, HT2, LT2, HT3, LT3, HT4, LT4, HT5, LT5")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(12)
    .setRequired(true);

  const next = new TextInputBuilder()
    .setCustomId("result-new-tier")
    .setLabel("New tier")
    .setPlaceholder("HT1, LT1, HT2, LT2, HT3, LT3, HT4, LT4, HT5, LT5")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(12)
    .setRequired(true);

  const score = new TextInputBuilder()
    .setCustomId("result-score")
    .setLabel("Score")
    .setPlaceholder("Enter the winner's score first, e.g. 3-0")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(15)
    .setRequired(true);

  const winner = new TextInputBuilder()
    .setCustomId("result-winner")
    .setLabel("Who won?")
    .setPlaceholder("Enter the winner's IGN or tester username")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(32)
    .setRequired(true);

  const suggestion = new TextInputBuilder()
    .setCustomId("result-suggestion")
    .setLabel("Tester suggestion / notes")
    .setPlaceholder("Explain the tier decision or add testing notes")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1000)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId(`tier-result-form:${channelId}`)
    .setTitle("Submit Bedfight Tier Result")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(previous),
      new ActionRowBuilder<TextInputBuilder>().addComponents(next),
      new ActionRowBuilder<TextInputBuilder>().addComponents(score),
      new ActionRowBuilder<TextInputBuilder>().addComponents(winner),
      new ActionRowBuilder<TextInputBuilder>().addComponents(suggestion),
    );
}

async function isStaff(guild: Guild, userId: string) {
  const member = await guild.members.fetch(userId);
  return member.roles.cache.has(config.staffRoleId);
}

async function getApplicantTickets(guild: Guild, applicantId: string) {
  await guild.channels.fetch();
  const tickets: Array<{
    channel: TextChannel;
    ticket: NonNullable<ReturnType<typeof parseTicketTopic>>;
  }> = [];

  for (const channel of guild.channels.cache.values()) {
    if (channel.type !== ChannelType.GuildText || channel.parentId !== config.ticketCategoryId) {
      continue;
    }
    const ticket = parseTicketTopic(channel.topic);
    if (ticket?.applicantId === applicantId) tickets.push({ channel, ticket });
  }
  return tickets;
}

export async function handleApplyButton(interaction: ButtonInteraction) {
  await interaction.showModal(applicationModal());
}

export async function handleTicketButton(interaction: ButtonInteraction) {
  if (!interaction.guild) {
    await interaction.reply({
      content: "This ticket action can only be used inside the server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!(await isStaff(interaction.guild, interaction.user.id))) {
    await interaction.reply({
      content: "Only the Bedfight testing staff can use ticket controls.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.customId === RESULT_BUTTON_ID) {
    const channel = interaction.channel;
    const ticket =
      channel && "topic" in channel ? parseTicketTopic(channel.topic) : undefined;
    if (!ticket || ticket.status !== "open") {
      await interaction.reply({
        content: "This ticket is not open for result submissions.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.showModal(resultModal(interaction.channelId));
    return;
  }

  if (interaction.customId === CLOSE_BUTTON_ID) {
    await closeTicket(interaction);
  }
}

export async function handleModalSubmit(interaction: ModalSubmitInteraction, client: Client) {
  if (interaction.customId === "tier-apply-form") {
    await createTicket(interaction);
    return;
  }

  if (interaction.customId.startsWith("tier-result-form:")) {
    await submitResult(interaction, client);
  }
}

async function createTicket(interaction: ModalSubmitInteraction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "Applications must be submitted inside the Bedfight server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const region = normalizeRegion(interaction.fields.getTextInputValue("apply-region"));
  const ign = interaction.fields.getTextInputValue("apply-ign").trim();
  const device = normalizeDevice(interaction.fields.getTextInputValue("apply-device"));

  if (!region || !device || !/^[A-Za-z0-9_]{3,16}$/.test(ign)) {
    await interaction.reply({
      content:
        "Check your entries: region must be AS, NA, SA, or EU; device must be Mobile, Controller, or PC; IGN must be a valid 3–16 character Minecraft name.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const previousTickets = await getApplicantTickets(guild, interaction.user.id);
  const existingTicket = previousTickets.find(({ ticket }) => ticket.status === "open");
  if (existingTicket) {
    await interaction.reply({
      content: `You already have an open tier test ticket: <#${existingTicket.channel.id}>`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const latestCompletedAt = previousTickets.reduce((latest, { channel, ticket }) => {
    if (ticket.status !== "completed" && ticket.status !== "result-submitted") return latest;
    return Math.max(latest, ticket.completedAt ?? channel.createdTimestamp);
  }, 0);
  const eligibleAt = latestCompletedAt + TIER_COOLDOWN_MS;
  if (latestCompletedAt > 0 && Date.now() < eligibleAt) {
    await interaction.reply({
      content: `Your ${cooldownDays}-day cooldown is active. You can apply again <t:${Math.ceil(eligibleAt / 1000)}:R>.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = await guild.members.fetch(interaction.user.id);
  const category = await guild.channels.fetch(config.ticketCategoryId);
  if (!category || category.type !== ChannelType.GuildCategory) {
    throw new Error(`Ticket category ${config.ticketCategoryId} is missing or invalid.`);
  }

  const ticket = { applicantId: interaction.user.id, ign, region, device };
  const botUserId = interaction.client.user?.id;
  const channel = await guild.channels.create({
    name: `tier-${ign.toLowerCase()}-${interaction.user.id.slice(-4)}`.slice(0, 100),
    type: ChannelType.GuildText,
    parent: category.id,
    topic: ticketTopic(ticket, "open"),
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: config.staffRoleId,
        allow: STAFF_PERMISSIONS,
      },
      {
        id: member.id,
        allow: STAFF_PERMISSIONS,
      },
      ...(botUserId
        ? [
            {
              id: botUserId,
              allow: STAFF_PERMISSIONS,
            },
          ]
        : []),
    ],
  });

  const applicationEmbed = new EmbedBuilder()
    .setColor(0x38c985)
    .setTitle("New Bedfight Tier Test")
    .setDescription(`Welcome, <@${member.id}>. A tester will review your application here.`)
    .addFields(
      { name: "Minecraft IGN", value: ign, inline: true },
      { name: "Region", value: region, inline: true },
      { name: "Device", value: device, inline: true },
    )
    .setFooter({ text: "Bedfight Tier Testing" })
    .setTimestamp();

  await channel.send({
    content: `<@&${config.staffRoleId}> <@${member.id}>`,
    embeds: [applicationEmbed],
    components: [buildTicketRow()],
    allowedMentions: { roles: [config.staffRoleId], users: [member.id] },
  });

  await interaction.reply({
    content: `Your private tier test ticket is ready: <#${channel.id}>`,
    flags: MessageFlags.Ephemeral,
  });
}

async function disableTicketControls(channel: GuildTextBasedChannel) {
  if (channel.type !== ChannelType.GuildText) return;
  const messages = await channel.messages.fetch({ limit: 50 });
  const controls = [...messages.values()].find((message) =>
    message.components.some((row) =>
      row.type === ComponentType.ActionRow &&
      row.components.some(
        (component) =>
          component.type === ComponentType.Button &&
          (component.customId === CLOSE_BUTTON_ID || component.customId === RESULT_BUTTON_ID),
      ),
    ),
  );
  if (controls) await controls.edit({ components: [buildTicketRow(true, true)] });
}

async function closeTicket(interaction: ButtonInteraction) {
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: "This channel is not a tier test ticket.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const ticket = parseTicketTopic(channel.topic);
  if (!ticket) {
    await interaction.reply({
      content: "This channel is not a tier test ticket.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (ticket.status === "closed") {
    await interaction.reply({
      content: "This ticket is already closed.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await channel.permissionOverwrites.edit(ticket.applicantId, {
    SendMessages: false,
  });
  await channel.setTopic(
    ticketTopic(
      {
        applicantId: ticket.applicantId,
        ign: ticket.ign,
        region: ticket.region,
        device: ticket.device,
      },
      "closed",
    ),
  );
  await disableTicketControls(channel);
  await channel.send({ content: "This tier test ticket has been closed by the testing staff." });
  await interaction.reply({
    content: "Ticket closed. The applicant can still read the ticket but can no longer send messages.",
    flags: MessageFlags.Ephemeral,
  });
}

async function submitResult(interaction: ModalSubmitInteraction, client: Client) {
  const guild = interaction.guild;
  const channelId = interaction.customId.slice("tier-result-form:".length);
  if (!guild || interaction.channelId !== channelId) {
    await interaction.reply({
      content: "Submit the result from the ticket where the test took place.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!(await isStaff(guild, interaction.user.id))) {
    await interaction.reply({
      content: "Only the Bedfight testing staff can submit results.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = await guild.channels.fetch(channelId);
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: "This ticket is no longer open for result submissions.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const ticket = parseTicketTopic(channel.topic);
  if (!ticket || ticket.status !== "open") {
    await interaction.reply({
      content: "This ticket is no longer open for result submissions.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const previousTier = normalizeTier(
    interaction.fields.getTextInputValue("result-previous-tier"),
    true,
  );
  const newTier = normalizeTier(interaction.fields.getTextInputValue("result-new-tier"), false);
  const rawScore = interaction.fields.getTextInputValue("result-score").trim();
  const winner = interaction.fields.getTextInputValue("result-winner").trim();
  const suggestion = interaction.fields.getTextInputValue("result-suggestion").trim();
  const scoreMatch = rawScore.match(/^(\d{1,2})\s*[-–:]\s*(\d{1,2})$/);

  if (!previousTier || !newTier || !winner || !suggestion || !scoreMatch) {
    await interaction.reply({
      content:
        "Check the result entries. Use a listed tier, enter who won, and format the score as 3-0 with the winner's score first.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const score = `${scoreMatch[1]} – ${scoreMatch[2]}`;
  const testerName = interaction.user.username;
  const winnerIsApplicant = winner.toLowerCase() === ticket.ign.toLowerCase();
  const displayedWinner = winnerIsApplicant ? ticket.ign : winner;
  const displayedLoser = winnerIsApplicant ? testerName : ticket.ign;
  const completedAt = Date.now();

  const embed = new EmbedBuilder()
    .setColor(0x4dd38c)
    .setTitle("Bedfight — Tier Result")
    .setDescription(
      `<@${ticket.applicantId}> (**${ticket.ign}**) has been placed at **${newTier}** in Bedfight`,
    )
    .addFields(
      { name: "Tier Before", value: previousTier, inline: true },
      { name: "Tier After", value: newTier, inline: true },
      { name: "Tester", value: `<@${interaction.user.id}>`, inline: false },
      { name: "Fight 1", value: `${displayedWinner} ${score} ${displayedLoser}`, inline: false },
    )
    .setThumbnail("attachment://bedfight.png")
    .setFooter({ text: "Bedfight Tier Testing" })
    .setTimestamp(new Date(completedAt));

  embed.addFields({
    name: "Tester Suggestion",
    value: suggestion.slice(0, 1024),
    inline: false,
  });

  const resultsChannel = await client.channels.fetch(config.resultsChannelId);
  if (
    !resultsChannel ||
    !resultsChannel.isTextBased() ||
    !("send" in resultsChannel) ||
    typeof resultsChannel.send !== "function"
  ) {
    throw new Error(`Results channel ${config.resultsChannelId} is missing or is not text-based.`);
  }

  await resultsChannel.send({
    content: `<@${ticket.applicantId}>`,
    embeds: [embed],
    files: [new AttachmentBuilder(BEDFIGHT_THUMBNAIL, { name: "bedfight.png" })],
    allowedMentions: { users: [ticket.applicantId] },
  });

  await channel.setTopic(
    ticketTopic(
      {
        applicantId: ticket.applicantId,
        ign: ticket.ign,
        region: ticket.region,
        device: ticket.device,
      },
      `completed@${completedAt}`,
      newTier,
    ),
  );
  await channel.permissionOverwrites.edit(ticket.applicantId, {
    SendMessages: false,
  });
  await disableTicketControls(channel);
  await channel.send({
    content: `This test is complete. You may apply again after your ${cooldownDays}-day cooldown <t:${Math.ceil((completedAt + TIER_COOLDOWN_MS) / 1000)}:R>.`,
  });
  await interaction.reply({
    content: `Result posted to <#${config.resultsChannelId}>. The applicant's ${cooldownDays}-day cooldown has started.`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function dispatchTicketButton(interaction: ButtonInteraction) {
  if (interaction.customId === APPLY_BUTTON_ID) {
    await handleApplyButton(interaction);
    return;
  }
  if (
    interaction.customId === CLOSE_BUTTON_ID ||
    interaction.customId === RESULT_BUTTON_ID
  ) {
    await handleTicketButton(interaction);
  }
}
