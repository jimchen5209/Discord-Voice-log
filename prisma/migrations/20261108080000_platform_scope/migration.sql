-- Scope every server config by platform and instance: add "platform" and "instanceId" and make the primary
-- key ("platform", "instanceId", "serverID"), where "serverID" is the guild id within the scope. Every existing
-- row is a Discord guild, so it gets the Discord scope ('discord', 'discord'); no other column changes.
-- The new columns have no default, so a write that does not name its scope fails instead of landing on Discord.
-- SQLite cannot change a primary key in place, so the table is redefined.
-- Prisma does not wrap SQLite migrations in a transaction, so this one does: a failure (or a crash)
-- before COMMIT rolls everything back and leaves "serverConfig" as it was. The PRAGMAs stay outside it
-- because SQLite ignores foreign_keys inside a transaction.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
BEGIN;
CREATE TABLE "new_serverConfig" (
    "platform" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "serverID" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'en_US',
    "channelID" TEXT NOT NULL DEFAULT '',
    "lastVoiceChannel" TEXT NOT NULL DEFAULT '',
    "currentVoiceChannel" TEXT NOT NULL DEFAULT '',
    "ttsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ttsMessageLang" TEXT NOT NULL DEFAULT 'en_US',
    "ttsProvider" TEXT NOT NULL DEFAULT 'google-cloud',
    "ttsVoiceLang" TEXT NOT NULL DEFAULT 'en-US',
    "ttsVoiceName" TEXT NOT NULL DEFAULT 'en-US-Wavenet-A',

    PRIMARY KEY ("platform", "instanceId", "serverID")
);
INSERT INTO "new_serverConfig" ("platform", "instanceId", "serverID", "lang", "channelID", "lastVoiceChannel", "currentVoiceChannel", "ttsEnabled", "ttsMessageLang", "ttsProvider", "ttsVoiceLang", "ttsVoiceName")
SELECT 'discord', 'discord', "serverID", "lang", "channelID", "lastVoiceChannel", "currentVoiceChannel", "ttsEnabled", "ttsMessageLang", "ttsProvider", "ttsVoiceLang", "ttsVoiceName"
FROM "serverConfig";
DROP TABLE "serverConfig";
ALTER TABLE "new_serverConfig" RENAME TO "serverConfig";
COMMIT;
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
