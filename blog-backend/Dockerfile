# Build stage
FROM --platform=$BUILDPLATFORM golang:1.27.3-alpine@sha256:f2c872bcee949b7be9c490efd02b48a8a2fbf947cdf533f1c58525ec9d8170fd AS builder

RUN apk add --no-cache ca-certificates=20261020-r0 tzdata=2026e-r0

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
FROM alpine:3.24@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6

RUN apk add --no-cache ca-certificates=20261020-r0 tzdata=2026e-r0 zlib=1.3.2-r1

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
