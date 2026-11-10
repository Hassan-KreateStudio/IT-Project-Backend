package middleware

import (
	"net/http"
	"net/url"
	"strings"
)

// CORSPolicy is the browser allow-list. Native clients (the iOS app) do not
// send an Origin header, and those requests are passed through unchanged.
type CORSPolicy struct {
	allowed       map[string]struct{}
	AllowLocalDev bool
}

// NewCORSPolicy builds a policy from exact origins. Comparison is on the
// scheme, host, and port, so a trailing slash does not matter.
func NewCORSPolicy(origins []string, allowLocalDev bool) CORSPolicy {
	allowed := make(map[string]struct{}, len(origins))
	for _, origin := range origins {
		if key := originKey(origin); key != "" {
			allowed[key] = struct{}{}
		}
	}
	return CORSPolicy{allowed: allowed, AllowLocalDev: allowLocalDev}
}

func (p CORSPolicy) allows(origin string) bool {
	key := originKey(origin)
	if key == "" {
		return false
	}
	if _, ok := p.allowed[key]; ok {
		return true
	}
	return p.AllowLocalDev && isLocalDevOrigin(origin)
}

// Handler sets CORS headers for allow-listed browser origins. A missing or
// disallowed Origin still reaches the API: URLSession and other native
// clients ignore CORS, and withholding the header is what stops a browser.
func (p CORSPolicy) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Add("Vary", "Origin")
		if origin := strings.TrimSpace(r.Header.Get("Origin")); p.allows(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Expose-Headers", "X-Auth-Cache")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func originKey(origin string) string {
	origin = strings.TrimSpace(origin)
	if origin == "" || strings.EqualFold(origin, "null") {
		return ""
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.User != nil || parsed.Host == "" {
		return ""
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return ""
	}
	return scheme + "://" + strings.ToLower(parsed.Host)
}

func isLocalDevOrigin(origin string) bool {
	parsed, err := url.Parse(strings.TrimSpace(origin))
	if err != nil || parsed.User != nil {
		return false
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}
