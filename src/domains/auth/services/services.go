package services

import (
	"context"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/contracts"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/repository"
	apperrors "github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/errors"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"golang.org/x/crypto/bcrypt"
)

const tokenTTL = 7 * 24 * time.Hour

type Service struct {
	repo      *repository.Repository
	jwtSecret []byte
}

func New(repo *repository.Repository, jwtSecret string) *Service {
	return &Service{repo: repo, jwtSecret: []byte(jwtSecret)}
}

type RegisterInput struct {
	Email       string
	Password    string
	DisplayName string
	Role        contracts.Role
}

type AuthResult struct {
	Token string
	User  *contracts.User
}

type claims struct {
	UserID string `json:"uid"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

func (s *Service) Register(ctx context.Context, input RegisterInput) (*AuthResult, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	if _, err := mail.ParseAddress(email); err != nil {
		return nil, apperrors.New("invalid_email", http.StatusBadRequest)
	}

	displayName := strings.TrimSpace(input.DisplayName)
	if displayName == "" {
		return nil, apperrors.New("invalid_display_name", http.StatusBadRequest)
	}

	if len(input.Password) < 8 {
		return nil, apperrors.New("invalid_password", http.StatusBadRequest)
	}

	if input.Role != contracts.RolePatient && input.Role != contracts.RoleCaregiver {
		return nil, apperrors.New("invalid_role", http.StatusBadRequest)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	user := &contracts.User{
		ID:           uuid.NewString(),
		Email:        email,
		DisplayName:  displayName,
		Role:         input.Role,
		PasswordHash: string(hash),
		CreatedAt:    time.Now().UTC(),
	}

	if err := s.repo.Create(ctx, user); err != nil {
		if isConstraintError(err) {
			return nil, apperrors.New("duplicate_email", http.StatusConflict)
		}
		return nil, err
	}

	token, err := s.sign(user)
	if err != nil {
		return nil, err
	}

	return &AuthResult{Token: token, User: user}, nil
}

func (s *Service) Login(ctx context.Context, email, password string) (*AuthResult, error) {
	user, err := s.repo.GetByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, apperrors.New("unauthorized", http.StatusUnauthorized)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, apperrors.New("unauthorized", http.StatusUnauthorized)
	}

	token, err := s.sign(user)
	if err != nil {
		return nil, err
	}

	return &AuthResult{Token: token, User: user}, nil
}

func (s *Service) ParseToken(ctx context.Context, tokenString string) (*contracts.User, error) {
	parsed, err := jwt.ParseWithClaims(tokenString, &claims{}, func(token *jwt.Token) (any, error) {
		if token.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, apperrors.New("unauthorized", http.StatusUnauthorized)
		}
		return s.jwtSecret, nil
	})
	if err != nil || !parsed.Valid {
		return nil, apperrors.New("unauthorized", http.StatusUnauthorized)
	}

	c, ok := parsed.Claims.(*claims)
	if !ok || c.UserID == "" {
		return nil, apperrors.New("unauthorized", http.StatusUnauthorized)
	}

	user, err := s.repo.GetByID(ctx, c.UserID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, apperrors.New("unauthorized", http.StatusUnauthorized)
	}
	return user, nil
}

func (s *Service) GetByID(ctx context.Context, id string) (*contracts.User, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *Service) sign(user *contracts.User) (string, error) {
	now := time.Now()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims{
		UserID: user.ID,
		Role:   string(user.Role),
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(tokenTTL)),
		},
	})
	return token.SignedString(s.jwtSecret)
}

func isConstraintError(err error) bool {
	var neoErr *neo4j.Neo4jError
	if !errors.As(err, &neoErr) {
		return false
	}
	return strings.Contains(neoErr.Code, "ConstraintValidationFailed")
}
