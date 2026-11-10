package services

import (
	"strings"
	"testing"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/analysis/contracts"
	glucosecontracts "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/glucose/contracts"
)

func TestAlertsTreat180AsInRange(t *testing.T) {
	inRange := alertsFor(nil, readings(70, 180))
	if code := glucoseCode(inRange); code != "" {
		t.Fatalf("70 and 180 are in range, got %s (%s)", code, messageFor(inRange, code))
	}

	high := alertsFor(nil, readings(180, 181))
	if code := glucoseCode(high); code != "HIGH_GLUCOSE" {
		t.Fatalf("only 181 is high, got %#v", high)
	}
	if !strings.Contains(messageFor(high, "HIGH_GLUCOSE"), "above 180") {
		t.Fatalf("high message %q", messageFor(high, "HIGH_GLUCOSE"))
	}

	low := alertsFor(nil, readings(69, 70))
	if code := glucoseCode(low); code != "LOW_GLUCOSE" {
		t.Fatalf("only 69 is low, got %#v", low)
	}
	if !strings.Contains(messageFor(low, "LOW_GLUCOSE"), "below 70") {
		t.Fatalf("low message %q", messageFor(low, "LOW_GLUCOSE"))
	}
}

func readings(values ...float64) []*glucosecontracts.GlucoseReading {
	out := make([]*glucosecontracts.GlucoseReading, len(values))
	for i, value := range values {
		out[i] = &glucosecontracts.GlucoseReading{Value: value}
	}
	return out
}

func glucoseCode(alerts []contracts.Alert) string {
	for _, alert := range alerts {
		if alert.Code == "HIGH_GLUCOSE" || alert.Code == "LOW_GLUCOSE" {
			return alert.Code
		}
	}
	return ""
}

func messageFor(alerts []contracts.Alert, code string) string {
	for _, alert := range alerts {
		if alert.Code == code {
			return alert.Message
		}
	}
	return ""
}
