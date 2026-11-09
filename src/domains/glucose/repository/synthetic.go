package repository

import (
	"context"
	"time"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/glucose/synthetic"

	"github.com/google/uuid"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// SyntheticDay is a day node that has activity but no glucose yet.
type SyntheticDay struct {
	PatientID string
	Date      string
}

// DaysWithoutGlucose lists days whose patient has no glucose reading on them,
// oldest first. Days that already carry a reading are never touched, so the
// backfill can run twice without duplicating anything.
func (r *Repository) DaysWithoutGlucose(ctx context.Context) ([]SyntheticDay, error) {
	return r.daysWithoutGlucose(ctx, nil)
}

// DaysWithoutGlucoseFor is the same question scoped to one patient, which is
// what the sync path needs: fill the days that patient just uploaded.
func (r *Repository) DaysWithoutGlucoseFor(ctx context.Context, patientID string) ([]SyntheticDay, error) {
	return r.daysWithoutGlucose(ctx, &patientID)
}

func (r *Repository) daysWithoutGlucose(ctx context.Context, patientID *string) ([]SyntheticDay, error) {
	value, err := r.db.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, `
			MATCH (p:User {role: 'PATIENT'})-[:HAS_DAY]->(d:Day)
			WHERE ($patientId IS NULL OR p.id = $patientId)
			  AND NOT (d)-[:HAS_GLUCOSE]->(:GlucoseReading)
			RETURN p.id AS patientId, d.date AS date
			ORDER BY d.date
		`, map[string]any{"patientId": patientID})
		if err != nil {
			return nil, err
		}

		days := make([]SyntheticDay, 0)
		for res.Next(ctx) {
			record := res.Record()
			patientID, _ := record.Get("patientId")
			date, _ := record.Get("date")
			id, _ := patientID.(string)
			stamp, _ := date.(string)
			if id == "" || stamp == "" {
				continue
			}
			days = append(days, SyntheticDay{PatientID: id, Date: stamp})
		}
		return days, res.Err()
	})
	if err != nil {
		return nil, err
	}
	days, _ := value.([]SyntheticDay)
	return days, nil
}

// CreateSynthetic writes one generated reading and flags it, so the dashed
// values can be told apart from anything the patient actually logged.
func (r *Repository) CreateSynthetic(ctx context.Context, day SyntheticDay, reading synthetic.DayReading) error {
	return r.db.RunWrite(ctx, `
		MATCH (p:User {id: $patientId, role: 'PATIENT'})
		MERGE (d:Day {patientId: $patientId, date: $day})
		ON CREATE SET d.id = $dayId
		MERGE (p)-[:HAS_DAY]->(d)
		CREATE (g:GlucoseReading {
			id: $id,
			patientId: $patientId,
			value: $value,
			recordedAt: $recordedAt,
			createdAt: $createdAt,
			synthetic: true,
			source: 'backfill'
		})
		MERGE (p)-[:GENERATES]->(g)
		MERGE (d)-[:HAS_GLUCOSE]->(g)
	`, map[string]any{
		"id":         uuid.NewString(),
		"dayId":      uuid.NewString(),
		"patientId":  day.PatientID,
		"day":        day.Date,
		"value":      reading.Value,
		"recordedAt": reading.RecordedAt,
		"createdAt":  time.Now().UTC(),
	})
}

// SyntheticInsert is one row for the batched writer.
type SyntheticInsert struct {
	Day        string
	Value      float64
	RecordedAt time.Time
}

// CreateSyntheticBatch writes many readings in one transaction. The sync path
// fills 90 days at a time, and a round trip per reading made that request slow
// enough that the app looked stale while it ran.
// syntheticChunk keeps each transaction small enough for Aura, whose
// server-side timeout is far below a whole 90-day fill.
const syntheticChunk = 30

func (r *Repository) CreateSyntheticBatch(ctx context.Context, patientID string, rows []SyntheticInsert) error {
	if len(rows) == 0 {
		return nil
	}

	now := time.Now().UTC()
	for start := 0; start < len(rows); start += syntheticChunk {
		end := start + syntheticChunk
		if end > len(rows) {
			end = len(rows)
		}
		payload := make([]map[string]any, 0, end-start)
		for _, row := range rows[start:end] {
			payload = append(payload, map[string]any{
				"id":         uuid.NewString(),
				"dayId":      uuid.NewString(),
				"day":        row.Day,
				"value":      row.Value,
				"recordedAt": row.RecordedAt,
				"createdAt":  now,
			})
		}
		if err := r.writeSyntheticChunk(ctx, patientID, payload); err != nil {
			return err
		}
	}
	return nil
}

func (r *Repository) writeSyntheticChunk(ctx context.Context, patientID string, payload []map[string]any) error {
	return r.db.RunWrite(ctx, `
		MATCH (p:User {id: $patientId, role: 'PATIENT'})
		UNWIND $rows AS row
		MERGE (d:Day {patientId: $patientId, date: row.day})
		ON CREATE SET d.id = row.dayId
		MERGE (p)-[:HAS_DAY]->(d)
		CREATE (g:GlucoseReading {
			id: row.id,
			patientId: $patientId,
			value: row.value,
			recordedAt: row.recordedAt,
			createdAt: row.createdAt,
			synthetic: true,
			source: 'backfill'
		})
		MERGE (p)-[:GENERATES]->(g)
		MERGE (d)-[:HAS_GLUCOSE]->(g)
	`, map[string]any{
		"patientId": patientID,
		"rows":      payload,
	})
}
