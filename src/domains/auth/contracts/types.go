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
}
