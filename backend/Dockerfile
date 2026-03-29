FROM node:18-alpine

# @bafgo/core is a workspace package referenced as file:../../bafgo/packages/core.
# Inject it via --build-context bafgo_core=... (production) or
# additional_contexts in docker-compose (dev).
# npm resolves file:../../packages/core from WORKDIR /usr/src/app to /usr/packages/core.
COPY --from=bafgo_core . /usr/packages/core/

WORKDIR /usr/src/app

# install deps
COPY package*.json ./
# --install-links copies file: deps instead of symlinking, so Node resolves
# transitive deps (nodemailer, ioredis etc.) from /usr/src/app/node_modules.
RUN npm install --production --install-links

# copy source
COPY . ./

EXPOSE 3000

CMD ["npm", "start"]
