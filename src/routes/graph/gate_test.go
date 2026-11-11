package graph

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProtectPublicReachesTheHandler(t *testing.T) {
	handler := Protect(ModePublic, func(*http.Request) bool { return false })(okHandler())
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/graph", nil))
	if rec.Code != http.StatusOK || rec.Body.String() != "ok" {
		t.Fatalf("status %d body %q", rec.Code, rec.Body.String())
	}
}

func TestProtectOffHidesTheExplorer(t *testing.T) {
	handler := Protect(ModeOff, func(*http.Request) bool { return true })(okHandler())
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/graph/data", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestProtectAuthRequiresASession(t *testing.T) {
	handler := Protect(ModeAuth, func(*http.Request) bool { return false })(okHandler())
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/graph/data", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status %d body %q", rec.Code, rec.Body.String())
	}

	handler = Protect(ModeAuth, func(*http.Request) bool { return true })(okHandler())
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/graph", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("authorised status %d", rec.Code)
	}
}

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})
}
