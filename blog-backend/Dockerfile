# Build stage
FROM golang:1.27.0-alpine@sha256:4c9fe60190a2a3350ddc51de80d0224b8a6698d12bdfc999fee45ea9d6c46dbc AS builder

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
FROM alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc

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
