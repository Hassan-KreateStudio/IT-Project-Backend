package http

import (
	"encoding/json"
	"net/http"
)

type errorPayload struct {
	Error string `json:"error"`
}

func Success(w http.ResponseWriter, status int, data map[string]any) {
	payload := map[string]any{"success": true}
	for key, value := range data {
		payload[key] = value
	}
	writeJSON(w, status, payload)
}

func SuccessOK(w http.ResponseWriter, data map[string]any) {
	Success(w, http.StatusOK, data)
}

func Error(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, errorPayload{Error: code})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
