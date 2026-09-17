package contracts

import "time"

type GlucoseReading struct {
	ID         string
	PatientID  string
	Value      float64
	RecordedAt time.Time
	CreatedAt  time.Time
}
