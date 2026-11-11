FROM --platform=$BUILDPLATFORM golang:1.27.4-alpine@sha256:0a5f7fe796599ff487605987432e7619ae45beeb2fba4c2ce0b907879932aebf AS builder
WORKDIR /app
ARG TARGETOS
ARG TARGETARCH
COPY go.mod go.sum ./
RUN apk add --no-cache musl=1.2.6-r3 musl-utils=1.2.6-r3
RUN go mod download && go mod verify
COPY . .
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -ldflags="-w -s" -o seed main.go

FROM alpine:3.24@sha256:be2656061b536c1883c4034790e21d0a09c5aaaf51968b89368a3c0371ea2c9a
RUN apk --no-cache add musl=1.2.6-r3 musl-utils=1.2.6-r3 ca-certificates=20261020-r0 zlib=1.4-r0 \
    && addgroup -S seed \
    && adduser -S -G seed -h /app seed
WORKDIR /app
COPY --from=builder --chown=seed:seed /app/seed /app/seed
USER seed
CMD ["/app/seed"]
