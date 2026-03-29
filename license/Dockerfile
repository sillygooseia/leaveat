FROM node:20-alpine AS builder
COPY --from=bafgo_core . /usr/bafgo/packages/core/
WORKDIR /usr/src/app
COPY package*.json tsconfig.json ./
RUN npm ci --install-links
COPY src ./src
RUN npm run build

FROM node:20-alpine
COPY --from=bafgo_core . /usr/bafgo/packages/core/
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --omit=dev --install-links
COPY --from=builder /usr/src/app/dist ./dist
EXPOSE 3001
CMD ["node", "dist/index.js"]
