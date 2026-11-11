// Package synthetic fills activity days that have no glucose reading yet.
//
// Each value is a real ShanghaiT2DM CGM reading copied from the matching
// time-of-day slot. The day's step count picks which third of that slot to
// copy: more steps copy a lower-glucose reading, fewer steps a higher one.
// The link is planted on purpose so a later analysis has a known pattern to
// recover. It is not a fitted curve. The bands, the cut-offs, and the licence
// are in README.md.
package synthetic

import (
	_ "embed"
	"encoding/csv"
	"fmt"
	"math/rand"
	"sort"
	"strconv"
	"strings"
	"time"
)

// DefaultSeed is the seed the sync path uses, and the backfill flag's default.
// It only chooses which row to copy inside the step-count third. The same seed
// and the same step counts copy the same readings.
const DefaultSeed int64 = 42

// MediumStepMin is the smallest step count in the medium band.
// Every smaller count, including 0, is the low band.
const MediumStepMin = 5000

// MediumStepMax is the largest step count in the medium band.
// Every larger count is the high band.
const MediumStepMax = 10000

//go:embed shanghai_t2dm_slots.csv
var slotsCSV string

// slot is one daily check. Hour and Minute are the timestamp written on the
// copied reading: the midpoint of the Shanghai clock hour the value came from.
// terciles holds that slot's readings sorted ascending and split into the low,
// middle, and high glucose thirds.
type slot struct {
	name     string
	hour     int
	minute   int
	values   []float64
	terciles [3][]float64
}

// dailySlots is fasting, after lunch, then after dinner.
var dailySlots []slot

func init() {
	dailySlots = mustLoadSlots(slotsCSV)
}

func mustLoadSlots(raw string) []slot {
	loaded := []slot{
		{name: "fasting", hour: 5, minute: 30},
		{name: "after_lunch", hour: 13, minute: 30},
		{name: "after_dinner", hour: 19, minute: 30},
	}
	index := make(map[string]int, len(loaded))
	for i, item := range loaded {
		index[item.name] = i
	}

	records, err := csv.NewReader(strings.NewReader(raw)).ReadAll()
	if err != nil {
		panic(fmt.Errorf("synthetic slots: %w", err))
	}
	if len(records) < 2 || len(records[0]) != 2 || records[0][0] != "slot" || records[0][1] != "mg_dl" {
		panic("synthetic slots: unexpected header")
	}
	for _, record := range records[1:] {
		if len(record) != 2 {
			panic("synthetic slots: row does not have two columns")
		}
		at, ok := index[record[0]]
		if !ok {
			panic(fmt.Sprintf("synthetic slots: unknown slot %q", record[0]))
		}
		value, err := strconv.ParseFloat(record[1], 64)
		if err != nil {
			panic(fmt.Errorf("synthetic slots: %q: %w", record[1], err))
		}
		loaded[at].values = append(loaded[at].values, value)
	}
	for i, item := range loaded {
		if len(item.values) < 3 {
			panic("synthetic slots: need at least 3 readings in " + item.name)
		}
		loaded[i].terciles = splitTerciles(item.values)
	}
	return loaded
}

// splitTerciles sorts a copy of values and cuts it into three groups by rank.
// The low and middle groups each hold n/3 readings. The high group keeps the
// remainder, which is the last reading when n is not divisible by 3.
func splitTerciles(values []float64) [3][]float64 {
	sorted := append([]float64(nil), values...)
	sort.Float64s(sorted)
	size := len(sorted) / 3
	return [3][]float64{
		append([]float64(nil), sorted[:size]...),
		append([]float64(nil), sorted[size:2*size]...),
		append([]float64(nil), sorted[2*size:]...),
	}
}

// Band names the step-count group for a day.
//
// Low is every count below MediumStepMin. Medium runs from MediumStepMin
// through MediumStepMax, both ends included. High is every count above
// MediumStepMax. 4,999 is low, 5,000 and 10,000 are medium, and 10,001 is high.
func Band(steps int) string {
	switch {
	case steps < MediumStepMin:
		return "low"
	case steps > MediumStepMax:
		return "high"
	default:
		return "medium"
	}
}

// glucoseTercile is the third a band copies from. High steps copy the low
// glucose third, medium steps the middle, low steps the high glucose third.
func glucoseTercile(steps int) int {
	switch Band(steps) {
	case "high":
		return 0
	case "low":
		return 2
	default:
		return 1
	}
}

// DayReading is one copied value at a specific time.
type DayReading struct {
	RecordedAt time.Time
	Value      float64
}

// Day copies one real reading for each slot onto date, in loc.
//
// steps is that day's step count. Nil means the day has no count: Day returns
// no readings and does not draw, so a later day with the same seed is
// unchanged. Zero is a real count and uses the low band.
//
// The count picks the third. rng chooses the row inside it. A fixed seed
// copies the same rows when the step counts stay the same. It does not change
// the values in the table.
func Day(date time.Time, loc *time.Location, steps *int, rng *rand.Rand) []DayReading {
	if steps == nil {
		return nil
	}
	third := glucoseTercile(*steps)
	day := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, loc)
	out := make([]DayReading, 0, len(dailySlots))
	for _, item := range dailySlots {
		pool := item.terciles[third]
		value := pool[rng.Intn(len(pool))]
		out = append(out, DayReading{
			RecordedAt: time.Date(day.Year(), day.Month(), day.Day(), item.hour, item.minute, 0, 0, loc).UTC(),
			Value:      value,
		})
	}
	return out
}
