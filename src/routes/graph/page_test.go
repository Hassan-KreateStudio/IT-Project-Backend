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
		"https://doi.org/10.6084/m9.figshare.20444397",
		"ShanghaiT2DM dataset",
		`class="qr"`,
	} {
		if !strings.Contains(defaultHTML, want) {
			t.Errorf("default page missing %q", want)
		}
	}
	if strings.Contains(defaultHTML, "__DATA__") {
		t.Fatal("default page must load /graph/data, not inlined JSON")
	}
	if strings.Contains(defaultHTML, "/advanced/explore/") || strings.Contains(defaultHTML, "#day=") {
		t.Fatal("default page still links into the removed explore graph")
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
		"← Default view",
		"Each bad day stood alone, and glucose recovered the next day.",
		"Example data, not recorded",
		"Speaker notes",
		"Connected data you can question",
		"Illustration of scale, not real data.",
		`id="gx"`,
		`id="stage-concl"`,
		`src="tour.js"`,
		`id="cy"`,
	} {
		if !strings.Contains(advancedHTML, want) {
			t.Errorf("tour page missing %q", want)
		}
	}
	if strings.Contains(advancedHTML, "Free explore") || strings.Contains(advancedHTML, "/explore/") {
		t.Fatal("tour still offers Free explore")
	}
	tourJS := get("/graph/advanced/tour.js")
	if tourJS.Code != http.StatusOK {
		t.Fatalf("tour.js status %d", tourJS.Code)
	}
	if !strings.Contains(tourJS.Body.String(), `"5":"Back to start"`) || strings.Contains(tourJS.Body.String(), "Free explore") || strings.Contains(tourJS.Body.String(), "/explore/") {
		t.Fatal("tour script still points at Free explore")
	}
	if !strings.Contains(tourJS.Body.String(), `"4":"Next →"`) {
		t.Fatal("add-a-measure stop should advance to the conclusion")
	}

	explore := get("/graph/advanced/explore/")
	if explore.Code != http.StatusNotFound {
		t.Fatalf("explore status %d", explore.Code)
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

	analysis := get("/graph/analysis.mjs")
	if analysis.Code != http.StatusOK || !strings.Contains(analysis.Body.String(), "export function prepare") {
		t.Fatalf("analysis.mjs status %d", analysis.Code)
	}
	if get("/graph/advanced/app.js").Code != http.StatusNotFound {
		t.Fatal("explore app.js is still served")
	}
	if get("/graph/advanced/cytoscape.min.js").Code != http.StatusNotFound {
		t.Fatal("cytoscape is still served")
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
