package graph

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"

	neo4jdb "github.com/Hassan-KreateStudio/IT-Project-Backend/src/platform/neo4j"

	"github.com/go-chi/chi/v5"
)

//go:embed web
var assets embed.FS

// Register serves the graph pages at /graph. / is the simplified default
// view. /advanced/ is the six-stop tour. Pages, scripts, and fonts are
// embedded, so the Docker image stays self-contained.
func Register(r chi.Router, client *neo4jdb.Client) {
	web, err := fs.Sub(assets, "web")
	if err != nil {
		panic(err)
	}

	r.Get("/", func(w http.ResponseWriter, req *http.Request) {
		if !strings.HasSuffix(req.URL.Path, "/") {
			http.Redirect(w, req, slashURL(req), http.StatusPermanentRedirect)
			return
		}
		serveAsset(w, web, "default.html")
	})

	r.Get("/advanced", func(w http.ResponseWriter, req *http.Request) {
		http.Redirect(w, req, slashURL(req), http.StatusPermanentRedirect)
	})
	r.Get("/advanced/", func(w http.ResponseWriter, req *http.Request) {
		serveAsset(w, web, "tour.html")
	})

	r.Get("/data", Data(client))

	r.Get("/default.js", func(w http.ResponseWriter, req *http.Request) {
		serveAsset(w, web, "default.js")
	})
	r.Get("/analysis.mjs", func(w http.ResponseWriter, req *http.Request) {
		serveAsset(w, web, "analysis.mjs")
	})
	r.Get("/tour.js", func(w http.ResponseWriter, req *http.Request) {
		serveAsset(w, web, "tour.js")
	})
	r.Get("/advanced/tour.js", func(w http.ResponseWriter, req *http.Request) {
		serveAsset(w, web, "tour.js")
	})
	r.Get("/sound.mjs", func(w http.ResponseWriter, req *http.Request) {
		serveAsset(w, web, "sound.mjs")
	})
	r.Get("/advanced/sound.mjs", func(w http.ResponseWriter, req *http.Request) {
		serveAsset(w, web, "sound.mjs")
	})
	r.Get("/fonts/*", func(w http.ResponseWriter, req *http.Request) {
		serveFont(w, req, web)
	})
	r.Get("/advanced/fonts/*", func(w http.ResponseWriter, req *http.Request) {
		serveFont(w, req, web)
	})
}

func slashURL(req *http.Request) string {
	target := strings.TrimRight(req.URL.Path, "/") + "/"
	if req.URL.RawQuery != "" {
		target += "?" + req.URL.RawQuery
	}
	return target
}

func serveFont(w http.ResponseWriter, req *http.Request, web fs.FS) {
	name := strings.TrimPrefix(chi.URLParam(req, "*"), "/")
	if name == "" || strings.Contains(name, "..") {
		http.NotFound(w, req)
		return
	}
	serveAsset(w, web, path.Join("fonts", name))
}

func serveAsset(w http.ResponseWriter, files fs.FS, name string) {
	data, err := fs.ReadFile(files, name)
	if err != nil {
		http.NotFound(w, nil)
		return
	}

	switch path.Ext(name) {
	case ".html":
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	case ".js", ".mjs":
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	case ".otf":
		w.Header().Set("Content-Type", "font/otf")
		w.Header().Set("Cache-Control", "public, max-age=86400")
	default:
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	_, _ = w.Write(data)
}
