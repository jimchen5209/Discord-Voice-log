# Discord-Voice-log [![CircleCI](https://circleci.com/gh/jimchen5209/Discord-Voice-log.svg?style=svg)](https://circleci.com/gh/jimchen5209/Discord-Voice-log)

## How to use

1. Install [mongoDB](https://www.mongodb.com/download-center/community), [node.js](https://nodejs.org/en/) (Recommend using [nvm](https://github.com/nvm-sh/nvm)), [yarn](https://yarnpkg.com/), [ffmpeg](https://ffmpeg.org/) and start the mongoDB Server
2. Clone this repo
3. Install dependencies with `yarn install`
4. Build with `yarn build:prod`
5. Run `node dist` the first time to generate `config.json`
6. Create and grab your discord bot token [here](https://discordapp.com/developers/applications/)
7. Fill `config.json`
8. Install `pm2` via `npm install -g pm2` (Optional but recommended)
9. Start the bot with `node dist` or `pm2 reload ecosystem.config.js`
