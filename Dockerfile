FROM node:22-alpine AS build

WORKDIR /app

COPY src/web/package.json src/web/package-lock.json ./src/web/
RUN npm ci --prefix src/web

COPY src/web ./src/web
COPY src/static/PFF35-Schedule.json ./src/static/PFF35-Schedule.json
RUN npm run build --prefix src/web

FROM nginxinc/nginx-unprivileged:alpine

COPY src/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/src/web/dist /usr/share/nginx/html

EXPOSE 8080
