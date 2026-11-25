# Build stage
FROM --platform=$BUILDPLATFORM golang:1.27.4-alpine@sha256:70bd7ddea8b6cbe5d6943cde279d6b67feb10cc924fb9100d1d8757c1575b280 AS builder

RUN apk add --no-cache musl=1.2.6-r3 musl-utils=1.2.6-r3 libcrypto3=3.5.9-r1 libssl3=3.5.9-r1 ca-certificates=20261020-r0 tzdata=2026f-r0

WORKDIR /workspace
ARG TARGETOS
ARG TARGETARCH

# Copy the blog-backend source code
COPY blog-backend /workspace/blog-backend

WORKDIR /workspace/blog-backend

ENV GOPROXY=https://goproxy.cn,direct
RUN go mod download && go mod verify

# Compile the application
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -buildvcs=false -o /build/blog ./cmd

# Runtime stage
FROM alpine:3.24@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf

RUN apk add --no-cache musl=1.2.6-r3 musl-utils=1.2.6-r3 libcrypto3=3.5.9-r1 libssl3=3.5.9-r1 ca-certificates=20261020-r0 tzdata=2026f-r0 zlib=1.4-r0

RUN addgroup -S -g 10001 blog && adduser -S -D -H -u 10001 -G blog blog \
    && mkdir -p /app/data/media \
    && chown -R blog:blog /app

WORKDIR /app

# Copy the compiled binary and configuration files
COPY --from=builder --chown=blog:blog /build/blog /app/blog
COPY --from=builder --chown=blog:blog /workspace/blog-backend/config /app/config

USER blog

EXPOSE 8082

ENTRYPOINT ["/app/blog"]
CMD ["web", "--config_path", "/app/config", "--env", "production"]
