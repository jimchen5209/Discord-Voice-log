# Discord-Voice-log [![CircleCI](https://circleci.com/gh/jimchen5209/Discord-Voice-log.svg?style=svg)](https://circleci.com/gh/jimchen5209/Discord-Voice-log)

## How to use

1. Install [node.js](https://nodejs.org/en/) (Recommend using [nvm](https://github.com/nvm-sh/nvm)), [pnpm](https://pnpm.io/), [ffmpeg](https://ffmpeg.org/)
2. Clone this repo
3. Install dependencies with `pnpm install`
4. Generate Prisma Client:
  ```bash
  pnpm db:generate
  ```
5. Build with `pnpm build:prod`
6. Run `node dist` the first time to generate `config.json`
7. Fill `config.json` with your bot tokens and settings.
8. The database is created automatically when the bot starts.
  *(Note: This project now uses SQLite via Prisma ORM (v7) with `better-sqlite3` driver for simplified setup)*
9. Install `pm2` via `npm install -g pm2` (Optional but recommended)
10. Start the bot with `node dist` or `pm2 reload ecosystem.config.js`
11. When inviting bot to your server, be sure to enable these permission at least  
![image](https://user-images.githubusercontent.com/10269287/149659808-a51a571f-7ef2-43cf-b415-6220a56847a4.png)  
12. This bot uses slash command, type `/` in server chat and start configuring the bot
![image](https://user-images.githubusercontent.com/10269287/149659879-8be3aecb-d8b6-4a7c-b06f-43776dfe2233.png)

## Upgrading

1. Stop the bot.
2. Back up the database file (by default `prisma/voice-log.db`), `assets/` and `mongo_dump.json` yourself: the next start changes them in place and makes no backups.
3. Start the bot. It applies pending database migrations (`prisma migrate deploy`) before anything else, then converts `assets/<User ID>.json` files in the old format (see [Voice Activity Sound](#voice-activity-sound)).

### A failed database migration

Each database migration runs in one transaction, so when `prisma migrate deploy` fails (or is killed) the failed migration is rolled back and the database is left as it was. The bot logs the error and exits with code 1. Prisma still records the migration as failed: the failing start reports `P3018` with the database error and the migration name, and every later start reports `P3009` until it is resolved. Fix the cause shown by `P3018`, then mark the migration as rolled back and start the bot again:

```bash
pnpm exec prisma migrate resolve --rolled-back <migration name, e.g. 20261030120000_tts_provider>
```

## Database Migration

If you are upgrading from an older version that used MongoDB, please refer to the [Migration Guide](docs/migration/MONGODB_TO_SQLITE_MIGRATION.md) to move your data to SQLite.

## Voice Activity Sound

 For the voice activity sound, put the following file into `asset/` folder:
```
<User ID>_join.wav --Connected to the channel
<User ID>_left.wav --Left the channel
<User ID>_switched_out.wav --Switched out from the channel
<User ID>_switched_in.wav --Switched into the channel
```
or place `<User ID>.json` into `asset/` folder with:
```json
{
  "provider": "google-translate",
  "lang": "<language from google translate>",
  "join": "<Text when connected to the channel>",
  "left": "<Text when left the channel>",
  "switched_out": "<Text when switched out from the channel>",
  "switched_in": "<Text when switched into to the channel>"
}
```
If you want to use the new google cloud text to speech, be sure to have apiKey in the config, and json content is:
```json
{
  "provider": "google-cloud",
  "lang": "<language from google cloud>",
  "voice": "<voice from google cloud>",
  "join": "<Text when connected to the channel>",
  "left": "<Text when left the channel>",
  "switched_out": "<Text when switched out from the channel>",
  "switched_in": "<Text when switched into to the channel>"
}
```
`lang` and `voice` available from https://cloud.google.com/text-to-speech/docs/voices

Files in the old format (`"use_wave_tts": true` / `false` or missing instead of `provider`) are converted in place when the bot starts (not backed up; back up `assets/` first). `"use_wave_tts": true` with a `voice` becomes `"provider": "google-cloud"`; anything else (`false`, missing, or `true` without a `voice`) becomes `"provider": "google-translate"`, matching how it actually behaved before. Restart the bot after adding an old-format file.

Example:

```json
{
  "provider": "google-translate",
  "lang": "en_US",
  "join": "Jim joined the channel",
  "left": "Jim left the channel",
  "switched_out": "Jim switched out from the channel",
  "switched_in": "Jim switched into  the channel"
}
```
```json
{
  "provider": "google-cloud",
  "lang": "en-GB",
  "voice": "en-GB-Wavenet-B",
  "join": "Jim joined the channel",
  "left": "Jim left the channel",
  "switched_out": "Jim switched out from the channel",
  "switched_in": "Jim switched into  the channel"
}
```
