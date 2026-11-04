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
	value, err := r.db.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, `
			MATCH (p:User {role: 'PATIENT'})-[:HAS_DAY]->(d:Day)
			WHERE NOT (d)-[:HAS_GLUCOSE]->(:GlucoseReading)
			RETURN p.id AS patientId, d.date AS date
			ORDER BY d.date
		`, nil)
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
