package graph

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestGraphPages(t *testing.T) {
	router := chi.NewRouter()
	router.Route("/graph", func(r chi.Router) {
		Register(r, nil)
	})

	get := func(url string) *httptest.ResponseRecorder {
		t.Helper()
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, url, nil))
		return rec
	}

	index := get("/graph/")
	if index.Code != http.StatusOK {
		t.Fatalf("default status %d", index.Code)
	}
	defaultHTML := index.Body.String()
	for _, want := range []string{
		"Activity and glucose",
		"Advanced view →",
		"No data yet",
		"Sync from the app to see your analysis.",
		"Each dot is one day's average glucose:",
		"In range 70–180",
		"High over 180",
		"Low under 70",
		"#D8FF3C",
		"#FF4D3A",
		"#FFB020",
		"prefers-reduced-motion",
		"drop-pulse",
		`src="default.js"`,
		"/advanced/",
		"#day=",
	} {
		if !strings.Contains(defaultHTML, want) {
			t.Errorf("default page missing %q", want)
		}
	}
	if strings.Contains(defaultHTML, "__DATA__") {
		t.Fatal("default page must load /graph/data, not inlined JSON")
	}

	bare := get("/graph")
	if bare.Code != http.StatusPermanentRedirect || bare.Header().Get("Location") != "/graph/" {
		t.Fatalf("bare /graph: %d %q", bare.Code, bare.Header().Get("Location"))
	}

	advanced := get("/graph/advanced/")
	if advanced.Code != http.StatusOK {
		t.Fatalf("advanced status %d", advanced.Code)
	}
	advancedHTML := advanced.Body.String()
	for _, want := range []string{
		"Graph Analysis",
		"Advanced view",
		"← Default view",
		`src="cytoscape.min.js"`,
		`src="app.js"`,
		`id="cy"`,
	} {
		if !strings.Contains(advancedHTML, want) {
			t.Errorf("advanced page missing %q", want)
		}
	}

	redirect := get("/graph/advanced?user=abc&email=owner@example.com")
	if redirect.Code != http.StatusPermanentRedirect {
		t.Fatalf("advanced redirect status %d", redirect.Code)
	}
	if loc := redirect.Header().Get("Location"); loc != "/graph/advanced/?user=abc&email=owner@example.com" {
		t.Fatalf("advanced redirect location %q", loc)
	}

	script := get("/graph/default.js")
	if script.Code != http.StatusOK {
		t.Fatalf("default.js status %d", script.Code)
	}
	if ct := script.Header().Get("Content-Type"); !strings.Contains(ct, "javascript") {
		t.Fatalf("default.js content type %q", ct)
	}
	body := script.Body.String()
	for _, want := range []string{
		`from "./analysis.mjs"`,
		"On days you walked more, your glucose was lower",
		"Sedentary Time",
		"prefers-reduced-motion",
		"Steps",
		"Active minutes",
		"Heart rate",
		"Glucose",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("default.js missing %q", want)
		}
	}

	for _, url := range []string{"/graph/analysis.mjs", "/graph/advanced/analysis.mjs"} {
		page := get(url)
		if page.Code != http.StatusOK || !strings.Contains(page.Body.String(), "export function prepare") {
			t.Fatalf("%s did not serve analysis.mjs (%d)", url, page.Code)
		}
	}

	app := get("/graph/advanced/app.js")
	if app.Code != http.StatusOK {
		t.Fatalf("advanced app.js status %d", app.Code)
	}
	appBody := app.Body.String()
	for _, want := range []string{"#variable=", "#day=", "#edge=", "#metric=", "#reading=", "openFromHash"} {
		if !strings.Contains(appBody, want) {
			t.Errorf("advanced app.js missing %q", want)
		}
	}

	cy := get("/graph/advanced/cytoscape.min.js")
	if cy.Code != http.StatusOK || cy.Body.Len() < 1000 {
		t.Fatalf("cytoscape under advanced: %d len %d", cy.Code, cy.Body.Len())
	}

	font := get("/graph/fonts/Outfit-Regular.otf")
	if font.Code != http.StatusOK || font.Header().Get("Content-Type") != "font/otf" {
		t.Fatalf("font status %d type %q", font.Code, font.Header().Get("Content-Type"))
	}
	advancedFont := get("/graph/advanced/fonts/BricolageGrotesque-ExtraBold.otf")
	if advancedFont.Code != http.StatusOK || advancedFont.Body.Len() < 1000 {
		t.Fatalf("advanced font status %d len %d", advancedFont.Code, advancedFont.Body.Len())
	}

	missing := get("/graph/fonts/../default.html")
	if missing.Code != http.StatusNotFound {
		t.Fatalf("path traversal status %d", missing.Code)
	}
}
