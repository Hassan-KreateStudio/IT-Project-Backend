package daykey

import (
	"strings"
	"time"
)

// patientLocation is Africa/Nairobi. Kenya is UTC+3 all year; there is no
// daylight-saving transition to look up. A fixed zone is used on purpose:
// the API image is Alpine without tzdata, and time.LoadLocation falls back
// to UTC there. That stored 05:30 wall time as 05:30Z, which a Nairobi
// phone then shows as 08:30.
var patientLocation = time.FixedZone("Africa/Nairobi", 3*60*60)

// Location is the patient's civil timezone.
func Location() *time.Location {
	return patientLocation
}

// Viewer is the zone used to label a dashboard day.
// Offset 0 (the argument omitted, or sent as 0) is the patient zone, not
// UTC. Local midnight in Nairobi is 21:00 the previous day in UTC, so UTC
// labels put that day's activity on the previous date while daytime glucose
// stays put.
func Viewer(offsetMinutes int) *time.Location {
	if offsetMinutes == 0 {
		return patientLocation
	}
	return time.FixedZone("local", offsetMinutes*60)
}

// Day is the patient-local calendar day of an instant, YYYY-MM-DD.
func Day(recordedAt time.Time) string {
	return recordedAt.In(patientLocation).Format("2006-01-02")
}

// Of is the calendar day for one sample.
// An hk:yyyy-MM-dd sourceId is the phone's local day and wins over the
// instant: a HealthKit day starts at local midnight, whose UTC instant is
// still the previous date. loc is used only when the sourceId has no day;
// a nil loc means the patient zone.
func Of(sourceID string, recordedAt time.Time, loc *time.Location) string {
	if day, ok := hkDay(sourceID); ok {
		return day
	}
	if loc == nil {
		loc = patientLocation
	}
	return recordedAt.In(loc).Format("2006-01-02")
}

// FromSourceAndTime is the Day hub key. Activity uses the phone's local
// day. Glucose has no sourceId, so it uses the patient-local date of
// recordedAt — the same calendar the phone used for hk:yyyy-MM-dd.
func FromSourceAndTime(sourceID string, recordedAt time.Time) string {
	return Of(sourceID, recordedAt, nil)
}

// Span is the inclusive patient-local dates covering the half-open instant
// window [from, to). A `to` that lands on local midnight belongs to the
// next day and is not included.
func Span(from, to time.Time) (start, end string) {
	start = Day(from)
	if !to.After(from) {
		return start, start
	}
	end = Day(to.Add(-time.Nanosecond))
	if end < start {
		end = start
	}
	return start, end
}

func hkDay(sourceID string) (string, bool) {
	const prefix = "hk:"
	if !strings.HasPrefix(sourceID, prefix) {
		return "", false
	}
	day := sourceID[len(prefix):]
	if len(day) < 10 {
		return "", false
	}
	day = day[:10]
	if _, err := time.Parse("2006-01-02", day); err != nil {
		return "", false
	}
	return day, true
}
