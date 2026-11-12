package repository

import (
	"context"
	"time"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/glucose/synthetic"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/daynext"
	neo4jdb "github.com/Hassan-KreateStudio/IT-Project-Backend/src/platform/neo4j"

	"github.com/google/uuid"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// SyntheticDay is a day the synthetic writer may fill or replace.
// Steps is the sum of Steps nodes on that day, the same total the dashboard
// rolls up. It is nil when the day has no Steps node. Zero is a real count.
type SyntheticDay struct {
	PatientID string
	Date      string
	Steps     *int
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
	return r.querySyntheticDays(ctx, patientID, `
		MATCH (p:User {role: 'PATIENT'})-[:HAS_DAY]->(d:Day)
		WHERE ($patientId IS NULL OR p.id = $patientId)
		  AND NOT (d)-[:HAS_GLUCOSE]->(:GlucoseReading)
		OPTIONAL MATCH (d)-[:HAS_STEPS]->(s:Steps)
		WITH p, d, count(s) AS stepNodes, sum(s.count) AS stepSum
		RETURN p.id AS patientId, d.date AS date,
		       CASE WHEN stepNodes = 0 THEN null ELSE stepSum END AS steps
		ORDER BY d.date, p.id
	`)
}

// daysWithOnlySynthetic lists days whose glucose readings are all flagged
// synthetic, oldest first. A day that also has a real reading is not listed,
// so a replace cannot sit synthetic values next to something the patient logged.
func (r *Repository) daysWithOnlySynthetic(ctx context.Context) ([]SyntheticDay, error) {
	return r.querySyntheticDays(ctx, nil, `
		MATCH (p:User {role: 'PATIENT'})-[:HAS_DAY]->(d:Day)-[:HAS_GLUCOSE]->(g:GlucoseReading)
		WITH p, d, collect(g) AS readings
		WHERE all(reading IN readings WHERE coalesce(reading.synthetic, false) = true)
		OPTIONAL MATCH (d)-[:HAS_STEPS]->(s:Steps)
		WITH p, d, count(s) AS stepNodes, sum(s.count) AS stepSum
		RETURN p.id AS patientId, d.date AS date,
		       CASE WHEN stepNodes = 0 THEN null ELSE stepSum END AS steps
		ORDER BY d.date, p.id
	`)
}

func (r *Repository) querySyntheticDays(ctx context.Context, patientID *string, cypher string) ([]SyntheticDay, error) {
	value, err := r.db.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{"patientId": patientID})
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
			stepsValue, _ := record.Get("steps")
			days = append(days, SyntheticDay{
				PatientID: id,
				Date:      stamp,
				Steps:     optionalSteps(stepsValue),
			})
		}
		return days, res.Err()
	})
	if err != nil {
		return nil, err
	}
	days, _ := value.([]SyntheticDay)
	return days, nil
}

// optionalSteps distinguishes a missing Steps node (nil) from a real zero.
func optionalSteps(value any) *int {
	if value == nil {
		return nil
	}
	n := neo4jdb.AsInt(value)
	return &n
}

// CreateSynthetic writes one generated reading and flags it, so the dashed
// values can be told apart from anything the patient actually logged.
func (r *Repository) CreateSynthetic(ctx context.Context, day SyntheticDay, reading synthetic.DayReading) error {
	if err := r.db.RunWrite(ctx, `
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
	}); err != nil {
		return err
	}
	return daynext.RelinkPatient(ctx, r.db, day.PatientID)
}

// ReplaceSynthetic deletes that day's synthetic readings and writes the new
// ones in one transaction. Readings the patient logged are not matched.
func (r *Repository) ReplaceSynthetic(ctx context.Context, day SyntheticDay, readings []synthetic.DayReading) error {
	if len(readings) == 0 {
		return nil
	}
	now := time.Now().UTC()
	rows := make([]map[string]any, 0, len(readings))
	for _, reading := range readings {
		rows = append(rows, map[string]any{
			"id":         uuid.NewString(),
			"value":      reading.Value,
			"recordedAt": reading.RecordedAt,
			"createdAt":  now,
		})
	}
	_, err := r.db.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		if _, err := tx.Run(ctx, `
			MATCH (d:Day {patientId: $patientId, date: $day})-[:HAS_GLUCOSE]->(g:GlucoseReading)
			WHERE coalesce(g.synthetic, false) = true
			DETACH DELETE g
		`, map[string]any{
			"patientId": day.PatientID,
			"day":       day.Date,
		}); err != nil {
			return nil, err
		}
		_, err := tx.Run(ctx, `
			MATCH (p:User {id: $patientId, role: 'PATIENT'})
			MATCH (d:Day {patientId: $patientId, date: $day})
			UNWIND $rows AS row
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
			"patientId": day.PatientID,
			"day":       day.Date,
			"rows":      rows,
		})
		return nil, err
	})
	if err != nil {
		return err
	}
	return daynext.RelinkPatient(ctx, r.db, day.PatientID)
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
	return daynext.RelinkPatient(ctx, r.db, patientID)
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
