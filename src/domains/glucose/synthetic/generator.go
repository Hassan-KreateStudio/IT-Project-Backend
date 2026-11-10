// Package synthetic fills activity days that have no glucose reading yet.
//
// Each value is a real ShanghaiT2DM CGM reading copied from the matching
// time-of-day slot. It is not computed from that day's step count, so a later
// correlation with activity is not something this package constructed.
// The clock windows, the source file, and the licence are in README.md.
package synthetic

import (
	_ "embed"
	"encoding/csv"
	"fmt"
	"math/rand"
	"strconv"
	"strings"
	"time"
)

// DefaultSeed is the seed the sync path uses, and the backfill flag's default.
// It only chooses which table row to copy. The same seed copies the same readings.
const DefaultSeed int64 = 42

//go:embed shanghai_t2dm_slots.csv
var slotsCSV string

// slot is one daily check. Hour and Minute are the timestamp written on the
// copied reading: the midpoint of the Shanghai clock hour the value came from.
type slot struct {
	name   string
	hour   int
	minute int
	values []float64
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
	for _, item := range loaded {
		if len(item.values) == 0 {
			panic("synthetic slots: empty " + item.name)
		}
	}
	return loaded
}

// DayReading is one copied value at a specific time.
type DayReading struct {
	RecordedAt time.Time
	Value      float64
}

// Day copies one real reading for each slot onto date, in loc.
//
// rng chooses the row. A fixed seed makes a backfill reproducible; it does
// not change the values in the table.
func Day(date time.Time, loc *time.Location, rng *rand.Rand) []DayReading {
	day := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, loc)
	out := make([]DayReading, 0, len(dailySlots))
	for _, item := range dailySlots {
		value := item.values[rng.Intn(len(item.values))]
		out = append(out, DayReading{
			RecordedAt: time.Date(day.Year(), day.Month(), day.Day(), item.hour, item.minute, 0, 0, loc).UTC(),
			Value:      value,
		})
	}
	return out
}
