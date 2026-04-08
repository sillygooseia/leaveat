# ---- build stage ----
FROM node:20-alpine AS build

WORKDIR /usr/src/app

COPY package*.json .npmrc ./
RUN npm install

COPY . .
RUN npm run build -- --configuration production

# ---- serve stage ----
FROM nginx:1.27-alpine

RUN rm -rf /usr/share/nginx/html/*

# Angular build output: dist/leaveat/browser
COPY --from=build /usr/src/app/dist/leaveat/browser /usr/share/nginx/html
COPY --from=build /usr/src/app/marketing /usr/share/nginx/html/marketing

# Custom nginx config: serves index.html for all routes (Angular HTML5 routing)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
