FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /api ./src

FROM alpine:3.20

RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY --from=builder /api /api
COPY --from=builder /app/migrations ./migrations

# Keep the /graph explorer open for the project demo.
ENV GRAPH_EXPLORER=public

EXPOSE 8080

CMD ["/api"]
