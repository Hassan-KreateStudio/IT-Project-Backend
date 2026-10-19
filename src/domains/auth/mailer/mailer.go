package mailer

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

//go:embed logo.png
var logoPNG []byte

const productName = "Graph Health"

type Mailer interface {
	SendCode(ctx context.Context, to, code string) error
	SendLinked(ctx context.Context, to, patientName string) error
}

type LogMailer struct{}

func (LogMailer) SendCode(_ context.Context, to, _ string) error {
	log.Printf("auth code queued for %s (not emailed; set RESEND_API_KEY to send)", to)
	return nil
}

func (LogMailer) SendLinked(_ context.Context, to, caregiverName string) error {
	log.Printf("patient link email queued for %s (caregiver %q; not emailed; set RESEND_API_KEY to send)", to, caregiverName)
	return nil
}

type ResendMailer struct {
	APIKey string
	From   string
	Client *http.Client
}

func (m ResendMailer) SendCode(ctx context.Context, to, code string) error {
	return m.send(ctx, to, productName+" verification code", plainCodeEmail(code), htmlCodeEmail(code))
}

func (m ResendMailer) SendLinked(ctx context.Context, to, caregiverName string) error {
	return m.send(ctx, to, productName+" — a caregiver added you", plainLinkedEmail(caregiverName), htmlLinkedEmail(caregiverName))
}

func (m ResendMailer) send(ctx context.Context, to, subject, text, htmlBody string) error {
	from := strings.TrimSpace(m.From)
	if from == "" {
		from = "IT Project <onboarding@resend.dev>"
	}

	body, err := json.Marshal(map[string]any{
		"from":    from,
		"to":      []string{to},
		"subject": subject,
		"text":    text,
		"html":    htmlBody,
		"attachments": []map[string]any{
			{
				"filename":     "logo.png",
				"content_type": "image/png",
				"content":      base64.StdEncoding.EncodeToString(logoPNG),
				"content_id":   "logo",
			},
		},
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

func plainCodeEmail(code string) string {
	return strings.Join([]string{
		productName + " verification code",
		"",
		"Your " + productName + " verification code is below.",
		"",
		code,
		"",
		"This code expires in 10 minutes.",
		"",
		"If you did not request this code, you can ignore this email.",
	}, "\n")
}

func htmlCodeEmail(code string) string {
	safe := html.EscapeString(code)
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#ffffff;">
  <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#ffffff;">
    <tr>
      <td style="padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0A0A0A;">
        <img src="cid:logo" width="48" height="48" alt="%[1]s" style="display:block;border:0;border-radius:10px;"/>
        <h1 style="margin:28px 0 12px;font-size:22px;font-weight:700;line-height:1.3;">%[1]s verification code</h1>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#3A3A3A;">Your %[1]s verification code is below.</p>
        <p style="margin:0 0 24px;font-size:36px;font-weight:700;letter-spacing:0.12em;line-height:1.2;">%[2]s</p>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#3A3A3A;">This code expires in 10 minutes.</p>
        <p style="margin:0;font-size:14px;line-height:1.5;color:#6B6B6B;">If you did not request this code, you can ignore this email.</p>
      </td>
    </tr>
  </table>
</body>
</html>`, productName, safe)
}

func linkedCaregiverName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "A caregiver"
	}
	return name
}

func plainLinkedEmail(caregiverName string) string {
	who := linkedCaregiverName(caregiverName)
	return strings.Join([]string{
		productName,
		"",
		who + " added you on " + productName + " so they can see your day.",
		"",
		"You do not need to invite anyone. Sign in as patient with this email if you use the app.",
		"",
		"If you were not expecting this, you can ignore this email.",
	}, "\n")
}

func htmlLinkedEmail(caregiverName string) string {
	who := html.EscapeString(linkedCaregiverName(caregiverName))
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#ffffff;">
  <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#ffffff;">
    <tr>
      <td style="padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0A0A0A;">
        <img src="cid:logo" width="48" height="48" alt="%[1]s" style="display:block;border:0;border-radius:10px;"/>
        <h1 style="margin:28px 0 12px;font-size:22px;font-weight:700;line-height:1.3;">A caregiver added you</h1>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#3A3A3A;">%[2]s added you on %[1]s so they can see your day.</p>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#3A3A3A;">You do not need to invite anyone. Sign in as patient with this email if you use the app.</p>
        <p style="margin:0;font-size:14px;line-height:1.5;color:#6B6B6B;">If you were not expecting this, you can ignore this email.</p>
      </td>
    </tr>
  </table>
</body>
</html>`, productName, who)
}
