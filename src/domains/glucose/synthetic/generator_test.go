package synthetic

import (
	"math"
	"math/rand"
	"testing"
	"time"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/glucose/contracts"
)

func TestDayIsThreeReadingsInProfileOrder(t *testing.T) {
	loc := time.UTC
	date := time.Date(2026, 8, 6, 0, 0, 0, 0, loc)
	rng := rand.New(rand.NewSource(42))
	readings := Day(date, loc, rng)

	if len(readings) != 3 {
		t.Fatalf("got %d readings, want 3", len(readings))
	}
	for i := 1; i < len(readings); i++ {
		if !readings[i].RecordedAt.After(readings[i-1].RecordedAt) {
			t.Fatalf("readings out of order: %v then %v", readings[i-1].RecordedAt, readings[i].RecordedAt)
		}
	}
	if readings[0].RecordedAt.Hour() != 7 || readings[1].RecordedAt.Hour() != 13 || readings[2].RecordedAt.Hour() != 20 {
		t.Fatalf("unexpected slot hours: %v %v %v", readings[0].RecordedAt, readings[1].RecordedAt, readings[2].RecordedAt)
	}
}

func TestSeedIsReproducible(t *testing.T) {
	loc := time.UTC
	date := time.Date(2026, 8, 6, 0, 0, 0, 0, loc)
	a := Day(date, loc, rand.New(rand.NewSource(7)))
	b := Day(date, loc, rand.New(rand.NewSource(7)))
	for i := range a {
		if a[i].Value != b[i].Value {
			t.Fatalf("same seed differed at %d: %v vs %v", i, a[i].Value, b[i].Value)
		}
	}
}

func TestValuesStayInTheReportableWindow(t *testing.T) {
	loc := time.UTC
	rng := rand.New(rand.NewSource(1))
	for day := 0; day < 400; day++ {
		date := time.Date(2026, 1, 1, 0, 0, 0, 0, loc).AddDate(0, 0, day)
		for _, reading := range Day(date, loc, rng) {
			if reading.Value < minMgDl || reading.Value > maxMgDl {
				t.Fatalf("%s out of window: %.1f", date.Format("2006-01-02"), reading.Value)
			}
		}
	}
}

func TestFastingRunsBelowPostMeal(t *testing.T) {
	loc := time.UTC
	rng := rand.New(rand.NewSource(3))
	var fasting, lunch, dinner float64
	const days = 500
	for day := 0; day < days; day++ {
		date := time.Date(2026, 1, 1, 0, 0, 0, 0, loc).AddDate(0, 0, day)
		r := Day(date, loc, rng)
		fasting += r[0].Value
		lunch += r[1].Value
		dinner += r[2].Value
	}
	fasting, lunch, dinner = fasting/days, lunch/days, dinner/days
	if !(fasting < dinner && dinner < lunch) {
		t.Fatalf("profile shape wrong: fasting %.1f dinner %.1f lunch %.1f", fasting, dinner, lunch)
	}
	if math.Abs(fasting-124) > 12 {
		t.Fatalf("fasting mean drifted: %.1f", fasting)
	}
}

// The summary and the alert feed are only readable if most readings sit in
// range, so guard the in-range share rather than just the mean.
func TestMostReadingsLandInRange(t *testing.T) {
	loc := time.UTC
	rng := rand.New(rand.NewSource(11))
	total, inRange := 0, 0
	for day := 0; day < 900; day++ {
		date := time.Date(2026, 1, 1, 0, 0, 0, 0, loc).AddDate(0, 0, day)
		for _, reading := range Day(date, loc, rng) {
			total++
			if contracts.GlucoseBand(reading.Value) == "in" {
				inRange++
			}
		}
	}
	share := float64(inRange) / float64(total)
	if share < 0.70 {
		t.Fatalf("only %.0f%% of readings in range, want at least 70%%", share*100)
	}
	t.Logf("in range: %.1f%% of %d readings", share*100, total)
}
