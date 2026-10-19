package services

import (
	"context"
	"log"
	"net/http"
	"net/mail"
	"strings"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/contracts"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/mailer"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/caregiver/repository"
	apperrors "github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/errors"
)

type Service struct {
	repo   *repository.Repository
	mailer mailer.Mailer
}

func New(repo *repository.Repository, codeMailer mailer.Mailer) *Service {
	if codeMailer == nil {
		codeMailer = mailer.LogMailer{}
	}
	return &Service{repo: repo, mailer: codeMailer}
}

func (s *Service) Link(ctx context.Context, caregiver *contracts.User, patientEmail string) (*contracts.User, error) {
	if caregiver == nil || caregiver.Role != contracts.RoleCaregiver {
		return nil, apperrors.New("forbidden", http.StatusForbidden)
	}

	email := strings.ToLower(strings.TrimSpace(patientEmail))
	if _, err := mail.ParseAddress(email); err != nil {
		return nil, apperrors.New("invalid_email", http.StatusBadRequest)
	}
	if email == strings.ToLower(strings.TrimSpace(caregiver.Email)) {
		return nil, apperrors.New("invalid_email", http.StatusBadRequest)
	}

	patient, err := s.repo.Link(ctx, caregiver.ID, email)
	if err != nil {
		return nil, err
	}
	if patient == nil {
		return nil, apperrors.New("not_found", http.StatusNotFound)
	}
	if err := s.mailer.SendLinked(ctx, patient.Email, caregiver.DisplayName); err != nil {
		log.Printf("patient link email failed for %s: %v", patient.Email, err)
	}
	return patient, nil
}

func (s *Service) StopMonitoring(ctx context.Context, caregiver *contracts.User, patientID string) (bool, error) {
	if caregiver == nil || caregiver.Role != contracts.RoleCaregiver {
		return false, apperrors.New("forbidden", http.StatusForbidden)
	}

	patientID = strings.TrimSpace(patientID)
	removed, err := s.repo.StopMonitoring(ctx, caregiver.ID, patientID)
	if err != nil {
		return false, err
	}
	if !removed {
		return false, apperrors.New("not_found", http.StatusNotFound)
	}
	return true, nil
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

func (s *Service) ListCaregivers(ctx context.Context, viewer *contracts.User) ([]*contracts.User, error) {
	if viewer == nil {
		return nil, apperrors.New("unauthorized", http.StatusUnauthorized)
	}
	if viewer.Role != contracts.RolePatient {
		return []*contracts.User{}, nil
	}
	return s.repo.ListCaregivers(ctx, viewer.ID)
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
