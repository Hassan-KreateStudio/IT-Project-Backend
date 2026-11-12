package contracts

import "time"

// Glucose bands shared by alerts, the in-range share, and the graph pages.
// In range is 70–180 mg/dL inclusive. High is strictly above 180. Low is strictly below 70.
const (
	GlucoseLowMgDl  = 70.0
	GlucoseHighMgDl = 180.0
)

// GlucoseBand classifies one reading. Exactly 70 and exactly 180 are in range.
func GlucoseBand(value float64) string {
	switch {
	case value < GlucoseLowMgDl:
		return "low"
	case value > GlucoseHighMgDl:
		return "high"
	default:
		return "in"
	}
}

type GlucoseReading struct {
	ID         string
	PatientID  string
	Value      float64
	RecordedAt time.Time
	CreatedAt  time.Time
}
