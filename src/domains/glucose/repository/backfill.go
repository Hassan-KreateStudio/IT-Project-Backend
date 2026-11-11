package repository

import (
	"context"
	"log"
	"math/rand"
	"sort"
	"time"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/glucose/synthetic"
)

// syntheticJob is one day to fill, or one day whose synthetic readings should
// be replaced. Days are walked oldest first so a seed stays reproducible.
type syntheticJob struct {
	day     SyntheticDay
	replace bool
}

// BackfillSynthetic gives every activity day without a reading three copied
// ShanghaiT2DM values, one per time-of-day slot. The day's step count picks
// the glucose third; the seed picks the row inside it. A day with no step
// count is skipped and keeps whatever readings it already has.
//
// replace also rewrites days whose glucose readings are all synthetic, using
// the same rule. Days that include a real reading are not listed.
func (r *Repository) BackfillSynthetic(ctx context.Context, seed int64, loc *time.Location, dryRun bool, replace bool) (int, error) {
	days, err := r.DaysWithoutGlucose(ctx)
	if err != nil {
		return 0, err
	}
	jobs := make([]syntheticJob, 0, len(days))
	for _, day := range days {
		jobs = append(jobs, syntheticJob{day: day})
	}
	if replace {
		existing, err := r.daysWithOnlySynthetic(ctx)
		if err != nil {
			return 0, err
		}
		for _, day := range existing {
			jobs = append(jobs, syntheticJob{day: day, replace: true})
		}
	}
	if len(jobs) == 0 {
		log.Printf("synthetic glucose: nothing to fill")
		return 0, nil
	}
	sort.Slice(jobs, func(i, j int) bool {
		if jobs[i].day.Date != jobs[j].day.Date {
			return jobs[i].day.Date < jobs[j].day.Date
		}
		if jobs[i].day.PatientID != jobs[j].day.PatientID {
			return jobs[i].day.PatientID < jobs[j].day.PatientID
		}
		return !jobs[i].replace && jobs[j].replace
	})

	rng := rand.New(rand.NewSource(seed))
	written := 0
	daysTouched := 0

	for _, job := range jobs {
		day := job.day
		if day.Steps == nil {
			log.Printf("synthetic glucose: skip %s %s (no step count)", day.PatientID, day.Date)
			continue
		}
		date, err := time.ParseInLocation("2006-01-02", day.Date, loc)
		if err != nil {
			log.Printf("synthetic glucose: skip %s (%v)", day.Date, err)
			continue
		}
		readings := synthetic.Day(date, loc, day.Steps, rng)
		action := "fill"
		if job.replace {
			action = "replace"
		}
		if dryRun {
			for _, reading := range readings {
				log.Printf("dry-run %s %s steps %d %s %.1f mg/dL",
					action, day.Date, *day.Steps, reading.RecordedAt.In(loc).Format("15:04"), reading.Value)
			}
			written += len(readings)
			daysTouched++
			continue
		}
		if job.replace {
			if err := r.ReplaceSynthetic(ctx, day, readings); err != nil {
				return written, err
			}
			written += len(readings)
			daysTouched++
			continue
		}
		for _, reading := range readings {
			if err := r.CreateSynthetic(ctx, day, reading); err != nil {
				return written, err
			}
			written++
		}
		daysTouched++
	}

	if !dryRun {
		log.Printf("synthetic glucose: wrote %d readings across %d days", written, daysTouched)
	}
	return written, nil
}

// FillPatient fills one patient's days that have activity but no reading. This
// is what the sync path calls, so a backfilled day never lands without glucose.
// A day with no step count is left empty: there is no band to copy from.
func (r *Repository) FillPatient(ctx context.Context, patientID string, seed int64, loc *time.Location) (int, error) {
	days, err := r.DaysWithoutGlucoseFor(ctx, patientID)
	if err != nil || len(days) == 0 {
		return 0, err
	}

	rng := rand.New(rand.NewSource(seed))
	rows := make([]SyntheticInsert, 0, len(days)*3)
	for _, day := range days {
		if day.Steps == nil {
			log.Printf("synthetic glucose: skip %s %s (no step count)", day.PatientID, day.Date)
			continue
		}
		date, err := time.ParseInLocation("2006-01-02", day.Date, loc)
		if err != nil {
			continue
		}
		for _, reading := range synthetic.Day(date, loc, day.Steps, rng) {
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
		log.Printf("synthetic glucose: %d readings for %d days of patient %s", len(rows), len(rows)/3, patientID)
	}
	return len(rows), nil
}
