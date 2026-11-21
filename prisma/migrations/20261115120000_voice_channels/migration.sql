-- Move the voice channels of each guild into their own table, so a guild can have several (Fluxer).
-- "currentVoiceChannel" becomes an active row and "lastVoiceChannel" an asleep one; then both columns are dropped.
-- Prisma does not wrap SQLite migrations in a transaction, so this one does: a failure (or a crash)
-- before COMMIT rolls everything back and leaves "serverConfig" as it was.

BEGIN;
CREATE TABLE "voiceChannel" (
    "platform" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "serverID" TEXT NOT NULL,
    "channelID" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,

    PRIMARY KEY ("platform", "instanceId", "serverID", "channelID")
);
INSERT INTO "voiceChannel" ("platform", "instanceId", "serverID", "channelID", "active")
SELECT "platform", "instanceId", "serverID", "currentVoiceChannel", true
FROM "serverConfig" WHERE "currentVoiceChannel" != '';
INSERT INTO "voiceChannel" ("platform", "instanceId", "serverID", "channelID", "active")
SELECT "platform", "instanceId", "serverID", "lastVoiceChannel", false
FROM "serverConfig" WHERE "lastVoiceChannel" != '' AND "lastVoiceChannel" != "currentVoiceChannel";
ALTER TABLE "serverConfig" DROP COLUMN "lastVoiceChannel";
ALTER TABLE "serverConfig" DROP COLUMN "currentVoiceChannel";
COMMIT;
