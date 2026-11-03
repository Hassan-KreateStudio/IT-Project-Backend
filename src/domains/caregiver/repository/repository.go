package repository

import (
	"context"
	"time"

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

// Request creates (or refreshes) a REQUESTS edge. Default deny: until the
// patient answers, no read path can see the patient's data.
func (r *Repository) Request(ctx context.Context, caregiverID, patientEmail string) (*contracts.User, error) {
	value, err := r.db.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, `
			MATCH (c:User {id: $caregiverId, role: 'CAREGIVER'})
			MATCH (p:User {email: $email, role: 'PATIENT'})
			MERGE (c)-[r:REQUESTS]->(p)
			SET r.requestedAt = CASE WHEN r.requestedAt IS NULL THEN datetime() ELSE r.requestedAt END
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

// Respond resolves one REQUESTS edge: accept flips it into MONITORS {since},
// decline deletes it. Idempotent — a missing edge is still a success.
func (r *Repository) Respond(ctx context.Context, patientID, caregiverID string, accept bool) (bool, error) {
	value, err := r.db.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		if accept {
			res, err := tx.Run(ctx, `
				MATCH (p:User {id: $patientId, role: 'PATIENT'})
				MATCH (c:User {id: $caregiverId, role: 'CAREGIVER'})-[req:REQUESTS]->(p)
				MERGE (c)-[m:MONITORS]->(p)
				SET m.since = datetime()
				DELETE req
				RETURN true AS resolved
			`, map[string]any{"patientId": patientID, "caregiverId": caregiverID})
			if err != nil {
				return false, err
			}
			return res.Next(ctx), res.Err()
		}
		res, err := tx.Run(ctx, `
			MATCH (:User {id: $patientId, role: 'PATIENT'})<-[req:REQUESTS]-(:User {id: $caregiverId, role: 'CAREGIVER'})
			DELETE req
			RETURN true AS resolved
		`, map[string]any{"patientId": patientID, "caregiverId": caregiverID})
		if err != nil {
			return false, err
		}
		return res.Next(ctx), res.Err()
	})
	if err != nil {
		return false, err
	}
	resolved, _ := value.(bool)
	return resolved, nil
}

// PendingFor lists caregivers who have asked this patient and are waiting.
func (r *Repository) PendingFor(ctx context.Context, patientID string) ([]*contracts.User, error) {
	value, err := r.db.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, `
			MATCH (c:User {role: 'CAREGIVER'})-[r:REQUESTS]->(p:User {id: $patientId, role: 'PATIENT'})
			RETURN c, r.requestedAt AS requestedAt
			ORDER BY r.requestedAt
		`, map[string]any{"patientId": patientID})
		if err != nil {
			return nil, err
		}

		users := make([]*contracts.User, 0)
		for res.Next(ctx) {
			record := res.Record()
			node, err := neo4jdb.AsNode(record.Values[0])
			if err != nil {
				return nil, err
			}
			user := userFromNode(node)
			if v, found := record.Get("requestedAt"); found {
				if requestedAt, ok := v.(time.Time); ok {
					user.RequestedAt = requestedAt
				}
			}
			users = append(users, user)
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

// WaitingOn lists patients this caregiver has asked who have not answered.
func (r *Repository) WaitingOn(ctx context.Context, caregiverID string) ([]*contracts.User, error) {
	value, err := r.db.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, `
			MATCH (c:User {id: $caregiverId, role: 'CAREGIVER'})-[r:REQUESTS]->(p:User {role: 'PATIENT'})
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

// CancelRequest withdraws the caregiver's own pending request.
func (r *Repository) CancelRequest(ctx context.Context, caregiverID, patientID string) (bool, error) {
	value, err := r.db.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, `
			MATCH (:User {id: $caregiverId, role: 'CAREGIVER'})-[req:REQUESTS]->(:User {id: $patientId, role: 'PATIENT'})
			DELETE req
			RETURN true AS removed
		`, map[string]any{"caregiverId": caregiverID, "patientId": patientID})
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

// RevokeAccess is the patient-side mirror of StopMonitoring.
func (r *Repository) RevokeAccess(ctx context.Context, patientID, caregiverID string) (bool, error) {
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
			MATCH (c:User {role: 'CAREGIVER'})-[m:MONITORS]->(p:User {id: $patientId, role: 'PATIENT'})
			RETURN c, m.since AS since
			ORDER BY c.displayName
		`, map[string]any{"patientId": patientID})
		if err != nil {
			return nil, err
		}

		users := make([]*contracts.User, 0)
		for res.Next(ctx) {
			record := res.Record()
			node, err := neo4jdb.AsNode(record.Values[0])
			if err != nil {
				return nil, err
			}
			user := userFromNode(node)
			if v, found := record.Get("since"); found {
				if since, ok := v.(time.Time); ok {
					user.Since = since
				}
			}
			users = append(users, user)
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
			MATCH (c:User {id: $caregiverId, role: 'CAREGIVER'})-[m:MONITORS]->(p:User {role: 'PATIENT'})
			RETURN p, m.since AS since
			ORDER BY p.displayName
		`, map[string]any{"caregiverId": caregiverID})
		if err != nil {
			return nil, err
		}

		users := make([]*contracts.User, 0)
		for res.Next(ctx) {
			record := res.Record()
			node, err := neo4jdb.AsNode(record.Values[0])
			if err != nil {
				return nil, err
			}
			user := userFromNode(node)
			if v, found := record.Get("since"); found {
				if since, ok := v.(time.Time); ok {
					user.Since = since
				}
			}
			users = append(users, user)
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
