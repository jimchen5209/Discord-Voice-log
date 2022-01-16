# Discord-Voice-log [![CircleCI](https://circleci.com/gh/jimchen5209/Discord-Voice-log.svg?style=svg)](https://circleci.com/gh/jimchen5209/Discord-Voice-log)

## How to use

1. Install [mongoDB](https://www.mongodb.com/download-center/community), [node.js](https://nodejs.org/en/) (Recommend using [nvm](https://github.com/nvm-sh/nvm)), [yarn](https://yarnpkg.com/), [ffmpeg](https://ffmpeg.org/) and start the mongoDB Server
2. Clone this repo
3. Install dependencies with `yarn install`
4. Build with `yarn build:prod`
5. Run `node dist` the first time to generate `config.json`
6. Create and grab your discord bot token, application ID, public key [here](https://discordapp.com/developers/applications/)
7. Fill `config.json`
8. Install `pm2` via `npm install -g pm2` (Optional but recommended)
9. Start the bot with `node dist` or `pm2 reload ecosystem.config.js`
10. When inviting bot to your server, be sure to enable these permission at least  
![image](https://user-images.githubusercontent.com/10269287/149659808-a51a571f-7ef2-43cf-b415-6220a56847a4.png)  
11. This bot uses slash command, type `/` in server chat and start configuring the bot
![image](https://user-images.githubusercontent.com/10269287/149659879-8be3aecb-d8b6-4a7c-b06f-43776dfe2233.png)
12. For the voice activity sound, put the following file into `asset/` folder:
```
<User ID>_join.wav --Connected to the channel
<User ID>_left.wav --Left the channel
<User ID>_switched_out.wav --Switched out from the channel
<User ID>_switched_in.wav --Switched into the channel
```
or place `<User ID>.json` into `asset/` folder with:
```json
{
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
  "use_wave_tts":true,
  "lang": "<language from google cloud>",
  "voice": "<voice from google cloud>",
  "join": "<Text when connected to the channel>",
  "left": "<Text when left the channel>",
  "switched_out": "<Text when switched out from the channel>",
  "switched_in": "<Text when switched into to the channel>"
}
```
`lang` and `voice` available from https://cloud.google.com/text-to-speech/docs/voices

Example:

```json
{
  "lang": "en_US",
  "join": "Jim joined the channel",
  "left": "Jim left the channel",
  "switched_out": "Jim switched out from the channel",
  "switched_in": "Jim switched into  the channel"
}
```
```json
{
  "use_wave_tts":true,
  "lang": "en-GB",
  "voice": "en-GB-Wavenet-B",
  "join": "Jim joined the channel",
  "left": "Jim left the channel",
  "switched_out": "Jim switched out from the channel",
  "switched_in": "Jim switched into  the channel"
}
```
