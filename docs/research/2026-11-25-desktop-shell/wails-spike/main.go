package main

import (
	"embed"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed dist
var assets embed.FS

func main() {
	started := time.Now()
	root := os.Getenv("PIXELDOLL_SPIKE_ROOT")
	if root == "" {
		log.Fatal("Set PIXELDOLL_SPIKE_ROOT to a test directory")
	}
	handler := application.BundledAssetFileServer(assets)
	app := application.New(application.Options{
		Name: "PixelDoll Wails Spike",
		Windows: application.WindowsOptions{
			WebviewUserDataPath: filepath.Join(root, "profile"),
		},
		Assets: application.AssetOptions{
			DisableLogging: true,
			Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodPost || r.URL.Path != "/__spike/ready" {
					handler.ServeHTTP(w, r)
					return
				}
				var event struct {
					Name    string  `json:"name"`
					PageMs  float64 `json:"pageMs"`
					EpochMs int64   `json:"epochMs"`
					Origin  string  `json:"origin"`
				}
				if err := json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&event); err != nil {
					http.Error(w, "invalid benchmark event", http.StatusBadRequest)
					return
				}
				file, err := os.OpenFile(filepath.Join(root, "events.jsonl"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
				if err != nil {
					http.Error(w, "cannot open benchmark results", http.StatusInternalServerError)
					return
				}
				defer file.Close()
				if err := json.NewEncoder(file).Encode(map[string]any{
					"event": event, "nativeMs": time.Since(started).Milliseconds(),
				}); err != nil {
					http.Error(w, "cannot write benchmark event", http.StatusInternalServerError)
					return
				}
				w.WriteHeader(http.StatusNoContent)
			}),
		},
	})
	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title: "PixelDoll Wails Spike",
		URL:   "/", Width: 1280, Height: 850,
	})
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
