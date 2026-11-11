package services

import (
	"testing"
	"time"

	activitycontracts "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/activity/contracts"
	glucosecontracts "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/glucose/contracts"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/daykey"
)

func TestHistoryPairsActivityWithTheSameLocalDayAsGlucose(t *testing.T) {
	// 8,083 steps for 8 Nov, recorded at Nairobi midnight (still 7 Nov in UTC).
	activities := []*activitycontracts.ActivityRecord{{
		SourceID:   "hk:2026-11-08",
		RecordedAt: time.Date(2026, 11, 7, 21, 0, 0, 0, time.UTC),
		StepCount:  8083,
	}}
	trends, _ := rollupActivity(activities, daykey.Viewer(0))
	if len(trends) != 1 || trends[0].Date != "2026-11-08" || trends[0].StepCount != 8083 {
		t.Fatalf("activity trends %#v", trends)
	}

	// Daytime glucose is not on the UTC boundary. The old mislabelled 05:30Z
	// and the corrected 02:30Z are both 8 Nov in Nairobi, so they pair with
	// that day's steps rather than the next day's.
	readings := []*glucosecontracts.GlucoseReading{
		{RecordedAt: time.Date(2026, 11, 8, 2, 30, 0, 0, time.UTC), Value: 100},
		{RecordedAt: time.Date(2026, 11, 8, 5, 30, 0, 0, time.UTC), Value: 110},
		{RecordedAt: time.Date(2026, 11, 8, 10, 30, 0, 0, time.UTC), Value: 120},
		{RecordedAt: time.Date(2026, 11, 8, 16, 30, 0, 0, time.UTC), Value: 130},
	}
	glucose, _, count := rollupGlucose(readings, daykey.Viewer(0))
	if count != 4 || len(glucose) != 1 || glucose[0].Date != trends[0].Date {
		t.Fatalf("glucose trends %#v, activity day %s", glucose, trends[0].Date)
	}
}

func TestGlucoseAfterLocalMidnightStaysOnThatDay(t *testing.T) {
	// 00:30 EAT on 8 Nov is 21:30 UTC on 7 Nov. UTC bucketing would file it
	// under 7 Nov, next to the previous day's activity.
	readings := []*glucosecontracts.GlucoseReading{{
		RecordedAt: time.Date(2026, 11, 7, 21, 30, 0, 0, time.UTC),
		Value:      99,
	}}
	trends, _, _ := rollupGlucose(readings, daykey.Viewer(0))
	if len(trends) != 1 || trends[0].Date != "2026-11-08" {
		t.Fatalf("trends %#v", trends)
	}
}
