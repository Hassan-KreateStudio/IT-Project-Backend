package contracts

import "time"

type Profile struct {
	PatientID string
	AgeYears  *int
	HeightCm  *float64
	WeightKg  *float64
	BMI       *float64
	UpdatedAt time.Time
}

type SyncInput struct {
	AgeYears *int
	HeightCm *float64
	WeightKg *float64
	BMI      *float64
}
