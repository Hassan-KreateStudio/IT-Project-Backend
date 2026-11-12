package repository

import (
	"context"
	"time"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/glucose/contracts"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/daykey"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/daynext"
	neo4jdb "github.com/Hassan-KreateStudio/IT-Project-Backend/src/platform/neo4j"

	"github.com/google/uuid"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type Repository struct {
	db *neo4jdb.Client
}

func New(db *neo4jdb.Client) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(ctx context.Context, patientID string, value float64, recordedAt time.Time) (*contracts.GlucoseReading, error) {
	result, err := r.db.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, `
			MATCH (p:User {id: $patientId, role: 'PATIENT'})
			CREATE (g:GlucoseReading {
				id: $id,
				patientId: $patientId,
				value: $value,
				recordedAt: $recordedAt,
				createdAt: $createdAt
			})
			MERGE (p)-[:GENERATES]->(g)
			MERGE (d:Day {patientId: $patientId, date: $day})
			ON CREATE SET d.id = $dayId
			MERGE (p)-[:HAS_DAY]->(d)
			MERGE (d)-[:HAS_GLUCOSE]->(g)
			RETURN g
		`, map[string]any{
			"id":         uuid.NewString(),
			"patientId":  patientID,
			"day":        daykey.FromSourceAndTime("", recordedAt),
			"dayId":      uuid.NewString(),
			"value":      value,
			"recordedAt": recordedAt.UTC(),
			"createdAt":  time.Now().UTC(),
		})
		if err != nil {
			return nil, err
		}
		if !res.Next(ctx) {
			return nil, res.Err()
		}
		return res.Record().Values[0], res.Err()
	})
	if err != nil || result == nil {
		return nil, err
	}
	node, err := neo4jdb.AsNode(result)
	if err != nil {
		return nil, err
	}
	if err := daynext.RelinkPatient(ctx, r.db, patientID); err != nil {
		return nil, err
	}
	return readingFromNode(node), nil
}

func (r *Repository) ListInRange(ctx context.Context, patientID string, from, to time.Time) ([]*contracts.GlucoseReading, error) {
	value, err := r.db.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, `
			MATCH (p:User {id: $patientId})-[:GENERATES]->(g:GlucoseReading)
			WHERE g.recordedAt >= $from AND g.recordedAt < $to
			RETURN g
			ORDER BY g.recordedAt
		`, map[string]any{
			"patientId": patientID,
			"from":      from.UTC(),
			"to":        to.UTC(),
		})
		if err != nil {
			return nil, err
		}

		readings := make([]*contracts.GlucoseReading, 0)
		for res.Next(ctx) {
			node, err := neo4jdb.AsNode(res.Record().Values[0])
			if err != nil {
				return nil, err
			}
			readings = append(readings, readingFromNode(node))
		}
		return readings, res.Err()
	})
	if err != nil {
		return nil, err
	}
	readings, _ := value.([]*contracts.GlucoseReading)
	if readings == nil {
		return []*contracts.GlucoseReading{}, nil
	}
	return readings, nil
}

func readingFromNode(node neo4j.Node) *contracts.GlucoseReading {
	return &contracts.GlucoseReading{
		ID:         neo4jdb.NodeString(node, "id"),
		PatientID:  neo4jdb.NodeString(node, "patientId"),
		Value:      neo4jdb.NodeFloat(node, "value"),
		RecordedAt: neo4jdb.NodeTime(node, "recordedAt"),
		CreatedAt:  neo4jdb.NodeTime(node, "createdAt"),
	}
}
