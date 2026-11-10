package graph

import (
	"errors"
	"net/http"
	"strings"
)

var (
	errPatientNotFound  = errors.New("patient not found")
	errMultiplePatients = errors.New("multiple patients; pass user as an id or email")
)

// patientRef is one PATIENT row used to choose the graph scope.
// Email stays on the server; the public payload never includes it.
type patientRef struct {
	ID    string
	Email string
	Days  int
}

// userKey reads the scope from the query string. `user` accepts either an id
// or an email. The other names are aliases so a bookmarked link still works.
func userKey(r *http.Request) string {
	query := r.URL.Query()
	for _, name := range []string{"user", "userId", "id", "email"} {
		if value := strings.TrimSpace(query.Get(name)); value != "" {
			return value
		}
	}
	return ""
}

// selectPatient picks one patient for /graph/data.
// An explicit key must match one id or email. With no key, the only patient
// is used, or the only patient who actually has days.
func selectPatient(patients []patientRef, key string) (string, error) {
	key = strings.TrimSpace(key)
	if key != "" {
		var match string
		for _, patient := range patients {
			if patient.ID == key || (patient.Email != "" && strings.EqualFold(patient.Email, key)) {
				if match != "" && match != patient.ID {
					return "", errMultiplePatients
				}
				match = patient.ID
			}
		}
		if match == "" {
			return "", errPatientNotFound
		}
		return match, nil
	}

	switch len(patients) {
	case 0:
		return "", nil
	case 1:
		return patients[0].ID, nil
	}

	chosen := ""
	for _, patient := range patients {
		if patient.Days <= 0 {
			continue
		}
		if chosen != "" {
			return "", errMultiplePatients
		}
		chosen = patient.ID
	}
	if chosen == "" {
		return "", errMultiplePatients
	}
	return chosen, nil
}
