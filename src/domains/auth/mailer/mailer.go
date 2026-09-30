package mailer

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

type Mailer interface {
	SendCode(ctx context.Context, to, code string) error
}

type LogMailer struct{}

func (LogMailer) SendCode(_ context.Context, to, _ string) error {
	log.Printf("auth code queued for %s (not emailed; set RESEND_API_KEY to send)", to)
	return nil
}

type ResendMailer struct {
	APIKey string
	From   string
	Client *http.Client
}

func (m ResendMailer) SendCode(ctx context.Context, to, code string) error {
	from := strings.TrimSpace(m.From)
	if from == "" {
		from = "IT Project <onboarding@resend.dev>"
	}

	body, err := json.Marshal(map[string]any{
		"from":    from,
		"to":      []string{to},
		"subject": "Your sign-in code",
		"text":    fmt.Sprintf("Your code is %s. It expires in 10 minutes.", code),
	})
	if err != nil {
		return err
	}

	client := m.Client
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+m.APIKey)
	req.Header.Set("Content-Type", "application/json")

	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("resend %d: %s", res.StatusCode, strings.TrimSpace(string(raw)))
	}
	return nil
}
