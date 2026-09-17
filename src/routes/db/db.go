package db

import (
	"net/http"

	apphttp "github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/http"
	neo4jdb "github.com/Hassan-KreateStudio/IT-Project-Backend/src/platform/neo4j"

	"github.com/go-chi/chi/v5"
)

func Register(r chi.Router, client *neo4jdb.Client) {
	r.Get("/", func(w http.ResponseWriter, req *http.Request) {
		if err := client.Ping(req.Context()); err != nil {
			apphttp.Error(w, http.StatusServiceUnavailable, "unavailable")
			return
		}
		apphttp.SuccessOK(w, map[string]any{"status": "ok"})
	})
}
