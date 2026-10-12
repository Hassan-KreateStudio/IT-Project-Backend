package daykey

import (
	"testing"
	"time"
)

func TestFromSourceAndTime_HealthKitLocalDay(t *testing.T) {
	// Nairobi midnight is still 21:00 UTC the day before.
	recordedAt := time.Date(2026, 9, 30, 21, 0, 0, 0, time.UTC)
	got := FromSourceAndTime("hk:2026-10-01", recordedAt)
	if got != "2026-10-01" {
		t.Fatalf("got %q, want local calendar day from sourceId", got)
	}
}

func TestFromSourceAndTime_GlucoseUTCDate(t *testing.T) {
	recordedAt := time.Date(2026, 10, 1, 15, 4, 0, 0, time.UTC)
	got := FromSourceAndTime("", recordedAt)
	if got != "2026-10-01" {
		t.Fatalf("got %q, want UTC date of recordedAt", got)
	}
}
