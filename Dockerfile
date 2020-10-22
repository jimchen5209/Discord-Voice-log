FROM node:lts
WORKDIR /app

ADD . .
RUN yarn
RUN yarn build:prod
RUN rm -rf node_modules
RUN yarn --production

FROM node:lts-alpine
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache ffmpeg

COPY --from=0 /app/dist /app/
COPY --from=0 /app/node_modules /app/node_modules
# COPY config.json /app/config.json

VOLUME [ "/app/assets" ]
VOLUME [ "/app/caches" ]
VOLUME [ "/app/logs" ]

ENTRYPOINT [ "node", "dist" ]