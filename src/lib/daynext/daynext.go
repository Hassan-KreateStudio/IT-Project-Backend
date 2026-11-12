// Package daynext keeps a NEXT edge from each Day to the next Day of the
// same patient, in date order. The link is rebuilt, not patched, so a day
// inserted in the middle does not leave a stale skip.
package daynext

import (
	"context"

	neo4jdb "github.com/Hassan-KreateStudio/IT-Project-Backend/src/platform/neo4j"
)

// RelinkPatient replaces NEXT edges for one patient. It is safe to run after
// every sync: missing days get a link, and a link that skipped a new day is
// removed.
func RelinkPatient(ctx context.Context, db *neo4jdb.Client, patientID string) error {
	if db == nil || patientID == "" {
		return nil
	}
	if err := db.RunWrite(ctx, `
		MATCH (a:Day {patientId: $patientId})-[r:NEXT]->()
		DELETE r
	`, map[string]any{"patientId": patientID}); err != nil {
		return err
	}
	return db.RunWrite(ctx, `
		MATCH (:User {id: $patientId, role: 'PATIENT'})-[:HAS_DAY]->(d:Day)
		WITH d ORDER BY d.date
		WITH collect(d) AS days
		UNWIND range(0, size(days) - 2) AS i
		WITH days[i] AS a, days[i + 1] AS b
		WHERE a IS NOT NULL AND b IS NOT NULL
		MERGE (a)-[:NEXT]->(b)
	`, map[string]any{"patientId": patientID})
}
