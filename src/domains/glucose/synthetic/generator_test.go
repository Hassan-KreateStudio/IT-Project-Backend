package synthetic

import (
	"math"
	"math/rand"
	"sort"
	"testing"
	"time"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/daykey"
)

func TestDayIsThreeReadingsAtSlotMidpoints(t *testing.T) {
	loc := time.UTC
	date := time.Date(2026, 8, 6, 15, 0, 0, 0, loc)
	readings := Day(date, loc, steps(7500), rand.New(rand.NewSource(42)))

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

func TestPatientZoneWallClockIsNotStoredAsUTC(t *testing.T) {
	nairobi := daykey.Location()
	date := time.Date(2026, 11, 8, 0, 0, 0, 0, nairobi)
	readings := Day(date, nairobi, steps(7500), rand.New(rand.NewSource(1)))
	// Migration 006 looks for these UTC seconds-of-day and moves them back
	// three hours. A correct write must not land on them.
	mislabelled := []int{5*3600 + 30*60, 13*3600 + 30*60, 19*3600 + 30*60}
	wall := []int{5, 13, 19}
	for i, reading := range readings {
		utc := reading.RecordedAt.UTC()
		second := utc.Hour()*3600 + utc.Minute()*60 + utc.Second()
		if second != mislabelled[i]-3*3600 {
			t.Fatalf("slot %d stored at %s (%d), want UTC second-of-day %d", i, utc.Format(time.RFC3339), second, mislabelled[i]-3*3600)
		}
		local := reading.RecordedAt.In(nairobi)
		if local.Hour() != wall[i] || local.Minute() != 30 || local.Day() != 8 {
			t.Fatalf("slot %d displays as %s, want %02d:30 on 8 Nov", i, local.Format(time.RFC3339), wall[i])
		}
	}

	// The failure mode: passing UTC stores the wall clock as if it were UTC.
	labelled := Day(date, time.UTC, steps(7500), rand.New(rand.NewSource(1)))
	for i, reading := range labelled {
		utc := reading.RecordedAt.UTC()
		second := utc.Hour()*3600 + utc.Minute()*60 + utc.Second()
		if second != mislabelled[i] {
			t.Fatalf("UTC location slot %d at second %d, want %d", i, second, mislabelled[i])
		}
	}
}

func TestTimestampUsesTheCallerLocation(t *testing.T) {
	nairobi := time.FixedZone("EAT", 3*60*60)
	date := time.Date(2026, 8, 6, 0, 0, 0, 0, nairobi)
	readings := Day(date, nairobi, steps(7500), rand.New(rand.NewSource(1)))
	// 05:30 in UTC+3 is 02:30 UTC. The calendar day stays 6 August.
	got := readings[0].RecordedAt
	if got.UTC().Hour() != 2 || got.UTC().Minute() != 30 || got.UTC().Day() != 6 {
		t.Fatalf("fasting timestamp = %s, want 2026-08-06T02:30:00Z", got.Format(time.RFC3339))
	}
}

func TestSeedIsReproducible(t *testing.T) {
	loc := time.UTC
	date := time.Date(2026, 8, 6, 0, 0, 0, 0, loc)
	for _, seed := range []int64{7, DefaultSeed} {
		a := Day(date, loc, steps(8083), rand.New(rand.NewSource(seed)))
		b := Day(date, loc, steps(8083), rand.New(rand.NewSource(seed)))
		if len(a) != 3 || len(b) != 3 {
			t.Fatalf("seed %d: got %d and %d readings", seed, len(a), len(b))
		}
		for i := range a {
			if a[i].Value != b[i].Value || !a[i].RecordedAt.Equal(b[i].RecordedAt) {
				t.Fatalf("seed %d differed at %d: %v vs %v", seed, i, a[i], b[i])
			}
		}
	}
}

func TestSameBandAndSeedCopyTheSameRows(t *testing.T) {
	loc := time.UTC
	date := time.Date(2026, 8, 6, 0, 0, 0, 0, loc)
	pairs := [][2]int{{0, 4999}, {5000, 10000}, {10001, 18000}}
	for _, pair := range pairs {
		a := Day(date, loc, steps(pair[0]), rand.New(rand.NewSource(DefaultSeed)))
		b := Day(date, loc, steps(pair[1]), rand.New(rand.NewSource(DefaultSeed)))
		for i := range a {
			if a[i].Value != b[i].Value {
				t.Fatalf("steps %d and %d differed at slot %d: %.1f vs %.1f", pair[0], pair[1], i, a[i].Value, b[i].Value)
			}
		}
	}
}

func TestMissingStepsDrawsNothingAndDoesNotAdvanceTheSeed(t *testing.T) {
	loc := time.UTC
	date := time.Date(2026, 8, 6, 0, 0, 0, 0, loc)
	withGap := rand.New(rand.NewSource(DefaultSeed))
	if got := Day(date, loc, nil, withGap); len(got) != 0 {
		t.Fatalf("missing steps produced %d readings", len(got))
	}
	after := Day(date, loc, steps(8000), withGap)
	direct := Day(date, loc, steps(8000), rand.New(rand.NewSource(DefaultSeed)))
	for i := range direct {
		if after[i].Value != direct[i].Value || !after[i].RecordedAt.Equal(direct[i].RecordedAt) {
			t.Fatalf("a skipped day moved the seed at %d: %v vs %v", i, after[i], direct[i])
		}
	}
}

func TestDifferentSeedsCanPickDifferentReadings(t *testing.T) {
	loc := time.UTC
	date := time.Date(2026, 8, 6, 0, 0, 0, 0, loc)
	a := Day(date, loc, steps(7500), rand.New(rand.NewSource(1)))
	b := Day(date, loc, steps(7500), rand.New(rand.NewSource(2)))
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
	counts := []int{2000, 7500, 12000}
	for day := 0; day < 400; day++ {
		count := counts[day%len(counts)]
		date := time.Date(2026, 1, 1, 0, 0, 0, 0, loc).AddDate(0, 0, day)
		readings := Day(date, loc, steps(count), rng)
		third := expectedTercile(count)
		for i, reading := range readings {
			if !containsValue(dailySlots[i].terciles[third], reading.Value) {
				t.Fatalf("day %d steps %d slot %s: %.4f is outside tercile %d", day, count, dailySlots[i].name, reading.Value, third)
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

func TestBandBoundaries(t *testing.T) {
	cases := []struct {
		steps int
		want  string
	}{
		{steps: -1, want: "low"},
		{steps: 0, want: "low"},
		{steps: 1, want: "low"},
		{steps: 4999, want: "low"},
		{steps: MediumStepMin, want: "medium"},
		{steps: 7500, want: "medium"},
		{steps: MediumStepMax, want: "medium"},
		{steps: 10001, want: "high"},
		{steps: 20000, want: "high"},
	}
	for _, tc := range cases {
		if got := Band(tc.steps); got != tc.want {
			t.Errorf("Band(%d) = %s, want %s", tc.steps, got, tc.want)
		}
	}
}

func TestEachBandDrawsOnlyFromItsTercile(t *testing.T) {
	loc := time.UTC
	date := time.Date(2026, 8, 6, 0, 0, 0, 0, loc)
	// High steps copy the low glucose third (index 0). Low steps copy the high
	// glucose third (index 2). The ends of each band are included.
	cases := []struct {
		steps int
		third int
	}{
		{steps: 0, third: 2},
		{steps: 4999, third: 2},
		{steps: 5000, third: 1},
		{steps: 10000, third: 1},
		{steps: 10001, third: 0},
		{steps: 15000, third: 0},
	}
	for _, tc := range cases {
		rng := rand.New(rand.NewSource(DefaultSeed))
		inside := make([]bool, len(dailySlots))
		for draw := 0; draw < 80; draw++ {
			readings := Day(date, loc, steps(tc.steps), rng)
			if len(readings) != len(dailySlots) {
				t.Fatalf("steps %d: got %d readings", tc.steps, len(readings))
			}
			for i, reading := range readings {
				pool := dailySlots[i].terciles[tc.third]
				if !containsValue(pool, reading.Value) {
					t.Fatalf("steps %d slot %s value %.1f is outside its tercile", tc.steps, dailySlots[i].name, reading.Value)
				}
				// A value strictly inside the third cannot belong to a neighbour,
				// because the thirds meet only on the shared cut value.
				if reading.Value > pool[0] && reading.Value < pool[len(pool)-1] {
					inside[i] = true
				}
			}
		}
		for i, ok := range inside {
			if !ok {
				t.Fatalf("steps %d slot %s never drew a value strictly inside its tercile", tc.steps, dailySlots[i].name)
			}
		}
	}
}

func TestTercilesPartitionTheSortedReadings(t *testing.T) {
	want := []struct {
		name              string
		lowMax, midMax    int
		lowN, midN, highN int
	}{
		{name: "fasting", lowMax: 1008, midMax: 1278, lowN: 1579, midN: 1579, highN: 1579},
		{name: "after_lunch", lowMax: 1242, midMax: 1674, lowN: 1536, midN: 1536, highN: 1537},
		{name: "after_dinner", lowMax: 1260, midMax: 1710, lowN: 1585, midN: 1585, highN: 1585},
	}
	if len(dailySlots) != len(want) {
		t.Fatalf("got %d slots, want %d", len(dailySlots), len(want))
	}
	for i, slot := range dailySlots {
		sorted := append([]float64(nil), slot.values...)
		sort.Float64s(sorted)
		n := len(sorted)
		size := n / 3
		gotN := [3]int{len(slot.terciles[0]), len(slot.terciles[1]), len(slot.terciles[2])}
		if gotN != [3]int{size, size, n - 2*size} {
			t.Fatalf("%s sizes %v, want %d %d %d", slot.name, gotN, size, size, n-2*size)
		}
		if gotN != [3]int{want[i].lowN, want[i].midN, want[i].highN} {
			t.Fatalf("%s sizes %v, want %d %d %d", slot.name, gotN, want[i].lowN, want[i].midN, want[i].highN)
		}
		joined := append(append(append([]float64{}, slot.terciles[0]...), slot.terciles[1]...), slot.terciles[2]...)
		for at := range sorted {
			if joined[at] != sorted[at] {
				t.Fatalf("%s rank %d is %.1f, sorted table is %.1f", slot.name, at, joined[at], sorted[at])
			}
		}
		lowMax := slot.terciles[0][len(slot.terciles[0])-1]
		midMin := slot.terciles[1][0]
		midMax := slot.terciles[1][len(slot.terciles[1])-1]
		highMin := slot.terciles[2][0]
		if lowMax != midMin || midMax != highMin {
			t.Fatalf("%s cuts %.1f/%.1f and %.1f/%.1f, the groups do not meet on a shared value", slot.name, lowMax, midMin, midMax, highMin)
		}
		if tenths(lowMax) != want[i].lowMax || tenths(midMax) != want[i].midMax {
			t.Fatalf("%s cuts %.1f and %.1f, want %d and %d tenths", slot.name, lowMax, midMax, want[i].lowMax, want[i].midMax)
		}
		if slot.name != want[i].name {
			t.Fatalf("slot %d is %s, want %s", i, slot.name, want[i].name)
		}
	}
}

func steps(n int) *int {
	return &n
}

// expectedTercile is the glucose third for a step count, written out here
// rather than calling glucoseTercile, so a swapped mapping fails this test.
func expectedTercile(count int) int {
	switch {
	case count > MediumStepMax:
		return 0
	case count < MediumStepMin:
		return 2
	default:
		return 1
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
