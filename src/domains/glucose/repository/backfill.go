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
// Reference cohort: ShanghaiT2DM (PhysioNet), ~100 type 2 patients on CGM.
// The daily profile in the synthetic package is shaped after that cohort's
// fasting/post-meal pattern, but the numbers are representative values taken
// from published type 2 CGM summaries — they are NOT fitted to the dataset
// itself. Say "modelled on ShanghaiT2DM ranges", not "sampled from
// ShanghaiT2DM", in any write-up. Fitting the empirical distribution is a
// separate job and would change only the four constants in synthetic.DailyProfile.
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
