// Package ui is Codist's interface. The Svelte code in src/ is built into dist/, which is committed and embedded
// here, so the Codist binary carries the interface and people who build Codist need no Node.
package ui

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"
)

//go:embed all:dist
var files embed.FS

// Handler serves the interface. Paths that are not files fall back to index.html, so a reload on any screen
// works. Built files under assets/ have hashed names, so browsers may keep them for good.
func Handler() http.Handler { return serve(files) }

// serve serves the dist folder of fsys, or says how to build it when it is missing.
func serve(fsys fs.FS) http.Handler {
	dist, err := fs.Sub(fsys, "dist")
	if err == nil {
		if _, err = fs.Stat(dist, "index.html"); err == nil {
			static := http.FileServerFS(dist)
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				p := strings.TrimPrefix(r.URL.Path, "/")
				if p != "" {
					if _, err := fs.Stat(dist, p); err == nil {
						if strings.HasPrefix(p, "assets/") {
							w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
						}
						static.ServeHTTP(w, r)
						return
					}
				}
				w.Header().Set("Cache-Control", "no-cache")
				http.ServeFileFS(w, r, dist, "index.html")
			})
		}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "This build has no interface. Run npm run build in codist-ui.", http.StatusNotFound)
	})
}

// Features answers which parts of the interface this version of Codist has, so the pages hide the rest: Review,
// Graph, Incidents, Repository and Activity are there.
func Features(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"menus":{"review":true,"repo":true,"incidents":true,"branches":false,"mine":false,"team":false,` +
		`"release":false,"activity":true,"memory":false},"panels":{"issues":true,"commit":true,"code":true,"ask":false},` +
		`"features":{"explorer":true,"branchGraph":false,"branchSwitcher":true,"fix":true,"reword":false,"localPlan":false},"sources":[]}`))
}
