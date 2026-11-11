package daykey

import (
	"testing"
	"time"
)

func TestLocationIsNairobiAllYear(t *testing.T) {
	for _, month := range []time.Month{time.January, time.July} {
		_, offset := time.Date(2026, month, 15, 12, 0, 0, 0, Location()).Zone()
		if offset != 3*60*60 {
			t.Fatalf("%s offset = %d, want +3h without a zoneinfo lookup", month, offset)
		}
	}
}

func TestViewerZeroIsPatientZoneNotUTC(t *testing.T) {
	loc := Viewer(0)
	instant := time.Date(2026, 11, 7, 21, 0, 0, 0, time.UTC) // 8 Nov 00:00 Nairobi
	if got := instant.In(loc).Format("2006-01-02"); got != "2026-11-08" {
		t.Fatalf("omitted offset labelled %s, want 2026-11-08", got)
	}
	if instant.In(time.UTC).Format("2006-01-02") != "2026-11-07" {
		t.Fatal("fixture should be the previous UTC date")
	}
}

func TestFromSourceAndTime_HealthKitLocalDay(t *testing.T) {
	// Nairobi midnight is still 21:00 UTC the day before.
	recordedAt := time.Date(2026, 9, 30, 21, 0, 0, 0, time.UTC)
	got := FromSourceAndTime("hk:2026-10-01", recordedAt)
	if got != "2026-10-01" {
		t.Fatalf("got %q, want local calendar day from sourceId", got)
	}
}

func TestFromSourceAndTime_GlucoseUsesNairobiDay(t *testing.T) {
	// 00:30 East Africa Time on 8 Nov is 21:30 UTC on 7 Nov.
	recordedAt := time.Date(2026, 11, 7, 21, 30, 0, 0, time.UTC)
	got := FromSourceAndTime("", recordedAt)
	if got != "2026-11-08" {
		t.Fatalf("got %q, want patient-local day 2026-11-08", got)
	}
}

func TestActivityAndGlucoseShareTheLocalDay(t *testing.T) {
	// 8 Nov steps are stored at local midnight. Daytime glucose, whether the
	// instant is real 05:30 EAT (02:30Z) or the old mislabelled 05:30Z, is
	// the same patient-local date.
	activityAt := time.Date(2026, 11, 7, 21, 0, 0, 0, time.UTC)
	activityDay := FromSourceAndTime("hk:2026-11-08", activityAt)
	for _, glucoseAt := range []time.Time{
		time.Date(2026, 11, 8, 2, 30, 0, 0, time.UTC),
		time.Date(2026, 11, 8, 5, 30, 0, 0, time.UTC),
	} {
		glucoseDay := FromSourceAndTime("", glucoseAt)
		if activityDay != "2026-11-08" || glucoseDay != activityDay {
			t.Fatalf("activity %s glucose %s at %s", activityDay, glucoseDay, glucoseAt.Format(time.RFC3339))
		}
	}
}

func TestOfHonoursExplicitViewerZoneWhenSourceHasNoDay(t *testing.T) {
	// 04:30Z is 23:30 the previous day in UTC-5.
	recordedAt := time.Date(2026, 11, 8, 4, 30, 0, 0, time.UTC)
	loc := Viewer(-300)
	if got := Of("hk-not-a-day", recordedAt, loc); got != "2026-11-07" {
		t.Fatalf("viewer day %s", got)
	}
	if got := Of("hk:2026-11-08", recordedAt, loc); got != "2026-11-08" {
		t.Fatalf("phone day %s, want the hk: day even when the viewer zone differs", got)
	}
}

func TestSpanIsHalfOpenInPatientZone(t *testing.T) {
	from := time.Date(2026, 11, 7, 21, 0, 0, 0, time.UTC) // 8 Nov 00:00 Nairobi
	to := time.Date(2026, 11, 8, 21, 0, 0, 0, time.UTC)   // 9 Nov 00:00 Nairobi
	start, end := Span(from, to)
	if start != "2026-11-08" || end != "2026-11-08" {
		t.Fatalf("span %s..%s, want 2026-11-08 only", start, end)
	}
}
