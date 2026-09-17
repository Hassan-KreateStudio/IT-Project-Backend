package contracts

import "time"

type Intensity string

const (
	IntensityLight    Intensity = "LIGHT"
	IntensityModerate Intensity = "MODERATE"
	IntensityVigorous Intensity = "VIGOROUS"
)

type ActivityRecord struct {
	ID               string
	PatientID        string
	SourceID         string
	RecordedAt       time.Time
	StepCount        int
	HeartRate        *int
	DurationMinutes  int
	Intensity        Intensity
	SedentaryMinutes int
	CreatedAt        time.Time
}

type SyncInput struct {
	SourceID         string
	RecordedAt       time.Time
	StepCount        int
	HeartRate        *int
	DurationMinutes  int
	Intensity        Intensity
	SedentaryMinutes int
}
