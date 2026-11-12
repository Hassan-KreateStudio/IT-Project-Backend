package graph

import (
	"encoding/json"
	"math"
	"os"
	"testing"
)

func TestSummariseMatchesTheRecordedWindow(t *testing.T) {
	raw, err := os.ReadFile("testdata/days.json")
	if err != nil {
		t.Fatal(err)
	}
	var packed []struct {
		Date    string    `json:"date"`
		Steps   float64   `json:"steps"`
		Glucose []float64 `json:"glucose"`
	}
	if err := json.Unmarshal(raw, &packed); err != nil {
		t.Fatal(err)
	}
	rows := make([]dayFact, 0, len(packed))
	for _, day := range packed {
		steps := day.Steps
		rows = append(rows, dayFact{Date: day.Date, Steps: &steps, Glucose: day.Glucose})
	}
	got := summarise(rows)

	if got.Days != 90 || got.Low.Count != 51 || got.Low.Over180 != 38 {
		t.Fatalf("low band %+v days %d", got.Low, got.Days)
	}
	if got.Middle.Count != 38 || got.Middle.Over180 != 0 {
		t.Fatalf("middle band %+v", got.Middle)
	}
	near(t, got.Low.Average, 193.1)
	near(t, got.Middle.Average, 135.0)
	if got.Streaks.Count != 6 || got.Streaks.Longest != 8 {
		t.Fatalf("streaks %+v", got.Streaks)
	}
	if got.Streaks.LongestStart != "2026-08-14" || got.Streaks.LongestEnd != "2026-08-21" {
		t.Fatalf("longest %s–%s", got.Streaks.LongestStart, got.Streaks.LongestEnd)
	}
	if got.Streaks.LongestWhen != "14–21 August" {
		t.Fatalf("when %q", got.Streaks.LongestWhen)
	}
	if !got.Streaks.AfterAllInRange {
		t.Fatal("expected every day after a streak to be in range")
	}
	near(t, got.Streaks.AfterAverage, 133.7)
	near(t, got.NextFasting.AfterLow, 135.8)
	near(t, got.NextFasting.AfterMiddle, 139.2)
	near(t, got.Correlation.SameDay, -0.78)
	near(t, got.Correlation.NextDayFasting, -0.01)
}

func TestSummariseEmpty(t *testing.T) {
	got := summarise(nil)
	if got.Days != 0 || got.Low.Count != 0 || got.Streaks.Count != 0 {
		t.Fatalf("%+v", got)
	}
}

func near(t *testing.T, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 0.05 && math.Abs(got-want*1) > 0.05 {
		t.Fatalf("got %v want %v", got, want)
	}
	// Correlations are quoted to two decimals.
	if math.Abs(want) < 2 && math.Abs(got-want) > 0.005 {
		t.Fatalf("got %v want %v", got, want)
	}
}
