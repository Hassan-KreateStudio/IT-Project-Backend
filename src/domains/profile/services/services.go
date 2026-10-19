package services

import (
	"context"
	"net/http"

	authcontracts "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/contracts"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/profile/contracts"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/profile/repository"
	apperrors "github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/errors"
)

type Service struct {
	repo *repository.Repository
}

func New(repo *repository.Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) Sync(ctx context.Context, patient *authcontracts.User, input contracts.SyncInput) (*contracts.Profile, error) {
	if patient == nil || patient.Role != authcontracts.RolePatient {
		return nil, apperrors.New("forbidden", http.StatusForbidden)
	}
	if err := validate(input); err != nil {
		return nil, err
	}
	if input.BMI == nil && input.HeightCm != nil && input.WeightKg != nil && *input.HeightCm > 0 {
		metres := *input.HeightCm / 100
		bmi := *input.WeightKg / (metres * metres)
		input.BMI = &bmi
	}
	profile, err := s.repo.Upsert(ctx, patient.ID, input)
	if err != nil {
		return nil, err
	}
	if profile == nil {
		return nil, apperrors.New("not_found", http.StatusNotFound)
	}
	return profile, nil
}

func validate(input contracts.SyncInput) error {
	if input.AgeYears != nil && (*input.AgeYears < 1 || *input.AgeYears > 120) {
		return apperrors.New("invalid_profile", http.StatusBadRequest)
	}
	if input.HeightCm != nil && (*input.HeightCm < 50 || *input.HeightCm > 250) {
		return apperrors.New("invalid_profile", http.StatusBadRequest)
	}
	if input.WeightKg != nil && (*input.WeightKg < 20 || *input.WeightKg > 400) {
		return apperrors.New("invalid_profile", http.StatusBadRequest)
	}
	if input.BMI != nil && (*input.BMI < 10 || *input.BMI > 80) {
		return apperrors.New("invalid_profile", http.StatusBadRequest)
	}
	return nil
}
