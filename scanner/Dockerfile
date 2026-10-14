FROM node:20-alpine

RUN apk update && apk upgrade

WORKDIR /app

COPY package.json ./
RUN npm install

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "process.kill(1, 0)" || exit 1

CMD ["tail", "-f", "/dev/null"]
