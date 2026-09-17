package repository

import (
	"context"
	"time"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/activity/contracts"
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

func (r *Repository) Upsert(ctx context.Context, patientID string, input contracts.SyncInput) (*contracts.ActivityRecord, error) {
	value, err := r.db.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		params := map[string]any{
			"id":               uuid.NewString(),
			"patientId":        patientID,
			"sourceId":         input.SourceID,
			"recordedAt":       input.RecordedAt.UTC(),
			"stepCount":        input.StepCount,
			"durationMinutes":  input.DurationMinutes,
			"intensity":        string(input.Intensity),
			"sedentaryMinutes": input.SedentaryMinutes,
			"createdAt":        time.Now().UTC(),
		}
		if input.HeartRate != nil {
			params["heartRate"] = *input.HeartRate
		} else {
			params["heartRate"] = nil
		}

		res, err := tx.Run(ctx, `
			MATCH (p:User {id: $patientId, role: 'PATIENT'})
			MERGE (a:ActivityRecord {patientId: $patientId, sourceId: $sourceId})
			ON CREATE SET a.id = $id, a.createdAt = $createdAt
			SET a.recordedAt = $recordedAt,
			    a.stepCount = $stepCount,
			    a.heartRate = $heartRate,
			    a.durationMinutes = $durationMinutes,
			    a.intensity = $intensity,
			    a.sedentaryMinutes = $sedentaryMinutes
			MERGE (p)-[:GENERATES]->(a)
			RETURN a
		`, params)
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
	return recordFromNode(node), nil
}

func (r *Repository) ListInRange(ctx context.Context, patientID string, from, to time.Time) ([]*contracts.ActivityRecord, error) {
	value, err := r.db.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, `
			MATCH (p:User {id: $patientId})-[:GENERATES]->(a:ActivityRecord)
			WHERE a.recordedAt >= $from AND a.recordedAt < $to
			RETURN a
			ORDER BY a.recordedAt
		`, map[string]any{
			"patientId": patientID,
			"from":      from.UTC(),
			"to":        to.UTC(),
		})
		if err != nil {
			return nil, err
		}

		records := make([]*contracts.ActivityRecord, 0)
		for res.Next(ctx) {
			node, err := neo4jdb.AsNode(res.Record().Values[0])
			if err != nil {
				return nil, err
			}
			records = append(records, recordFromNode(node))
		}
		return records, res.Err()
	})
	if err != nil {
		return nil, err
	}
	records, _ := value.([]*contracts.ActivityRecord)
	if records == nil {
		return []*contracts.ActivityRecord{}, nil
	}
	return records, nil
}

func recordFromNode(node neo4j.Node) *contracts.ActivityRecord {
	return &contracts.ActivityRecord{
		ID:               neo4jdb.NodeString(node, "id"),
		PatientID:        neo4jdb.NodeString(node, "patientId"),
		SourceID:         neo4jdb.NodeString(node, "sourceId"),
		RecordedAt:       neo4jdb.NodeTime(node, "recordedAt"),
		StepCount:        neo4jdb.NodeInt(node, "stepCount"),
		HeartRate:        neo4jdb.NodeIntPtr(node, "heartRate"),
		DurationMinutes:  neo4jdb.NodeInt(node, "durationMinutes"),
		Intensity:        contracts.Intensity(neo4jdb.NodeString(node, "intensity")),
		SedentaryMinutes: neo4jdb.NodeInt(node, "sedentaryMinutes"),
		CreatedAt:        neo4jdb.NodeTime(node, "createdAt"),
	}
}
