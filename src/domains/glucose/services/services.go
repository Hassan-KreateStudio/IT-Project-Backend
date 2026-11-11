package services

import (
	"context"
	"net/http"
	"time"

	authcontracts "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/contracts"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/glucose/contracts"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/glucose/repository"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/glucose/synthetic"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/daykey"
	apperrors "github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/errors"
)

type Service struct {
	repo *repository.Repository
}

func New(repo *repository.Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) Add(ctx context.Context, patient *authcontracts.User, value float64, recordedAt time.Time) (*contracts.GlucoseReading, error) {
	if patient == nil || patient.Role != authcontracts.RolePatient {
		return nil, apperrors.New("forbidden", http.StatusForbidden)
	}
	if value < 40 || value > 400 {
		return nil, apperrors.New("invalid_glucose", http.StatusBadRequest)
	}
	if recordedAt.IsZero() {
		return nil, apperrors.New("invalid_recorded_at", http.StatusBadRequest)
	}

	reading, err := s.repo.Create(ctx, patient.ID, value, recordedAt)
	if err != nil {
		return nil, err
	}
	if reading == nil {
		return nil, apperrors.New("not_found", http.StatusNotFound)
	}
	return reading, nil
}

func (s *Service) ListInRange(ctx context.Context, patientID string, from, to time.Time) ([]*contracts.GlucoseReading, error) {
	return s.repo.ListInRange(ctx, patientID, from, to)
}

// FillSynthetic gives this patient's activity days a glucose reading if they
// have none. Called after a sync so a backfilled day is never bare.
//
// It deliberately does not inherit the request's cancellation: the client can
// disconnect as soon as the activity records arrive, and the fill would be
// killed half-way. The day's step count chooses the glucose third. DefaultSeed
// only selects which real reading to copy from that third. A day with no step
// count is left empty.
func (s *Service) FillSynthetic(ctx context.Context, patientID string) (int, error) {
	fillCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 2*time.Minute)
	defer cancel()
	return s.repo.FillPatient(fillCtx, patientID, synthetic.DefaultSeed, daykey.Location())
}
