-- CreateTable
CREATE TABLE "serverConfig" (
    "serverID" TEXT NOT NULL PRIMARY KEY,
    "lang" TEXT NOT NULL DEFAULT 'en_US',
    "channelID" TEXT NOT NULL DEFAULT '',
    "lastVoiceChannel" TEXT NOT NULL DEFAULT '',
    "currentVoiceChannel" TEXT NOT NULL DEFAULT '',
    "ttsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ttsMessageLang" TEXT NOT NULL DEFAULT 'en_US',
    "ttsType" TEXT NOT NULL DEFAULT 'WaveNet',
    "ttsVoiceLang" TEXT NOT NULL DEFAULT 'en-US',
    "ttsVoiceName" TEXT NOT NULL DEFAULT 'en-US-Wavenet-A'
);
