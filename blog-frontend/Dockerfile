# Build stage
FROM --platform=$BUILDPLATFORM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS builder

WORKDIR /app
ARG VITE_GOSSO_ISSUER=
ARG VITE_GOSSO_CLIENT_ID=blog-bff
ARG VITE_GOSSO_SCOPE="openid profile email"
ENV VITE_GOSSO_ISSUER=${VITE_GOSSO_ISSUER}
ENV VITE_GOSSO_CLIENT_ID=${VITE_GOSSO_CLIENT_ID}
ENV VITE_GOSSO_SCOPE=${VITE_GOSSO_SCOPE}

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Static serving does not use the full image's XML, njs or image-filter modules.
FROM nginx:1.30.7-alpine-slim@sha256:8c950211a641ec5b23f265450517001f6bcca533666120ebe36cb4cff3d00a55

RUN apk add --no-cache libcrypto3=3.5.9-r1 libssl3=3.5.9-r1 pcre2=10.49-r0 zlib=1.4-r0 \
    && mkdir -p /etc/nginx/snippets \
    && chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx/conf.d \
    && touch /var/run/nginx.pid \
    && chown nginx:nginx /var/run/nginx.pid

COPY --from=builder --chown=nginx:nginx /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf

USER nginx

RUN nginx -t

EXPOSE 8081

CMD ["nginx", "-g", "daemon off;"]
