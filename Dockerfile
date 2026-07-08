FROM node:20-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install --omit=dev

COPY . .

EXPOSE 4000

CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node src/server.js"]