package ping

import (
	"net/http"

	apphttp "github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/http"

	"github.com/go-chi/chi/v5"
)

func Register(r chi.Router) {
	r.Get("/", Ping)
}

func Ping(w http.ResponseWriter, r *http.Request) {
	apphttp.SuccessOK(w, map[string]any{"status": "ok"})
}
