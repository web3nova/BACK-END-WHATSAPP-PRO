FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm install --omit=dev && npm run prisma:generate

COPY . .

EXPOSE 4000

CMD ["node", "src/server.js"]
