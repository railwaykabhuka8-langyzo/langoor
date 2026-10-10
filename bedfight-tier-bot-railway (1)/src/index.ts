import {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { config } from "./config.js";
import { handleLeaderboardCommand } from "./leaderboard.js";
import { postPanel } from "./panel.js";
import { dispatchTicketButton, handleModalSubmit } from "./tickets.js";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  throw new Error("DISCORD_TOKEN is missing. Set it as a Railway/service environment variable.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const applicationCommands = [
  new SlashCommandBuilder()
    .setName("tier-panel")
    .setDescription("Post the Bedfight tier testing panel in the configured channel.")
    .setDefaultMemberPermissions(null)
    .toJSON(),
  new SlashCommandBuilder()
    .setName("leaderboardbf")
    .setDescription("Show the current Bedfight tier leaderboard.")
    .setDefaultMemberPermissions(null)
    .toJSON(),
];

async function registerCommands() {
  if (!client.application) throw new Error("Discord application is not ready.");
  const existingCommands = await client.application.commands.fetch();
  for (const command of applicationCommands) {
    const existing = existingCommands.find((registered) => registered.name === command.name);
    if (!existing) {
      await client.application.commands.create(command);
    }
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.info(`Connected to Discord as ${readyClient.user.tag}.`);
  readyClient.user.setActivity("Bedfight tier testing", { type: ActivityType.Watching });

  try {
    await registerCommands();
  console.info("Registered Bedfight slash commands.");
  } catch (error) {
    console.error("Could not register Bedfight slash commands.", error);
  }

  try {
    await postPanel(readyClient, true);
  } catch (error) {
    console.error(
      "Could not check or post the panel. Confirm the bot is in the server and can view, read history, and send messages in the panel channel.",
      error,
    );
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "tier-panel") {
      if (!interaction.guild) {
        await interaction.reply({
          content: "Use this command in the Bedfight server.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const member = await interaction.guild.members.fetch(interaction.user.id);
      const allowed = member.roles.cache.has(config.staffRoleId);
      if (!allowed) {
        await interaction.reply({
          content: "Only Bedfight testing staff can post the panel.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await postPanel(client);
      await interaction.reply({
        content: `The tier testing panel was posted in <#${config.panelChannelId}>.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === "leaderboardbf") {
      await handleLeaderboardCommand(interaction);
      return;
    }

    if (interaction.isButton()) {
      await dispatchTicketButton(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction, client);
    }
  } catch (error) {
    console.error("Discord interaction failed.", error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction
        .reply({
          content: "That action failed. Check that the bot has the required channel and role permissions.",
          flags: MessageFlags.Ephemeral,
        })
        .catch((replyError: unknown) => console.error("Could not send error response.", replyError));
    }
  }
});

client.on(Events.Error, (error) => {
  console.error("Discord client error.", error);
});

await client.login(token);
