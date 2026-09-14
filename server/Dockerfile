FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . ./
RUN mkdir -p /var/lib/stardust-campus-circle/uploads && chown -R node:node /app /var/lib/stardust-campus-circle

USER node
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4310 \
    UPLOAD_DIR=/var/lib/stardust-campus-circle/uploads
EXPOSE 4310
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4310/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
