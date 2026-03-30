FROM node:20-alpine AS builder

ARG NPM_TOKEN

WORKDIR /usr/src/app
COPY package*.json tsconfig.json ./
RUN echo "@epheme:registry=https://npm.sillygooseia.com" >> .npmrc && \
    echo "//npm.sillygooseia.com/:_authToken=${NPM_TOKEN}" >> .npmrc && \
    npm ci && \
    rm -f .npmrc
COPY src ./src
RUN npm run build

FROM node:20-alpine

ARG NPM_TOKEN

WORKDIR /usr/src/app
COPY package*.json ./
RUN echo "@epheme:registry=https://npm.sillygooseia.com" >> .npmrc && \
    echo "//npm.sillygooseia.com/:_authToken=${NPM_TOKEN}" >> .npmrc && \
    npm ci --omit=dev && \
    rm -f .npmrc
COPY --from=builder /usr/src/app/dist ./dist
EXPOSE 3001
CMD ["node", "dist/index.js"]
