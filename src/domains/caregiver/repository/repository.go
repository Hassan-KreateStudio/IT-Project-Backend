package repository

import (
	"context"

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

func (r *Repository) Link(ctx context.Context, caregiverID, patientEmail string) (*contracts.User, error) {
	value, err := r.db.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, `
			MATCH (c:User {id: $caregiverId, role: 'CAREGIVER'})
			MATCH (p:User {email: $email, role: 'PATIENT'})
			MERGE (c)-[:MONITORS]->(p)
			RETURN p
		`, map[string]any{
			"caregiverId": caregiverID,
			"email":       patientEmail,
		})
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

func (r *Repository) StopMonitoring(ctx context.Context, caregiverID, patientID string) (bool, error) {
	return r.deleteMonitors(ctx, `
		MATCH (c:User {id: $caregiverId, role: 'CAREGIVER'})-[rel:MONITORS]->(p:User {id: $patientId, role: 'PATIENT'})
		DELETE rel
		RETURN true AS removed
	`, map[string]any{
		"caregiverId": caregiverID,
		"patientId":   patientID,
	})
}

func (r *Repository) deleteMonitors(ctx context.Context, query string, params map[string]any) (bool, error) {
	value, err := r.db.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, query, params)
		if err != nil {
			return false, err
		}
		removed := res.Next(ctx)
		return removed, res.Err()
	})
	if err != nil {
		return false, err
	}
	ok, _ := value.(bool)
	return ok, nil
}

func (r *Repository) CanMonitor(ctx context.Context, caregiverID, patientID string) (bool, error) {
	value, err := r.db.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, `
			MATCH (c:User {id: $caregiverId, role: 'CAREGIVER'})-[:MONITORS]->(p:User {id: $patientId, role: 'PATIENT'})
			RETURN p.id
		`, map[string]any{
			"caregiverId": caregiverID,
			"patientId":   patientID,
		})
		if err != nil {
			return false, err
		}
		return res.Next(ctx), res.Err()
	})
	if err != nil {
		return false, err
	}
	ok, _ := value.(bool)
	return ok, nil
}

func (r *Repository) ListCaregivers(ctx context.Context, patientID string) ([]*contracts.User, error) {
	value, err := r.db.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, `
			MATCH (c:User {role: 'CAREGIVER'})-[:MONITORS]->(p:User {id: $patientId, role: 'PATIENT'})
			RETURN c
			ORDER BY c.displayName
		`, map[string]any{"patientId": patientID})
		if err != nil {
			return nil, err
		}

		users := make([]*contracts.User, 0)
		for res.Next(ctx) {
			node, err := neo4jdb.AsNode(res.Record().Values[0])
			if err != nil {
				return nil, err
			}
			users = append(users, userFromNode(node))
		}
		return users, res.Err()
	})
	if err != nil {
		return nil, err
	}
	users, _ := value.([]*contracts.User)
	if users == nil {
		return []*contracts.User{}, nil
	}
	return users, nil
}

func (r *Repository) ListPatients(ctx context.Context, caregiverID string) ([]*contracts.User, error) {
	value, err := r.db.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, `
			MATCH (c:User {id: $caregiverId, role: 'CAREGIVER'})-[:MONITORS]->(p:User {role: 'PATIENT'})
			RETURN p
			ORDER BY p.displayName
		`, map[string]any{"caregiverId": caregiverID})
		if err != nil {
			return nil, err
		}

		users := make([]*contracts.User, 0)
		for res.Next(ctx) {
			node, err := neo4jdb.AsNode(res.Record().Values[0])
			if err != nil {
				return nil, err
			}
			users = append(users, userFromNode(node))
		}
		return users, res.Err()
	})
	if err != nil {
		return nil, err
	}
	users, _ := value.([]*contracts.User)
	if users == nil {
		return []*contracts.User{}, nil
	}
	return users, nil
}

func userFromNode(node neo4j.Node) *contracts.User {
	return &contracts.User{
		ID:          neo4jdb.NodeString(node, "id"),
		Email:       neo4jdb.NodeString(node, "email"),
		DisplayName: neo4jdb.NodeString(node, "displayName"),
		Role:        contracts.Role(neo4jdb.NodeString(node, "role")),
		CreatedAt:   neo4jdb.NodeTime(node, "createdAt"),
	}
}
