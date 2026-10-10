# Bedfight Tier Testing Bot — Railway

This folder provides a standalone Railway deployment setup for the bot. The bot is a Discord gateway worker; it does not serve a website or need a public port.

## Deploy

1. Extract the ZIP. Keep the files at the repository root.
2. Deploy that folder to Railway from a GitHub repository, or from the extracted folder with the Railway CLI.
3. In Railway, add `DISCORD_TOKEN` under the service's **Variables**. Do not put a real token in GitHub or commit a `.env` file.
4. The other variables are optional if you are using the original server. Set them in Railway when using different channel, role, emoji, or cooldown values. `COOLDOWN_DAYS` defaults to `7`; set `APPLY_EMOJI_ID=none` to omit the button emoji.
5. Deploy. Railway builds with `pnpm run build` and starts with `pnpm start`.

The included `.env.example` documents every setting. For local testing, copy it to `.env` and add the bot token there; `.env` is excluded from Git.

## Discord setup

Invite the bot with the `bot` and `applications.commands` scopes. Grant it View Channel, Send Messages, Read Message History, Embed Links, Attach Files, and Manage Channels. It must be able to access the configured panel, ticket category, and results channels.

Use `/tier-panel` to post the application panel and `/leaderboardbf` to post the top-10 PNG directly as a message image attachment, not inside an embed. It lists each IGN with their latest completed tier; higher tiers come first and the most recent test breaks ties. Results are read from ticket channel topics. Keep completed ticket channels if their cooldown and leaderboard history should remain available.

## Environment variables

| Variable | Required | Default |
| --- | --- | --- |
| `DISCORD_TOKEN` | Yes | — |
| `PANEL_CHANNEL_ID` | No | `1485604042829856878` |
| `TICKET_CATEGORY_ID` | No | `1497455686689230951` |
| `TESTER_ROLE_ID` | No | `1457637235875905708` |
| `RESULTS_CHANNEL_ID` | No | `1506995570068291804` |
| `APPLY_EMOJI_ID` | No | `1507499523122139176` |
| `COOLDOWN_DAYS` | No | `7` |
