FROM node:24-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----
FROM node:24-alpine
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
# Cópia das migrations/schema FORA de /app/prisma — este path não é coberto pelo
# volume csp-db (montado em /app/prisma), então o start.sh consegue sincronizar
# migrações novas para dentro do volume a cada deploy.
COPY --from=builder /app/prisma ./prisma-baked
COPY --from=builder /app/prisma.config.ts ./
COPY package.json ./

COPY start.sh ./
RUN chmod +x start.sh
COPY assets ./assets

EXPOSE 3001
CMD ["./start.sh"]
