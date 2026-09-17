package services

import (
	"context"
	"net/http"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/contracts"
	authrepo "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/repository"
	apperrors "github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/errors"
)

type Service struct {
	users *authrepo.Repository
}

func New(users *authrepo.Repository) *Service {
	return &Service{users: users}
}

func (s *Service) Get(ctx context.Context, id string) (*contracts.User, error) {
	user, err := s.users.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if user == nil || user.Role != contracts.RolePatient {
		return nil, apperrors.New("not_found", http.StatusNotFound)
	}
	return user, nil
}
