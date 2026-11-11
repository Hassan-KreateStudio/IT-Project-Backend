package graph

import (
	"net/http"
	"strings"

	apphttp "github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/http"
)

const (
	// ModePublic serves /graph with no credentials. Local Neo4j gets this
	// when GRAPH_EXPLORER is unset, so a developer on this machine can keep
	// opening the page.
	ModePublic = "public"
	// ModeAuth requires a bearer token, the same JWT the GraphQL API uses.
	ModeAuth = "auth"
	// ModeOff hides the explorer.
	ModeOff = "off"
)

// Protect gates /graph. mode is public, auth, or off. allowed reports
// whether this request carries a valid session; it is only called in auth mode.
func Protect(mode string, allowed func(*http.Request) bool) func(http.Handler) http.Handler {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case ModePublic:
		return func(next http.Handler) http.Handler { return next }
	case ModeOff:
		return func(http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				http.NotFound(w, r)
			})
		}
	default:
		return func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if allowed != nil && allowed(r) {
					next.ServeHTTP(w, r)
					return
				}
				apphttp.Error(w, http.StatusUnauthorized, "unauthorized")
			})
		}
	}
}
