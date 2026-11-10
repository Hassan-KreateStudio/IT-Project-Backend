package synthetic

import (
	"math"
	"math/rand"
	"testing"
	"time"
)

func TestDayIsThreeReadingsAtSlotMidpoints(t *testing.T) {
	loc := time.UTC
	date := time.Date(2026, 8, 6, 15, 0, 0, 0, loc)
	readings := Day(date, loc, rand.New(rand.NewSource(42)))

	if len(readings) != 3 {
		t.Fatalf("got %d readings, want 3", len(readings))
	}
	want := []struct{ hour, minute int }{{5, 30}, {13, 30}, {19, 30}}
	for i, reading := range readings {
		if i > 0 && !reading.RecordedAt.After(readings[i-1].RecordedAt) {
			t.Fatalf("readings out of order: %v then %v", readings[i-1].RecordedAt, reading.RecordedAt)
		}
		if reading.RecordedAt.Hour() != want[i].hour || reading.RecordedAt.Minute() != want[i].minute {
			t.Fatalf("slot %d at %s, want %02d:%02d", i, reading.RecordedAt.Format(time.RFC3339), want[i].hour, want[i].minute)
		}
		if !containsValue(dailySlots[i].values, reading.Value) {
			t.Fatalf("slot %s value %.1f is not in the table", dailySlots[i].name, reading.Value)
		}
	}
}

func TestTimestampUsesTheCallerLocation(t *testing.T) {
	nairobi := time.FixedZone("EAT", 3*60*60)
	date := time.Date(2026, 8, 6, 0, 0, 0, 0, nairobi)
	readings := Day(date, nairobi, rand.New(rand.NewSource(1)))
	// 05:30 in UTC+3 is 02:30 UTC. The calendar day stays 6 August.
	got := readings[0].RecordedAt
	if got.UTC().Hour() != 2 || got.UTC().Minute() != 30 || got.UTC().Day() != 6 {
		t.Fatalf("fasting timestamp = %s, want 2026-08-06T02:30:00Z", got.Format(time.RFC3339))
	}
}

func TestSeedIsReproducible(t *testing.T) {
	loc := time.UTC
	date := time.Date(2026, 8, 6, 0, 0, 0, 0, loc)
	a := Day(date, loc, rand.New(rand.NewSource(7)))
	b := Day(date, loc, rand.New(rand.NewSource(7)))
	for i := range a {
		if a[i].Value != b[i].Value || !a[i].RecordedAt.Equal(b[i].RecordedAt) {
			t.Fatalf("same seed differed at %d: %v vs %v", i, a[i], b[i])
		}
	}
}

func TestDifferentSeedsCanPickDifferentReadings(t *testing.T) {
	loc := time.UTC
	date := time.Date(2026, 8, 6, 0, 0, 0, 0, loc)
	a := Day(date, loc, rand.New(rand.NewSource(1)))
	b := Day(date, loc, rand.New(rand.NewSource(2)))
	same := true
	for i := range a {
		if a[i].Value != b[i].Value {
			same = false
		}
	}
	if same {
		t.Fatal("two seeds copied the same three readings")
	}
}

func TestEveryDrawIsATableValue(t *testing.T) {
	loc := time.UTC
	rng := rand.New(rand.NewSource(11))
	for day := 0; day < 400; day++ {
		date := time.Date(2026, 1, 1, 0, 0, 0, 0, loc).AddDate(0, 0, day)
		readings := Day(date, loc, rng)
		for i, reading := range readings {
			if !containsValue(dailySlots[i].values, reading.Value) {
				t.Fatalf("day %d slot %s: %.4f is not a table value", day, dailySlots[i].name, reading.Value)
			}
		}
	}
}

// Counts and the sum of tenths are the extraction script's output for
// figshare 10.6084/m9.figshare.21600933.v5. A changed table fails here.
func TestTableMatchesExtraction(t *testing.T) {
	want := []struct {
		name      string
		n         int
		sumTenths int
		minTenths int
		maxTenths int
	}{
		{name: "fasting", n: 4737, sumTenths: 5586786, minTenths: 396, maxTenths: 2898},
		{name: "after_lunch", n: 4609, sumTenths: 7076394, minTenths: 396, maxTenths: 4176},
		{name: "after_dinner", n: 4755, sumTenths: 7340472, minTenths: 396, maxTenths: 4680},
	}
	if len(dailySlots) != len(want) {
		t.Fatalf("got %d slots, want %d", len(dailySlots), len(want))
	}
	for i, slot := range dailySlots {
		if slot.name != want[i].name {
			t.Fatalf("slot %d is %s, want %s", i, slot.name, want[i].name)
		}
		if len(slot.values) != want[i].n {
			t.Fatalf("%s has %d readings, want %d", slot.name, len(slot.values), want[i].n)
		}
		sum, minT, maxT := 0, int(math.MaxInt), 0
		for _, value := range slot.values {
			tenth := tenths(value)
			sum += tenth
			if tenth < minT {
				minT = tenth
			}
			if tenth > maxT {
				maxT = tenth
			}
		}
		if sum != want[i].sumTenths || minT != want[i].minTenths || maxT != want[i].maxTenths {
			t.Fatalf("%s tenths sum=%d min=%d max=%d, want sum=%d min=%d max=%d",
				slot.name, sum, minT, maxT, want[i].sumTenths, want[i].minTenths, want[i].maxTenths)
		}
	}
}

func containsValue(values []float64, value float64) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

func tenths(value float64) int {
	return int(math.Round(value * 10))
}
