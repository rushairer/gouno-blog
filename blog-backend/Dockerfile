# Build stage
FROM golang:1.27.1-alpine@sha256:cf6fca6641884b8433441b2b0652976f975e1d0fdd26d177eaaf8596087f3125 AS builder

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /workspace

# Copy the blog-backend source code
COPY blog-backend /workspace/blog-backend

WORKDIR /workspace/blog-backend

ENV GOPROXY=https://goproxy.cn,direct
RUN go mod download && go mod verify

# Compile the application
RUN CGO_ENABLED=0 go build -buildvcs=false -o /build/blog ./cmd

# Runtime stage
FROM alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b

RUN apk add --no-cache ca-certificates tzdata

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
