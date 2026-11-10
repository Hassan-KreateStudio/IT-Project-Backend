package repository

import (
	"context"
	"log"
	"math/rand"
	"time"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/glucose/synthetic"
)

// BackfillSynthetic gives every activity day without a reading three copied
// ShanghaiT2DM values, one per time-of-day slot, so the history screen and
// the daily average have something to work with. The same seed copies the
// same rows. Values do not depend on that day's step count, and each written
// reading is flagged synthetic.
func (r *Repository) BackfillSynthetic(ctx context.Context, seed int64, loc *time.Location, dryRun bool) (int, error) {
	days, err := r.DaysWithoutGlucose(ctx)
	if err != nil {
		return 0, err
	}
	if len(days) == 0 {
		log.Printf("synthetic glucose: nothing to fill")
		return 0, nil
	}

	rng := rand.New(rand.NewSource(seed))
	written := 0

	for _, day := range days {
		date, err := time.ParseInLocation("2006-01-02", day.Date, loc)
		if err != nil {
			log.Printf("synthetic glucose: skip %s (%v)", day.Date, err)
			continue
		}
		readings := synthetic.Day(date, loc, rng)
		if dryRun {
			for _, reading := range readings {
				log.Printf("dry-run %s %s %.1f mg/dL",
					day.Date, reading.RecordedAt.In(loc).Format("15:04"), reading.Value)
			}
			written += len(readings)
			continue
		}
		for _, reading := range readings {
			if err := r.CreateSynthetic(ctx, day, reading); err != nil {
				return written, err
			}
			written++
		}
	}

	if !dryRun {
		log.Printf("synthetic glucose: wrote %d readings across %d days", written, len(days))
	}
	return written, nil
}

// FillPatient fills one patient's days that have activity but no reading. This
// is what the sync path calls, so a backfilled day never lands without glucose.
func (r *Repository) FillPatient(ctx context.Context, patientID string, seed int64, loc *time.Location) (int, error) {
	days, err := r.DaysWithoutGlucoseFor(ctx, patientID)
	if err != nil || len(days) == 0 {
		return 0, err
	}

	rng := rand.New(rand.NewSource(seed))
	rows := make([]SyntheticInsert, 0, len(days)*3)
	for _, day := range days {
		date, err := time.ParseInLocation("2006-01-02", day.Date, loc)
		if err != nil {
			continue
		}
		for _, reading := range synthetic.Day(date, loc, rng) {
			rows = append(rows, SyntheticInsert{
				Day:        day.Date,
				Value:      reading.Value,
				RecordedAt: reading.RecordedAt,
			})
		}
	}

	if err := r.CreateSyntheticBatch(ctx, patientID, rows); err != nil {
		return 0, err
	}
	if len(rows) > 0 {
		log.Printf("synthetic glucose: %d readings for %d days of patient %s", len(rows), len(days), patientID)
	}
	return len(rows), nil
}
