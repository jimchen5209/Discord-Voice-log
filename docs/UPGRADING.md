# Upgrading

The upgrade steps are in the [README](../README.md#upgrading). This page explains what `pnpm migrate` does, when the bot exits with code 78, the backups `pnpm migrate` makes, how to restore one, what to do when a migration fails, and the `/voice tts` option rename.

## What `pnpm migrate` does

`pnpm migrate` first checks the data version record and the assets, and stops before touching the database if the record is malformed or newer than the code or an asset file is invalid (see [Data version](#data-version)). It then waits up to about 10 seconds if another connection holds the database locked, stops there if there is nothing to migrate, [backs up](#backups) the data, applies pending database migrations (`prisma migrate deploy`), imports the MongoDB dump if there is one (see the [MongoDB to SQLite migration guide](migration/MONGODB_TO_SQLITE_MIGRATION.md)), and upgrades the member files in `assets/` to the current [data version](#data-version). Running it again changes nothing and makes no backup.

## Platform scope (config version 6, data version 3)

This release prepares for more than one platform (Fluxer, official and self-hosted) next to Discord. Nothing changes for Discord users once the upgrade is done:

- `config.json` (config version 6): the `discord` block moves to `platform.discord`, with `enabled: true`. `platform.fluxer` is a list of Fluxer instances, `{ "id", "enabled", "origin", "botToken", "admins" }`; it starts with the official instance, disabled. `id` is stored with each instance's data, so never change it once used; it must use only `a-z`, `0-9` and `-`, cannot be `discord` and cannot repeat, `origin` must be an `https://` URL, and an enabled instance needs a `botToken`. See [Fluxer](#fluxer) for what an enabled instance does.
- The database: every server config gets the scope it belongs to (`platform`, `instanceId`); existing rows become Discord's (migration `20261108080000_platform_scope`).
- The member files move from `assets/` to `assets/discord/` ([data version](#data-version) 3).

Stop the bot before running `pnpm migrate` for this upgrade, and start it again right after: the previous version keeps running on the new data otherwise, and until it is reloaded it cannot read the moved member files or save a server it has not seen before (the new columns have no default). `pm2 deploy` runs `pnpm migrate` before reloading the bot, so for this release run `pm2 stop VoiceLog` before deploying (the reload at the end starts it again).

To go back to the previous version, stop the bot, run `pnpm migrate --restore <the backup this upgrade made>`, check out the previous version and restore `config-5.json` as `config.json`. The previous version cannot read the new database or assets: it refuses to start on data version 3 (code 78).

## Fluxer

Each enabled `platform.fluxer` instance runs next to Discord with its own data and admins. It is text only: join, leave and move embeds in the log channel, and the settings commands. Voice (`voice join`, `voice leave`, `voice tts`) answers that voice is not available on this platform yet, and messages are never read aloud.

- Start-up: the bot reads `<origin>/.well-known/fluxer` without the token and without following redirects, then sends the token only to the `api_public` and gateway URLs it finds, and only when they are `https://`/`wss://` URLs on the origin's host or a subdomain of it. An instance that fails this, or fails to log in, is logged and stays offline; Discord and the other instances keep running. Discord failing to start still stops the bot, as before.
- Commands: Fluxer bots have no slash commands, so a message that starts with a mention of the bot, then a space, is a command, e.g. `@VoiceLog log set en_US`; it is never logged or read aloud. Mention the bot alone, or mention it and write `help`, to list the commands: `log set [language]`, `log unset`, `log language <language>`, `voice join`, `voice leave`, `voice tts [enabled=true|false] [provider=...] [message_lang=...] [voice_lang=...] [voice_name=...]` and `refresh_cache`. A mention elsewhere in a message is not a command: the message is logged as usual. Permissions are Discord's: Manage Messages in the server (owner and Administrator included), or the instance's `admins`; `refresh_cache` is for `admins` only. Fluxer has no private replies, so every reply, including errors and the permission refusal, is a public reply to the command.
- Join and leave: a Fluxer user can be connected more than once, in one channel or several, and each connection is logged on its own: a second connection to a channel logs a second join, and each connection that ends logs a leave. The footer of each embed names the connection as the Fluxer app shows it, the device type and the connection id, e.g. `Desktop · nuthatch-harmonic`; Fluxer gives each join a new connection id. A change in a channel the bot cannot see is left out. People already in voice when the bot starts or reconnects are not logged.
- Moves: the Fluxer app switches channels by ending the connection and opening a new one in the same gateway session, so a leave is logged 1.5 seconds late; a join from the same session into another channel within that time is logged as one move instead, and its footer shows the connection id before and after, e.g. `Desktop · koala-vega ▶ nuthatch-harmonic`. A slower switch is logged as a leave and a join.
- pm2: `ecosystem.config.js` now runs the bot in fork mode; in cluster mode Fluxer voice cannot open its UDP sockets and the bot crashes with `ERR_INTERNAL_ASSERTION`. pm2 does not change the mode on `reload`, so once run `pm2 delete VoiceLog` and then `pm2 start ecosystem.config.js --env production`.

## Options

`pnpm migrate --help` prints these options (they are defined in `src/migrate.ts`):

- `-h, --help`: Print this help and exit, changing nothing; wins over every other option
- `--preflight`: Only check the data version record, the assets and the MongoDB dump, then stop; changes nothing and makes no backup
- `--skip-invalid`: Leave asset files that are not a JSON object unconverted instead of failing the run
- `--yolo`: Migrate without making a backup first; back up yourself
- `--backup-dir <path>`: Make the backup in <path>/<YYYYMMDD-HHmmss-SSS>/ instead of backup/
- `--restore <path>`: Put the backup in <path> back, after backing up the current data; does not migrate
- `--mongo-dump <path>`: Import the MongoDB dump at <path> instead of ./mongo_dump.json; the path must exist

Refused combinations (exit code 1, nothing is changed): `--restore` with `--preflight`, `--skip-invalid`, `--yolo` or `--mongo-dump`, and `--yolo` with `--backup-dir`. An unknown option or a missing `<path>` is refused the same way.

## Plugins

**Breaking change:** `IVoiceOverwrite.playVoice(member, type)` no longer receives the Dysnomia `Member`. `member` now has only these fields:

- `userId`: the user ID (was `member.id`)
- `username`: the username (was `member.username`)
- `displayName`: the nickname, or the username when there is none (was `member.nick || member.username`)
- `avatarUrl`: the avatar URL, if any (was `member.avatarURL`)
- `scope`: `{ platform, instanceId, guildId }` of the guild (was `member.guild.id`; `platform` is `discord`)

A plugin that uses any other `Member` field must be changed before upgrading. `type` and the return value are unchanged.

## Exit code 78

The bot never migrates on its own. It exits with code 78 when it needs you before it can run:

- The database has unapplied migrations, the data version is older than the code's, or a MongoDB dump at `./mongo_dump.json` is waiting to be imported. It logs ``Run `pnpm migrate` first``.
- The data version record is malformed or newer than the code. It logs an error.
- `prisma/migrations` is missing, for example because the bot was started from another directory. It logs the missing path.
- `config.json` does not exist. The bot generates an empty one; fill it in and start the bot again.
- `config.json` has a config version newer than the code.
- `config.json` has a `tts.systemVoice.provider` that is not a registered provider id. It logs the available ids.
- `config.json` has an invalid `platform` block (see [Platform scope](#platform-scope-config-version-6-data-version-3)), or no platform is enabled. It logs what is wrong (never a token) and does not change `config.json`.
- `config.json` has an older config version. The bot backs it up to `config-<old version>.json`, writes the migrated config and exits. Check `config.json`, then start the bot again yourself: pm2 does not restart it.

`pnpm migrate` loads `config.json` too, so it also exits with code 78 in these `config.json` cases (except "no platform is enabled"); run it again once the config is ready.

pm2 does not restart the bot on code 78 (`stop_exit_codes` in `ecosystem.config.js`). `pm2 deploy` runs `pnpm install`, `pnpm db:generate`, `pnpm build:prod` and `pnpm migrate` (without `--yolo`) in its post-deploy step before reloading the bot, so a deploy makes a backup only when it has something to migrate. If one of these steps fails, the bot is not reloaded.

## `/voice tts` option `type` renamed to `provider`

The `type` option of `/voice tts` is now `provider`. After upgrading, restart or reload (Ctrl+R) the Discord client so it loads the new command definition. A client still on the old definition gets an error instead of a success message, and nothing is changed.

## Backups

`pnpm migrate` makes a backup only when there is something to migrate: unapplied database migrations, a data version record that is missing or older than the code's, or a MongoDB dump (`./mongo_dump.json`, or the path given with `--mongo-dump <path>`, which must exist: a missing one exits with code 1 and changes nothing). When there is none of these, it changes nothing, makes no backup and exits with code 0; `--yolo` and `--backup-dir` then exit with code 1, since there is no backup to skip or place. A release that changes neither the database nor the data format therefore makes no backup; if you may want to go back to an older version of the bot, back up yourself first.

**Breaking change:** the `MONGODB_DUMP_PATH` environment variable is no longer read. Pass a dump at another path with `pnpm migrate --mongo-dump <path>`; if `MONGODB_DUMP_PATH` is still set, `pnpm migrate` and the bot only log a warning and carry on.

Before it changes anything, `pnpm migrate` backs up all the data to a new directory `backup/<YYYYMMDD-HHmmss-SSS>/` (it stops without changing anything if that directory already exists), whatever this run changes: the database (a consistent copy, even while the bot is running), every file in `assets/`, `data-version.json`, and the MongoDB dump if there is one (it is deleted after the import). `--backup-dir <path>` puts the backup in `<path>/<YYYYMMDD-HHmmss-SSS>/` instead; `<path>` must not be inside `assets/`, since that is backed up and restored whole.

Each backup has a `manifest.json` listing every file with its original path and sha256 (and the paths that did not exist yet, such as `data-version.json` on an install from before data versions). Right after writing it, `pnpm migrate` checks every hash and the copied database (`PRAGMA integrity_check`), and stops, having changed nothing, if anything is off. It then logs the backup's path.

A fresh install (no database, no `assets/`, no record), `--preflight` and a run with nothing to migrate make no backup. An existing backup is never overwritten, and old backups are never deleted; remove them yourself. If the backup fails, `pnpm migrate` exits with code 1 before changing anything; fix the problem (e.g. a file named `backup`, or a full disk) and run it again. `pnpm migrate --yolo` skips the backup (it only logs a warning); back up yourself first.

## Restoring a backup

Stop the bot first. `pnpm migrate --restore` waits while another connection is in the middle of a transaction on the database, but it cannot see a bot that is running and idle, and would replace the database under it.

Then run `pnpm migrate --restore <path to the backup directory>`. It first checks the whole backup (the manifest, every sha256, and the database's integrity) and exits with code 1, changing nothing, if anything is off. It then backs up the current data (the database file as it is, `assets/` and the other files in the manifest) to a new directory in `backup/` (or `--backup-dir`) and logs its path, so `pnpm migrate --restore <that path>` undoes the restore. Then it puts the database, `assets/`, `data-version.json` and the dump back as they were: the database's `-wal` / `-shm` files are deleted, as are files the backup recorded as not existing and files in `assets/` that the backup does not have (they are in the backup of the current data).

It does not migrate: `pnpm start` exits with code 78 until you run `pnpm migrate` again, unless you run the version of the bot that matches the restored data. `--restore` cannot be combined with `--yolo`, `--preflight`, `--skip-invalid` or `--mongo-dump`, and refuses a backup directory inside `assets/` for the same reason as `--backup-dir`.

## A failed migration

If a run fails after the backup, the error says what it changed (for a failed database migration: whether it was rolled back, which needs its SQL to run in a transaction) and how to undo it.

Each database migration runs in one transaction, so when `prisma migrate deploy` fails (or is killed) the failed migration is rolled back and the database is left as it was. `pnpm migrate` then exits with code 1 before importing a dump or converting `assets/`, and the bot keeps refusing to start (code 78). Prisma still records the migration as failed: the failing run reports `P3018` with the database error and the migration name, and every later run reports `P3009` until it is resolved. Fix the cause shown by `P3018`, then mark the migration as rolled back and migrate again:

```bash
pnpm prisma migrate resolve --rolled-back <migration name, e.g. 20261030120000_tts_provider>
pnpm migrate
```

## Data version

The database is versioned by Prisma's migration history (`prisma/migrations`). The app-side data, the member files `<User ID>.json` and `<User ID>_<event>.wav` and where they live, has its own version, `DATA_VERSION` in `src/Migration/record.ts` (currently `3`), recorded in `data-version.json` next to the database file (by default `prisma/data-version.json`), e.g. `{ "version": 3 }`.

Where the member files live:
- Versions 1 and 2: directly in `assets/` (all of them Discord's).
- Version 3: one folder per platform, `assets/discord/` and `assets/fluxer/<instance id>/`, so the same user ID on two platforms never shares settings.

`pnpm migrate` and the data version:
- No record and no `assets/*.json` or `assets/*.wav`: a fresh install; the current version is recorded and nothing is converted.
- No record but some `assets/*.json` or `assets/*.wav`: an install from before data versions (version 1).
- Older version: the files are [backed up](#backups) (unless `--yolo`), then converted in place, one version at a time. From before version 3, the `.json` and `.wav` files directly in `assets/` are then moved (renamed) into `assets/discord/`; any other file there stays and is listed in a warning. The new version is recorded only after every file was converted and moved; on a failure the old version stays and running `pnpm migrate` again finishes the job (files already moved are not touched again).
- A file that is both in `assets/` and in `assets/discord/` fails the run before the database is migrated or anything is changed, and the error lists every such file: nothing is overwritten. Keep one of each and run it again.
- An `assets/*.json` that is not a JSON object (invalid JSON, an array, ...) fails the run before the database is migrated or anything is converted, and the error lists every such file. Fix or remove them, or run `pnpm migrate --skip-invalid` (or `pnpm migrate -- --skip-invalid`; the option applies to every step) to leave them unconverted and record the new version anyway (the bot then skips those files with an error).
- Newer version (a downgrade) or a malformed record: an error is logged, nothing is changed (the database is not migrated either), `pnpm migrate` exits with code 1 and `pnpm start` with code 78.

Rules for changing the data version or the database are in [DATA_VERSION.md](DATA_VERSION.md).
