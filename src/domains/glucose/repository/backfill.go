package repository

import (
	"context"
	"log"
	"math/rand"
	"time"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/glucose/synthetic"
)

// BackfillSynthetic gives every activity day without a reading three generated
// ones, so the history screen and the daily average have something to work
// with. Seeded, so the same seed reproduces the same numbers.
//
// ShanghaiT2DM on PhysioNet stores continuous glucose readings — mg/dL values sampled at roughly 15-minute intervals for about 100 type 2 patients over several days — and we did not ingest it:
// nothing was downloaded or parsed, so no empirical parameter was fitted.
// Instead we took its shape (fasting low in the morning, the day's peak after lunch, a smaller rise after dinner, occasional hyperglycaemic days) and paired it with representative type 2 CGM summary figures — 124 ± 18 at 07:30, 168 ± 30 at 13:00, 148 ± 26 at 20:30 mg/dL — hardcoded as synthetic.DailyProfile;
// the generator then draws each day three Gaussian values around those means, with one shared day-level offset so a day's readings move together, an 8% chance of a whole day running high, everything clamped to 40–400, seeded for reproducibility,
// and flagged synthetic: true in the graph — and crucially generated independently of that day's step count, so any activity–glucose correlation the analysis later finds is noise in the data rather than a relationship we planted.
//
// Values are drawn independently of each day's activity on purpose — see the
// synthetic package. This is test data and is flagged as such in the graph.
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
