# Build stage
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS builder

WORKDIR /app
ARG VITE_GOSSO_ISSUER=
ARG VITE_GOSSO_CLIENT_ID=blog-spa
ENV VITE_GOSSO_ISSUER=${VITE_GOSSO_ISSUER}
ENV VITE_GOSSO_CLIENT_ID=${VITE_GOSSO_CLIENT_ID}

COPY package*.json ./
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
