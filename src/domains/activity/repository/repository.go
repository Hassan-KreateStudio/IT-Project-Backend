package repository

import (
	"context"
	"time"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/activity/contracts"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/daykey"
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

// Upsert writes one node per metric under the patient's Day hub. The GraphQL
// shape stays flat; the split is storage only, so Day fans out in the graph.
func (r *Repository) Upsert(ctx context.Context, patientID string, input contracts.SyncInput) (*contracts.ActivityRecord, error) {
	value, err := r.db.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		var heartRate any
		if input.HeartRate != nil {
			heartRate = *input.HeartRate
		}

		params := map[string]any{
			"patientId":        patientID,
			"day":              daykey.FromSourceAndTime(input.SourceID, input.RecordedAt),
			"dayId":            uuid.NewString(),
			"sourceId":         input.SourceID,
			"recordedAt":       input.RecordedAt.UTC(),
			"stepCount":        input.StepCount,
			"heartRate":        heartRate,
			"durationMinutes":  input.DurationMinutes,
			"intensity":        string(input.Intensity),
			"sedentaryMinutes": input.SedentaryMinutes,
		}

		res, err := tx.Run(ctx, `
			MATCH (p:User {id: $patientId, role: 'PATIENT'})
			MERGE (d:Day {patientId: $patientId, date: $day})
			ON CREATE SET d.id = $dayId
			SET d.intensity = $intensity
			MERGE (p)-[:HAS_DAY]->(d)
			MERGE (s:Steps {patientId: $patientId, day: $day})
			SET s.count = $stepCount, s.sourceId = $sourceId, s.recordedAt = $recordedAt
			MERGE (d)-[:HAS_STEPS]->(s)
			MERGE (m:ActiveMinutes {patientId: $patientId, day: $day})
			SET m.minutes = $durationMinutes
			MERGE (d)-[:HAS_ACTIVE_MINUTES]->(m)
			MERGE (sd:Sedentary {patientId: $patientId, day: $day})
			SET sd.minutes = $sedentaryMinutes
			MERGE (d)-[:HAS_SEDENTARY]->(sd)
			MERGE (h:HeartRate {patientId: $patientId, day: $day})
			SET h.bpm = CASE WHEN $heartRate IS NULL THEN h.bpm ELSE $heartRate END
			MERGE (d)-[:HAS_HEART_RATE]->(h)
			RETURN d, s, m, sd, h
		`, params)
		if err != nil {
			return nil, err
		}
		if !res.Next(ctx) {
			return nil, res.Err()
		}
		return recordFromValues(res.Record().Values)
	})
	if err != nil || value == nil {
		return nil, err
	}
	record, _ := value.(*contracts.ActivityRecord)
	return record, nil
}

// UpsertBatch writes a whole backfill in one transaction. The per-record
// Upsert made a 90-day pull 90 round trips, which is what the app was waiting
// on at first launch.
func (r *Repository) UpsertBatch(ctx context.Context, patientID string, inputs []contracts.SyncInput) ([]*contracts.ActivityRecord, error) {
	if len(inputs) == 0 {
		return []*contracts.ActivityRecord{}, nil
	}

	rows := make([]map[string]any, 0, len(inputs))
	for _, input := range inputs {
		var heartRate any
		if input.HeartRate != nil {
			heartRate = *input.HeartRate
		}
		rows = append(rows, map[string]any{
			"sourceId":         input.SourceID,
			"day":              daykey.FromSourceAndTime(input.SourceID, input.RecordedAt),
			"dayId":            uuid.NewString(),
			"recordedAt":       input.RecordedAt.UTC(),
			"stepCount":        input.StepCount,
			"heartRate":        heartRate,
			"durationMinutes":  input.DurationMinutes,
			"intensity":        string(input.Intensity),
			"sedentaryMinutes": input.SedentaryMinutes,
		})
	}

	value, err := r.db.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, `
			MATCH (p:User {id: $patientId, role: 'PATIENT'})
			UNWIND $rows AS row
			MERGE (d:Day {patientId: $patientId, date: row.day})
			ON CREATE SET d.id = row.dayId
			SET d.intensity = row.intensity
			MERGE (p)-[:HAS_DAY]->(d)
			MERGE (s:Steps {patientId: $patientId, day: row.day})
			SET s.count = row.stepCount, s.sourceId = row.sourceId, s.recordedAt = row.recordedAt
			MERGE (d)-[:HAS_STEPS]->(s)
			MERGE (m:ActiveMinutes {patientId: $patientId, day: row.day})
			SET m.minutes = row.durationMinutes
			MERGE (d)-[:HAS_ACTIVE_MINUTES]->(m)
			MERGE (sd:Sedentary {patientId: $patientId, day: row.day})
			SET sd.minutes = row.sedentaryMinutes
			MERGE (d)-[:HAS_SEDENTARY]->(sd)
			MERGE (h:HeartRate {patientId: $patientId, day: row.day})
			SET h.bpm = CASE WHEN row.heartRate IS NULL THEN h.bpm ELSE row.heartRate END
			MERGE (d)-[:HAS_HEART_RATE]->(h)
			RETURN d, s, m, sd, h
		`, map[string]any{"patientId": patientID, "rows": rows})
		if err != nil {
			return nil, err
		}

		records := make([]*contracts.ActivityRecord, 0, len(rows))
		for res.Next(ctx) {
			record, err := recordFromValues(res.Record().Values)
			if err != nil {
				return nil, err
			}
			records = append(records, record)
		}
		return records, res.Err()
	})
	if err != nil {
		return nil, err
	}
	records, _ := value.([]*contracts.ActivityRecord)
	return records, nil
}

