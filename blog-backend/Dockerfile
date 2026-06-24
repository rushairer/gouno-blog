# Build stage
FROM golang:1.23-alpine@sha256:383395b794dffa5b53012a212365d40c8e37109a626ca30d6151c8348d380b5f AS builder

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

WORKDIR /app

# Copy the compiled binary and configuration files
COPY --from=builder /build/blog /app/blog
COPY --from=builder /workspace/blog-backend/config /app/config

EXPOSE 8082

ENTRYPOINT ["/app/blog"]
CMD ["web", "--config_path", "/app/config", "--env", "production"]
