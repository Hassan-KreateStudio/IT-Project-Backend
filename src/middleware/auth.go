package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/contracts"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/services"
	apphttp "github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/http"
)

type userContextKey struct{}

func UserFromContext(ctx context.Context) (*contracts.User, bool) {
	user, ok := ctx.Value(userContextKey{}).(*contracts.User)
	return user, ok
}

func WithUser(ctx context.Context, user *contracts.User) context.Context {
	return context.WithValue(ctx, userContextKey{}, user)
}

func OptionalAuth(auth *services.Service) func(http.Handler) http.Handler {
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
			user, err := auth.ParseToken(r.Context(), token)
			if err != nil {
				apphttp.Error(w, http.StatusUnauthorized, "unauthorized")
				return
			}

			next.ServeHTTP(w, r.WithContext(WithUser(r.Context(), user)))
		})
	}
}
