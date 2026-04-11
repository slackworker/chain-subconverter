FROM golang:1.25-alpine AS builder

ARG TARGETOS=linux
ARG TARGETARCH=amd64

WORKDIR /src

RUN apk add --no-cache build-base

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal

RUN CGO_ENABLED=1 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/chain-subconverter ./cmd/server

FROM alpine:3.20

RUN addgroup -S app && adduser -S -G app app \
    && apk add --no-cache ca-certificates tzdata wget

WORKDIR /app

COPY --from=builder /out/chain-subconverter /usr/local/bin/chain-subconverter

USER app

EXPOSE 11200

ENTRYPOINT ["/usr/local/bin/chain-subconverter"]
