FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Moscow
RUN apk add --no-cache tzdata
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
# Схема БД создаётся при каждом старте (CREATE TABLE IF NOT EXISTS)
CMD ["node", "src/server.js"]
