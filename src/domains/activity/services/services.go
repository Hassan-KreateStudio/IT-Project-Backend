package services

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/activity/contracts"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/activity/repository"
	authcontracts "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/contracts"
	apperrors "github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/errors"
)

type Service struct {
	repo *repository.Repository
}

func New(repo *repository.Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) Sync(ctx context.Context, patient *authcontracts.User, inputs []contracts.SyncInput) ([]*contracts.ActivityRecord, error) {
	if patient == nil || patient.Role != authcontracts.RolePatient {
		return nil, apperrors.New("forbidden", http.StatusForbidden)
	}

	out := make([]*contracts.ActivityRecord, 0, len(inputs))
	for _, input := range inputs {
		if err := validateSync(input); err != nil {
			return nil, err
		}
		record, err := s.repo.Upsert(ctx, patient.ID, input)
		if err != nil {
			return nil, err
		}
		if record == nil {
			return nil, apperrors.New("not_found", http.StatusNotFound)
		}
		out = append(out, record)
	}
	return out, nil
}

func (s *Service) ListInRange(ctx context.Context, patientID string, from, to time.Time) ([]*contracts.ActivityRecord, error) {
	return s.repo.ListInRange(ctx, patientID, from, to)
}

func validateSync(input contracts.SyncInput) error {
	if strings.TrimSpace(input.SourceID) == "" {
		return apperrors.New("invalid_source_id", http.StatusBadRequest)
	}
	if input.RecordedAt.IsZero() {
		return apperrors.New("invalid_recorded_at", http.StatusBadRequest)
	}
	if input.StepCount < 0 || input.DurationMinutes < 0 || input.SedentaryMinutes < 0 {
		return apperrors.New("invalid_activity", http.StatusBadRequest)
	}
	switch input.Intensity {
	case contracts.IntensityLight, contracts.IntensityModerate, contracts.IntensityVigorous:
	default:
		return apperrors.New("invalid_intensity", http.StatusBadRequest)
	}
	if input.HeartRate != nil && *input.HeartRate <= 0 {
		return apperrors.New("invalid_heart_rate", http.StatusBadRequest)
	}
	return nil
}
