-- Rename "ttsType" to "ttsProvider" and store TTS provider ids instead of engine names:
-- WaveNet -> google-cloud, Legacy -> google-translate, any other value -> google-cloud (the default).
-- SQLite cannot change a column default in place, so the table is redefined.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_serverConfig" (
    "serverID" TEXT NOT NULL PRIMARY KEY,
    "lang" TEXT NOT NULL DEFAULT 'en_US',
    "channelID" TEXT NOT NULL DEFAULT '',
    "lastVoiceChannel" TEXT NOT NULL DEFAULT '',
    "currentVoiceChannel" TEXT NOT NULL DEFAULT '',
    "ttsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ttsMessageLang" TEXT NOT NULL DEFAULT 'en_US',
    "ttsProvider" TEXT NOT NULL DEFAULT 'google-cloud',
    "ttsVoiceLang" TEXT NOT NULL DEFAULT 'en-US',
    "ttsVoiceName" TEXT NOT NULL DEFAULT 'en-US-Wavenet-A'
);
INSERT INTO "new_serverConfig" ("serverID", "lang", "channelID", "lastVoiceChannel", "currentVoiceChannel", "ttsEnabled", "ttsMessageLang", "ttsProvider", "ttsVoiceLang", "ttsVoiceName")
SELECT "serverID", "lang", "channelID", "lastVoiceChannel", "currentVoiceChannel", "ttsEnabled", "ttsMessageLang",
    CASE "ttsType" WHEN 'WaveNet' THEN 'google-cloud' WHEN 'Legacy' THEN 'google-translate' ELSE 'google-cloud' END,
    "ttsVoiceLang", "ttsVoiceName"
FROM "serverConfig";
DROP TABLE "serverConfig";
ALTER TABLE "new_serverConfig" RENAME TO "serverConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
