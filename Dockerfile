# Spyvoo production image.
# Zero npm dependencies, so there is no "npm install" step.
# Needs Node.js 22.13 or newer (built-in node:sqlite with FTS5). node:22-alpine tracks the latest 22.x.
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/app/data/spyvoo.db \
    TZ=UTC

WORKDIR /app

# Copy the app (.dockerignore leaves out .env, data, tests, docs...)
COPY --chown=node:node . .

# /app/data holds the SQLite database, saved ad media (when MEDIA_DRIVER=local) and backups.
RUN mkdir -p /app/data && chown -R node:node /app/data

# No VOLUME line on purpose: on Railway, attach a volume at /app/data in the dashboard (see docs/RAILWAY.md).
EXPOSE 3000

# /healthz returns 200. In maintenance mode pages return 503, but /healthz stays 200.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
