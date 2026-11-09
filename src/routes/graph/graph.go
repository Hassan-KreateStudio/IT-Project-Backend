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

// Register serves the graph explorer at /graph. The page and its fonts are
// embedded in the binary, so the Docker image stays self-contained.
func Register(r chi.Router, client *neo4jdb.Client) {
	web, err := fs.Sub(assets, "web")
	if err != nil {
		panic(err)
	}

	r.Get("/", func(w http.ResponseWriter, req *http.Request) {
		serveAsset(w, web, "graph.html")
	})

	r.Get("/data", Data(client))

	r.Get("/cytoscape.min.js", func(w http.ResponseWriter, req *http.Request) {
		serveAsset(w, web, "cytoscape.min.js")
	})

	r.Get("/app.js", func(w http.ResponseWriter, req *http.Request) {
		serveAsset(w, web, "app.js")
	})

	r.Get("/fonts/*", func(w http.ResponseWriter, req *http.Request) {
		// chi keeps the full URL path; the wildcard is the reliable name.
		name := strings.TrimPrefix(chi.URLParam(req, "*"), "/")
		if name == "" || strings.Contains(name, "..") {
			http.NotFound(w, req)
			return
		}
		serveAsset(w, web, path.Join("fonts", name))
	})
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
	case ".js":
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	case ".otf":
		w.Header().Set("Content-Type", "font/otf")
		w.Header().Set("Cache-Control", "public, max-age=86400")
	default:
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	_, _ = w.Write(data)
}
