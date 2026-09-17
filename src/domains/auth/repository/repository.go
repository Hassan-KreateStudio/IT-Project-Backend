package repository

import (
	"context"
	"strings"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/contracts"
	neo4jdb "github.com/Hassan-KreateStudio/IT-Project-Backend/src/platform/neo4j"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type Repository struct {
	db *neo4jdb.Client
}

func New(db *neo4jdb.Client) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(ctx context.Context, user *contracts.User) error {
	_, err := r.db.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		_, err := tx.Run(ctx, `
			CREATE (u:User {
				id: $id,
				email: $email,
				displayName: $displayName,
				role: $role,
				passwordHash: $passwordHash,
				createdAt: $createdAt
			})
			RETURN u
		`, map[string]any{
			"id":           user.ID,
			"email":        user.Email,
			"displayName":  user.DisplayName,
			"role":         string(user.Role),
			"passwordHash": user.PasswordHash,
			"createdAt":    user.CreatedAt.UTC(),
		})
		return nil, err
	})
	return err
}

func (r *Repository) GetByEmail(ctx context.Context, email string) (*contracts.User, error) {
	return r.get(ctx, `MATCH (u:User {email: $email}) RETURN u`, map[string]any{
		"email": strings.ToLower(strings.TrimSpace(email)),
	})
}

func (r *Repository) GetByID(ctx context.Context, id string) (*contracts.User, error) {
	return r.get(ctx, `MATCH (u:User {id: $id}) RETURN u`, map[string]any{"id": id})
}

func (r *Repository) get(ctx context.Context, cypher string, params map[string]any) (*contracts.User, error) {
	value, err := r.db.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, cypher, params)
		if err != nil {
			return nil, err
		}
		if !res.Next(ctx) {
			return nil, res.Err()
		}
		return res.Record().Values[0], res.Err()
	})
	if err != nil || value == nil {
		return nil, err
	}

	node, err := neo4jdb.AsNode(value)
	if err != nil {
		return nil, err
	}
	return userFromNode(node), nil
}

func userFromNode(node neo4j.Node) *contracts.User {
	return &contracts.User{
		ID:           neo4jdb.NodeString(node, "id"),
		Email:        neo4jdb.NodeString(node, "email"),
		DisplayName:  neo4jdb.NodeString(node, "displayName"),
		Role:         contracts.Role(neo4jdb.NodeString(node, "role")),
		PasswordHash: neo4jdb.NodeString(node, "passwordHash"),
		CreatedAt:    neo4jdb.NodeTime(node, "createdAt"),
	}
}
