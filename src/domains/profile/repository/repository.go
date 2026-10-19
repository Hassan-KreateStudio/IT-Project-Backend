package repository

import (
	"context"
	"time"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/profile/contracts"
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

func (r *Repository) Upsert(ctx context.Context, patientID string, input contracts.SyncInput) (*contracts.Profile, error) {
	value, err := r.db.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		params := map[string]any{
			"id":        uuid.NewString(),
			"patientId": patientID,
			"updatedAt": time.Now().UTC(),
		}
		if input.AgeYears != nil {
			params["ageYears"] = *input.AgeYears
		} else {
			params["ageYears"] = nil
		}
		if input.HeightCm != nil {
			params["heightCm"] = *input.HeightCm
		} else {
			params["heightCm"] = nil
		}
		if input.WeightKg != nil {
			params["weightKg"] = *input.WeightKg
		} else {
			params["weightKg"] = nil
		}
		if input.BMI != nil {
			params["bmi"] = *input.BMI
		} else {
			params["bmi"] = nil
		}

		res, err := tx.Run(ctx, `
			MATCH (u:User {id: $patientId, role: 'PATIENT'})
			MERGE (pr:Profile {patientId: $patientId})
			ON CREATE SET pr.id = $id
			SET pr.updatedAt = $updatedAt,
			    pr.ageYears = CASE WHEN $ageYears IS NULL THEN pr.ageYears ELSE $ageYears END,
			    pr.heightCm = CASE WHEN $heightCm IS NULL THEN pr.heightCm ELSE $heightCm END,
			    pr.weightKg = CASE WHEN $weightKg IS NULL THEN pr.weightKg ELSE $weightKg END,
			    pr.bmi = CASE WHEN $bmi IS NULL THEN pr.bmi ELSE $bmi END
			MERGE (u)-[:HAS_PROFILE]->(pr)
			FOREACH (_ IN CASE WHEN pr.ageYears IS NULL THEN [] ELSE [1] END |
				MERGE (a:Age {patientId: $patientId})
				SET a.years = pr.ageYears
				MERGE (pr)-[:HAS_AGE]->(a)
			)
			FOREACH (_ IN CASE WHEN pr.heightCm IS NULL THEN [] ELSE [1] END |
				MERGE (h:Height {patientId: $patientId})
				SET h.cm = pr.heightCm
				MERGE (pr)-[:HAS_HEIGHT]->(h)
			)
			FOREACH (_ IN CASE WHEN pr.weightKg IS NULL THEN [] ELSE [1] END |
				MERGE (w:Weight {patientId: $patientId})
				SET w.kg = pr.weightKg
				MERGE (pr)-[:HAS_WEIGHT]->(w)
			)
			FOREACH (_ IN CASE WHEN pr.bmi IS NULL THEN [] ELSE [1] END |
				MERGE (m:BodyMassIndex {patientId: $patientId})
				SET m.value = pr.bmi
				MERGE (pr)-[:HAS_BMI]->(m)
			)
			RETURN pr
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
	return profileFromNode(node), nil
}

func profileFromNode(node neo4j.Node) *contracts.Profile {
	return &contracts.Profile{
		PatientID: neo4jdb.NodeString(node, "patientId"),
		AgeYears:  neo4jdb.NodeIntPtr(node, "ageYears"),
		HeightCm:  neo4jdb.NodeFloatPtr(node, "heightCm"),
		WeightKg:  neo4jdb.NodeFloatPtr(node, "weightKg"),
		BMI:       neo4jdb.NodeFloatPtr(node, "bmi"),
		UpdatedAt: neo4jdb.NodeTime(node, "updatedAt"),
	}
}
