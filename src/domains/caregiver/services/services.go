package services

import (
	"context"
	"net/http"
	"net/mail"
	"strings"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/contracts"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/caregiver/repository"
	apperrors "github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/errors"
)

type Service struct {
	repo *repository.Repository
}

func New(repo *repository.Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) Link(ctx context.Context, patient *contracts.User, caregiverEmail string) (*contracts.User, error) {
	if patient == nil || patient.Role != contracts.RolePatient {
		return nil, apperrors.New("forbidden", http.StatusForbidden)
	}

	email := strings.ToLower(strings.TrimSpace(caregiverEmail))
	if _, err := mail.ParseAddress(email); err != nil {
		return nil, apperrors.New("invalid_email", http.StatusBadRequest)
	}

	caregiver, err := s.repo.Link(ctx, patient.ID, email)
	if err != nil {
		return nil, err
	}
	if caregiver == nil {
		return nil, apperrors.New("not_found", http.StatusNotFound)
	}
	return caregiver, nil
}

func (s *Service) ListPatients(ctx context.Context, viewer *contracts.User) ([]*contracts.User, error) {
	if viewer == nil {
		return nil, apperrors.New("unauthorized", http.StatusUnauthorized)
	}
	if viewer.Role != contracts.RoleCaregiver {
		return []*contracts.User{}, nil
	}
	return s.repo.ListPatients(ctx, viewer.ID)
}

func (s *Service) AssertCanView(ctx context.Context, viewer *contracts.User, patientID string) error {
	if viewer == nil {
		return apperrors.New("unauthorized", http.StatusUnauthorized)
	}
	if viewer.Role == contracts.RolePatient && viewer.ID == patientID {
		return nil
	}
	if viewer.Role != contracts.RoleCaregiver {
		return apperrors.New("forbidden", http.StatusForbidden)
	}

	ok, err := s.repo.CanMonitor(ctx, viewer.ID, patientID)
	if err != nil {
		return err
	}
	if !ok {
		return apperrors.New("forbidden", http.StatusForbidden)
	}
	return nil
}
