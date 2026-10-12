package daykey

import (
	"strings"
	"time"
)

// FromSourceAndTime is the calendar day hub key.
// Activity sourceIds from the phone are hk:yyyy-MM-dd (local day).
// Glucose has no sourceId; we use the UTC date of recordedAt.
func FromSourceAndTime(sourceID string, recordedAt time.Time) string {
	const prefix = "hk:"
	if strings.HasPrefix(sourceID, prefix) {
		day := sourceID[len(prefix):]
		if len(day) >= 10 {
			day = day[:10]
			if _, err := time.Parse("2006-01-02", day); err == nil {
				return day
			}
		}
	}
	return recordedAt.UTC().Format("2006-01-02")
}