func (r *Repository) ListInRange(ctx context.Context, patientID string, from, to time.Time) ([]*contracts.ActivityRecord, error) {
	startDay, endDay := daykey.Span(from, to)
	value, err := r.db.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, `
			MATCH (p:User {id: $patientId})-[:HAS_DAY]->(d:Day)-[:HAS_STEPS]->(s:Steps)
			WHERE d.date >= $from AND d.date <= $to
			OPTIONAL MATCH (d)-[:HAS_HEART_RATE]->(h:HeartRate)
			OPTIONAL MATCH (d)-[:HAS_ACTIVE_MINUTES]->(m:ActiveMinutes)
			OPTIONAL MATCH (d)-[:HAS_SEDENTARY]->(sd:Sedentary)
			RETURN d, s, m, sd, h
			ORDER BY d.date
		`, map[string]any{
			"patientId": patientID,
			"from":      startDay,
			"to":        endDay,
		})
		if err != nil {
			return nil, err
		}

		records := make([]*contracts.ActivityRecord, 0)
		for res.Next(ctx) {
			record, err := recordFromValues(res.Record().Values)
			if err != nil {
				return nil, err
			}
			records = append(records, record)
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

// recordFromValues flattens a Day and its metric nodes back into the API shape:
// d, s, m, sd, h — only the Day and Steps are guaranteed by the query.
func recordFromValues(values []any) (*contracts.ActivityRecord, error) {
	day, err := neo4jdb.AsNode(values[0])
	if err != nil {
		return nil, err
	}
	steps, err := neo4jdb.AsNode(values[1])
	if err != nil {
		return nil, err
	}

	record := &contracts.ActivityRecord{
		ID:         neo4jdb.NodeString(day, "id"),
		PatientID:  neo4jdb.NodeString(day, "patientId"),
		SourceID:   neo4jdb.NodeString(steps, "sourceId"),
		RecordedAt: neo4jdb.NodeTime(steps, "recordedAt"),
		StepCount:  neo4jdb.NodeInt(steps, "count"),
		Intensity:  contracts.Intensity(neo4jdb.NodeString(day, "intensity")),
	}
	if record.Intensity == "" {
		record.Intensity = contracts.IntensityLight
	}
	if node, ok := optionalNode(values[2]); ok {
		record.DurationMinutes = neo4jdb.NodeInt(node, "minutes")
	}
	if node, ok := optionalNode(values[3]); ok {
		record.SedentaryMinutes = neo4jdb.NodeInt(node, "minutes")
	}
	if node, ok := optionalNode(values[4]); ok {
		record.HeartRate = neo4jdb.NodeIntPtr(node, "bpm")
	}
	return record, nil
}

func optionalNode(value any) (neo4j.Node, bool) {
	if value == nil {
		return neo4j.Node{}, false
	}
	node, err := neo4jdb.AsNode(value)
	return node, err == nil
}
