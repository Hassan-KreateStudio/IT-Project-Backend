package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/contracts"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/services"
	apphttp "github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/http"

	"github.com/redis/go-redis/v9"
)

const (
	authCacheTTL    = 5 * time.Minute
	authCachePrefix = "auth:"
)

type userContextKey struct{}

type cachedUser struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"displayName"`
	Role        string    `json:"role"`
	CreatedAt   time.Time `json:"createdAt"`
}

func UserFromContext(ctx context.Context) (*contracts.User, bool) {
	user, ok := ctx.Value(userContextKey{}).(*contracts.User)
	return user, ok
}

func WithUser(ctx context.Context, user *contracts.User) context.Context {
	return context.WithValue(ctx, userContextKey{}, user)
}

func OptionalAuth(auth *services.Service, cache *redis.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if header == "" {
				next.ServeHTTP(w, r)
				return
			}

			if !strings.HasPrefix(header, "Bearer ") {
				apphttp.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}

			token := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
			user, cacheStatus, err := resolveBearerUser(r.Context(), auth, cache, token)
			if err != nil {
				apphttp.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}

			w.Header().Set("X-Auth-Cache", cacheStatus)
			next.ServeHTTP(w, r.WithContext(WithUser(r.Context(), user)))
		})
	}
}

func resolveBearerUser(ctx context.Context, auth *services.Service, cache *redis.Client, token string) (*contracts.User, string, error) {
	cacheKey := authCachePrefix + hashToken(token)

	if cache != nil {
		if user, ok := getCachedUser(ctx, cache, cacheKey); ok {
			return user, "hit", nil
		}
	}

	user, err := auth.ParseToken(ctx, token)
	if err != nil {
		return nil, "miss", err
	}

	user = publicUser(user)
	if cache != nil {
		setCachedUser(ctx, cache, cacheKey, user)
	}

	if cache == nil {
		return user, "skip", nil
	}
	return user, "miss", nil
}

func getCachedUser(ctx context.Context, cache *redis.Client, key string) (*contracts.User, bool) {
	raw, err := cache.Get(ctx, key).Bytes()
	if err != nil {
		if err != redis.Nil {
			log.Printf("auth cache get: %v", err)
		}
		return nil, false
	}

	var stored cachedUser
	if err := json.Unmarshal(raw, &stored); err != nil {
		return nil, false
	}
	if stored.ID == "" {
		return nil, false
	}

	return &contracts.User{
		ID:          stored.ID,
		Email:       stored.Email,
		DisplayName: stored.DisplayName,
		Role:        contracts.Role(stored.Role),
		CreatedAt:   stored.CreatedAt,
	}, true
}

func setCachedUser(ctx context.Context, cache *redis.Client, key string, user *contracts.User) {
	payload, err := json.Marshal(cachedUser{
		ID:          user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		Role:        string(user.Role),
		CreatedAt:   user.CreatedAt,
	})
	if err != nil {
		return
	}
	if err := cache.Set(ctx, key, payload, authCacheTTL).Err(); err != nil {
		log.Printf("auth cache set: %v", err)
	}
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func publicUser(user *contracts.User) *contracts.User {
	if user == nil {
		return nil
	}
	cloned := *user
	cloned.PasswordHash = ""
	return &cloned
}
