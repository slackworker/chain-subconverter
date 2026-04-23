FROM --platform=$BUILDPLATFORM node:22-alpine AS web-builder

WORKDIR /web

COPY web/package.json web/package-lock.json ./
RUN npm ci --fetch-retries=5 --fetch-retry-factor=2 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

COPY web ./
RUN npm run build

FROM --platform=$TARGETPLATFORM golang:1.25-alpine AS builder

ARG TARGETOS=linux
ARG TARGETARCH=amd64

WORKDIR /src

RUN apk add --no-cache build-base

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal

RUN CGO_ENABLED=1 go build -trimpath -ldflags="-s -w" -o /out/chain-subconverter ./cmd/server

FROM alpine:3.20

RUN addgroup -S app && adduser -S -G app app \
    && apk add --no-cache ca-certificates tzdata wget

WORKDIR /app

COPY --from=builder /out/chain-subconverter /usr/local/bin/chain-subconverter
COPY --from=web-builder /web/dist /app/web/dist

ENV CHAIN_SUBCONVERTER_SHORT_LINK_DB_PATH=/tmp/short-links.sqlite3

USER app

EXPOSE 11200

ENTRYPOINT ["/usr/local/bin/chain-subconverter"]
