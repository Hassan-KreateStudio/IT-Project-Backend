package services

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/contracts"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/mailer"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/repository"
	apperrors "github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/errors"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"github.com/redis/go-redis/v9"
)

const (
	tokenTTL    = 7 * 24 * time.Hour
	otpTTL      = 10 * time.Minute
	maxAttempts = 5
	otpKeyFmt   = "otp:v1:%s"
)

type Service struct {
	repo       *repository.Repository
	rdb        *redis.Client
	jwtSecret  []byte
	mailer     mailer.Mailer
	debugCodes bool
}

func New(repo *repository.Repository, rdb *redis.Client, jwtSecret string, codeMailer mailer.Mailer, debugCodes bool) *Service {
	if codeMailer == nil {
		codeMailer = mailer.LogMailer{}
	}
	return &Service{
		repo:       repo,
		rdb:        rdb,
		jwtSecret:  []byte(jwtSecret),
		mailer:     codeMailer,
		debugCodes: debugCodes,
	}
}

type RequestCodeInput struct {
	Email       string
	Role        contracts.Role
	DisplayName string
}

type CodeResult struct {
	Sent      bool
	DebugCode string
}

type AuthResult struct {
	Token string
	User  *contracts.User
}

type otpRecord struct {
	Hash        string `json:"h"`
	Role        string `json:"r"`
	DisplayName string `json:"n"`
	Attempts    int    `json:"a"`
	NewUser     bool   `json:"u"`
}

type claims struct {
	UserID string `json:"uid"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

func (s *Service) RequestCode(ctx context.Context, input RequestCodeInput) (*CodeResult, error) {
	if s.rdb == nil {
		return nil, apperrors.New("otp_unavailable", http.StatusServiceUnavailable)
	}

	email := strings.ToLower(strings.TrimSpace(input.Email))
	if _, err := mail.ParseAddress(email); err != nil {
		return nil, apperrors.New("invalid_email", http.StatusBadRequest)
	}

	if input.Role != contracts.RolePatient && input.Role != contracts.RoleCaregiver {
		return nil, apperrors.New("invalid_role", http.StatusBadRequest)
	}

	existing, err := s.repo.GetByEmail(ctx, email)
	if err != nil {
		return nil, err
	}

	displayName := strings.TrimSpace(input.DisplayName)
	newUser := existing == nil
	role := input.Role

	if existing != nil {
		if existing.Role != input.Role {
			return nil, apperrors.New("role_conflict", http.StatusConflict)
		}
		displayName = existing.DisplayName
		role = existing.Role
	} else if displayName == "" {
		return nil, apperrors.New("invalid_display_name", http.StatusBadRequest)
	}

	code, err := randomCode()
	if err != nil {
		return nil, err
	}

	record := otpRecord{
		Hash:        s.codeHash(email, code),
		Role:        string(role),
		DisplayName: displayName,
		Attempts:    0,
		NewUser:     newUser,
	}
	raw, err := json.Marshal(record)
	if err != nil {
		return nil, err
	}

	if err := s.rdb.Set(ctx, otpKey(email), raw, otpTTL).Err(); err != nil {
		return nil, err
	}

	if err := s.mailer.SendCode(ctx, email, code); err != nil {
		_ = s.rdb.Del(ctx, otpKey(email)).Err()
		return nil, apperrors.New("email_failed", http.StatusBadGateway)
	}

	result := &CodeResult{Sent: true}
	if s.debugCodes {
		result.DebugCode = code
	}
	return result, nil
}

func (s *Service) VerifyCode(ctx context.Context, email, code string) (*AuthResult, error) {
	if s.rdb == nil {
		return nil, apperrors.New("otp_unavailable", http.StatusServiceUnavailable)
	}

	email = strings.ToLower(strings.TrimSpace(email))
	code = strings.TrimSpace(code)
	if _, err := mail.ParseAddress(email); err != nil {
		return nil, apperrors.New("invalid_email", http.StatusBadRequest)
	}
	if len(code) != 6 {
		return nil, apperrors.New("invalid_code", http.StatusUnauthorized)
	}

	raw, err := s.rdb.Get(ctx, otpKey(email)).Bytes()
	if err == redis.Nil {
		return nil, apperrors.New("invalid_code", http.StatusUnauthorized)
	}
	if err != nil {
		return nil, err
	}

	var record otpRecord
	if err := json.Unmarshal(raw, &record); err != nil {
		return nil, err
	}

	record.Attempts++
	if record.Attempts > maxAttempts {
		_ = s.rdb.Del(ctx, otpKey(email)).Err()
		return nil, apperrors.New("too_many_attempts", http.StatusTooManyRequests)
	}

	want, err := hex.DecodeString(record.Hash)
	if err != nil {
		return nil, apperrors.New("invalid_code", http.StatusUnauthorized)
	}
	got, err := hex.DecodeString(s.codeHash(email, code))
	if err != nil || subtle.ConstantTimeCompare(want, got) != 1 {
		updated, _ := json.Marshal(record)
		_ = s.rdb.Set(ctx, otpKey(email), updated, otpTTL).Err()
		return nil, apperrors.New("invalid_code", http.StatusUnauthorized)
	}

	_ = s.rdb.Del(ctx, otpKey(email)).Err()

	user, err := s.repo.GetByEmail(ctx, email)
	if err != nil {
		return nil, err
	}

	if user == nil {
		if !record.NewUser {
			return nil, apperrors.New("unauthorized", http.StatusUnauthorized)
		}
		user = &contracts.User{
			ID:          uuid.NewString(),
			Email:       email,
			DisplayName: record.DisplayName,
			Role:        contracts.Role(record.Role),
			CreatedAt:   time.Now().UTC(),
		}
		if err := s.repo.Create(ctx, user); err != nil {
			if isConstraintError(err) {
				return nil, apperrors.New("duplicate_email", http.StatusConflict)
			}
			return nil, err
		}
	} else if user.Role != contracts.Role(record.Role) {
		return nil, apperrors.New("role_conflict", http.StatusConflict)
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

func (s *Service) codeHash(email, code string) string {
	mac := hmac.New(sha256.New, s.jwtSecret)
	_, _ = fmt.Fprintf(mac, "%s:%s", email, code)
	return hex.EncodeToString(mac.Sum(nil))
}

func otpKey(email string) string {
	return fmt.Sprintf(otpKeyFmt, email)
}

func randomCode() (string, error) {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	n := binary.BigEndian.Uint64(buf[:]) % 1000000
	return fmt.Sprintf("%06d", n), nil
}

func isConstraintError(err error) bool {
	var neoErr *neo4j.Neo4jError
	if !errors.As(err, &neoErr) {
		return false
	}
	return strings.Contains(neoErr.Code, "ConstraintValidationFailed")
}
