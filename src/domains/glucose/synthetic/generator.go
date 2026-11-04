// Package synthetic generates plausible type 2 diabetes glucose readings for
// days that have activity but no reading yet.
//
// The values are drawn from a fixed daily profile, independent of that day's
// step count. That is deliberate: if glucose were derived from activity, any
// correlation between movement and glucose would be an artefact of this
// generator rather than a finding.
//
// Profile follows aggregate type 2 diabetes CGM statistics in the shape of the
// PhysioNet ShanghaiT2DM cohort: fasting in the morning, a post-meal peak after
// lunch, a smaller one after dinner, and a small chance of a hyperglycaemic
// excursion on any given day.
package synthetic

import (
	"math"
	"math/rand"
	"time"
)

// Slot is one reading time in the daily profile.
type Slot struct {
	Hour   int
	Minute int
	// Mean and SD are mg/dL for this slot across the cohort.
	Mean float64
	SD   float64
}

// DailyProfile is the three-reading day a T2DM patient plausibly records.
var DailyProfile = []Slot{
	{Hour: 7, Minute: 30, Mean: 124, SD: 18},  // fasting
	{Hour: 13, Minute: 0, Mean: 168, SD: 30},  // post-lunch peak
	{Hour: 20, Minute: 30, Mean: 148, SD: 26}, // post-dinner
}

const (
	minMgDl = 40.0
	maxMgDl = 400.0
	// excursionChance is the per-day odds of an unusually high day.
	excursionChance = 0.08
	excursionMean   = 205.0
	// dayMeanSpread is how much a whole day drifts for one patient.
	dayMeanSpread = 7.0
)

// DayReading is one generated value at a specific time.
type DayReading struct {
	RecordedAt time.Time
	Value      float64
}

// Day draws a full day of readings for the given date in loc.
//
// The random source is passed in so a seed makes a whole backfill reproducible.
func Day(date time.Time, loc *time.Location, rng *rand.Rand) []DayReading {
	day := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, loc)

	// One patient-level offset for the whole day keeps the three readings
	// correlated with each other, the way a real day behaves.
	dayOffset := rng.NormFloat64() * dayMeanSpread

	// Some days simply run high; that is the excursion, not a per-reading spike.
	if rng.Float64() < excursionChance {
		dayOffset += excursionMean - DailyProfile[1].Mean
	}

	out := make([]DayReading, 0, len(DailyProfile))
	for _, slot := range DailyProfile {
		value := slot.Mean + dayOffset + rng.NormFloat64()*slot.SD
		out = append(out, DayReading{
			RecordedAt: time.Date(day.Year(), day.Month(), day.Day(), slot.Hour, slot.Minute, 0, 0, loc).UTC(),
			Value:      round1(clamp(value)),
		})
	}
	return out
}

func clamp(value float64) float64 {
	return math.Min(math.Max(value, minMgDl), maxMgDl)
}

func round1(value float64) float64 {
	return math.Round(value*10) / 10
}
