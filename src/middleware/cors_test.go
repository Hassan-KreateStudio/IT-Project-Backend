package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCORSAllowsListedOriginAndLeavesNativeCallsAlone(t *testing.T) {
	policy := NewCORSPolicy([]string{
		"https://it-project-backend-aldq.onrender.com",
		"http://localhost:8080/",
	}, true)
	handler := policy.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))

	t.Run("listed origin is echoed", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/graphql", nil)
		req.Header.Set("Origin", "https://it-project-backend-aldq.onrender.com")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK || rec.Body.String() != "ok" {
			t.Fatalf("status %d body %q", rec.Code, rec.Body.String())
		}
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://it-project-backend-aldq.onrender.com" {
			t.Fatalf("allow-origin %q", got)
		}
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got == "*" {
			t.Fatal("wildcard origin")
		}
	})

	t.Run("localhost port is allowed in dev", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/graphql", nil)
		req.Header.Set("Origin", "http://localhost:5173")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
			t.Fatalf("allow-origin %q", got)
		}
	})

	t.Run("other origins are not reflected", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/graphql", nil)
		req.Header.Set("Origin", "https://evil.example")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK || rec.Body.String() != "ok" {
			t.Fatalf("status %d body %q", rec.Code, rec.Body.String())
		}
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Fatalf("allow-origin %q", got)
		}
	})

	t.Run("missing origin still serves the body", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/graphql", nil)
		req.Header.Set("Authorization", "Bearer token")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK || rec.Body.String() != "ok" {
			t.Fatalf("status %d body %q", rec.Code, rec.Body.String())
		}
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Fatalf("native call should not need allow-origin, got %q", got)
		}
		if rec.Header().Get("Access-Control-Allow-Headers") == "" {
			t.Fatal("allow-headers missing")
		}
	})

	t.Run("preflight", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodOptions, "/graphql", nil)
		req.Header.Set("Origin", "http://127.0.0.1:3000")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusNoContent {
			t.Fatalf("status %d", rec.Code)
		}
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://127.0.0.1:3000" {
			t.Fatalf("allow-origin %q", got)
		}
	})
}

func TestCORSCustomListDoesNotImplyLocalhost(t *testing.T) {
	policy := NewCORSPolicy([]string{"https://it-project-backend-aldq.onrender.com"}, false)
	handler := policy.Handler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodGet, "/ping", nil)
	req.Header.Set("Origin", "http://localhost:8080")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("localhost should not be implied, got %q", got)
	}
}
