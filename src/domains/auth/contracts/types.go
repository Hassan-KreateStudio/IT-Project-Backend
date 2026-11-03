package contracts

import "time"

type Role string

const (
	RolePatient   Role = "PATIENT"
	RoleCaregiver Role = "CAREGIVER"
)

type User struct {
	ID           string
	Email        string
	DisplayName  string
	Role         Role
	PasswordHash string
	CreatedAt    time.Time
	// RequestedAt is set on caregiverRequests entries: when the ask was made.
	RequestedAt time.Time
	// Since is set on monitoredPatients/caregivers entries: when access began.
	Since time.Time
}
