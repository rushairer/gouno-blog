# Build stage
FROM golang:1.26.6-alpine@sha256:3889b425f035be855a72fb4755265311293b6d414521f0a519d819df32222d83 AS builder

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
FROM alpine:3.19@sha256:6baf43584bcb78f2e5847d1de515f23499913ac9f12bdf834811a3145eb11ca1

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
