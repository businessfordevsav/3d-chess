# 3D Chess game server. The browser libraries are already in vendor/, so only the server's
# runtime dependencies are installed. The SQLite database lives on the /data volume.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production PORT=3000 DB_FILE=/data/chess.db

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js glicko2.js pages.js index.html pages.css ads.js icon.svg og-image.jpg apple-touch-icon.png \
     icon-192.png icon-512.png site.webmanifest ./
COPY vendor ./vendor
COPY models ./models

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "--no-warnings", "server.js"]
