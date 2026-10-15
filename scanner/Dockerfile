FROM aquasec/trivy:0.76.0 AS trivy

FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node src ./src
COPY --from=trivy /usr/local/bin/trivy /usr/local/bin/trivy

# Este servicio ejecuta Node y Trivy; npm/corepack/yarn no son necesarios en runtime.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v1.22.22

ENV SCAN_TARGET=/scan-target \
    SCAN_OUTPUT_DIR=/var/logs/scanner

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch(process.env.API_URL + '/health', {signal: AbortSignal.timeout(5000)}).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/index.js"]
