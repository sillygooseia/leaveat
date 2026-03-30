FROM node:18-alpine

ARG NPM_TOKEN

WORKDIR /usr/src/app

# install deps
COPY package*.json ./

# Configure npm to use private registry for @epheme scope
RUN echo "@epheme:registry=https://npm.sillygooseia.com" >> .npmrc && \
    echo "//npm.sillygooseia.com/:_authToken=${NPM_TOKEN}" >> .npmrc && \
    npm install --production && \
    rm -f .npmrc

# copy source
COPY . ./

EXPOSE 3000

CMD ["npm", "start"]
