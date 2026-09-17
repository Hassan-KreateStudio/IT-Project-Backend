package middleware

import (
	"log"
	"net/http"
	"time"

	chimw "github.com/go-chi/chi/v5/middleware"
)

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func Apply(app interface {
	Use(middlewares ...func(http.Handler) http.Handler)
}) {
	app.Use(CORS)
	app.Use(chimw.RequestID)
	app.Use(requestLogger)
}

func requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		startedAt := time.Now()
		writer := &statusWriter{ResponseWriter: w, status: http.StatusOK}

		next.ServeHTTP(writer, r)

		log.Printf(
			"request method=%s path=%s status=%d duration_ms=%d request_id=%s",
			r.Method,
			r.URL.Path,
			writer.status,
			time.Since(startedAt).Milliseconds(),
			chimw.GetReqID(r.Context()),
		)
	})
}
