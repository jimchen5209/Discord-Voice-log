# TTS Provider Migration

Older `assets/<User ID>.json` files chose the TTS engine with `use_wave_tts` instead of naming a `provider`. The bot converts them to the new format by itself.

## When

Every time the bot starts, after the database migrations, it rewrites each old-format `assets/<User ID>.json` in place. `.wav` files are never touched. Nothing is backed up, so back up `assets/` before updating (see [Upgrading](../../README.md#upgrading)). An old-format file added while the bot is running is converted on the next start.

## How

| Old file | New `provider` |
| --- | --- |
| `"use_wave_tts": true` with a `voice` | `google-cloud` |
| `"use_wave_tts": true` without a `voice` | `google-translate` |
| `"use_wave_tts": false` | `google-translate` |
| no `use_wave_tts` and no `provider` | `google-translate` |

This matches how the old versions actually behaved: `use_wave_tts` without a `voice` fell back to Google Translate. A file that already has a `provider` keeps it, and `use_wave_tts` is removed. Every other key (`lang`, `voice`, `join`, `left`, `switched_out`, `switched_in`, ...) is kept as it was.

A file that is not valid JSON or not a JSON object is left unchanged and logged as an error.

Example: this old file

```json
{
  "use_wave_tts": true,
  "lang": "en-GB",
  "voice": "en-GB-Wavenet-B",
  "join": "Jim joined the channel"
}
```

becomes

```json
{
  "provider": "google-cloud",
  "lang": "en-GB",
  "voice": "en-GB-Wavenet-B",
  "join": "Jim joined the channel"
}
```
