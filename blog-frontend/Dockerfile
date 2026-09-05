# Build stage
FROM node:26-alpine@sha256:2d984a15c9b54fd0aeb608b8e0d0d83529eb34d2966db27a1fb4f1edc3d298a3 AS builder

WORKDIR /app
ARG VITE_GOSSO_ISSUER=
ARG VITE_GOSSO_CLIENT_ID=blog-bff
ARG VITE_GOSSO_SCOPE="openid profile email"
ENV VITE_GOSSO_ISSUER=${VITE_GOSSO_ISSUER}
ENV VITE_GOSSO_CLIENT_ID=${VITE_GOSSO_CLIENT_ID}
ENV VITE_GOSSO_SCOPE=${VITE_GOSSO_SCOPE}

COPY package*.json ./
COPY vendor/gouno-ui-0.1.0.tgz ./vendor/
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage
FROM nginx:stable-alpine@sha256:0d3b80406a13a767339fbe2f41406d6c7da727ab89cf8fae399e81f780f814d1

RUN mkdir -p /etc/nginx/snippets \
    && chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx/conf.d \
    && touch /var/run/nginx.pid \
    && chown nginx:nginx /var/run/nginx.pid

COPY --from=builder --chown=nginx:nginx /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf

USER nginx

EXPOSE 8081

CMD ["nginx", "-g", "daemon off;"]
