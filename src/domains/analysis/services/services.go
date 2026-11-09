package services

import (
	"context"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	activitycontracts "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/activity/contracts"
	activitysvc "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/activity/services"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/analysis/contracts"
	authcontracts "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/contracts"
	caregiversvc "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/caregiver/services"
	glucosecontracts "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/glucose/contracts"
	glucosesvc "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/glucose/services"
	patientsvc "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/patient/services"
	apperrors "github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/errors"
)

const defaultWindow = 7 * 24 * time.Hour

type Service struct {
	patients  *patientsvc.Service
	caregiver *caregiversvc.Service
	activity  *activitysvc.Service
	glucose   *glucosesvc.Service
}

func New(
	patients *patientsvc.Service,
	caregiver *caregiversvc.Service,
	activity *activitysvc.Service,
	glucose *glucosesvc.Service,
) *Service {
	return &Service{
		patients:  patients,
		caregiver: caregiver,
		activity:  activity,
		glucose:   glucose,
	}
}

// OwnDashboard buckets by the viewer's own clock: offsetMinutes is their UTC
// offset, so a reading at 23:30 lands on the day they call today.
func (s *Service) OwnDashboard(ctx context.Context, viewer *authcontracts.User, from, to *time.Time, offsetMinutes int) (*contracts.Dashboard, error) {
	if viewer == nil {
		return nil, apperrors.New("unauthorized", http.StatusUnauthorized)
	}
	if viewer.Role != authcontracts.RolePatient {
		return nil, apperrors.New("forbidden", http.StatusForbidden)
	}
	return s.build(ctx, viewer.ID, from, to, offsetMinutes)
}

func (s *Service) PatientDashboard(ctx context.Context, viewer *authcontracts.User, patientID string, from, to *time.Time) (*contracts.Dashboard, error) {
	if viewer == nil {
		return nil, apperrors.New("unauthorized", http.StatusUnauthorized)
	}
	if err := s.caregiver.AssertCanView(ctx, viewer, patientID); err != nil {
		return nil, err
	}
	return s.build(ctx, patientID, from, to, 0)
}

func (s *Service) build(ctx context.Context, patientID string, fromPtr, toPtr *time.Time, offsetMinutes int) (*contracts.Dashboard, error) {
	patient, err := s.patients.Get(ctx, patientID)
	if err != nil {
		return nil, err
	}

	to := time.Now().UTC()
	if toPtr != nil && !toPtr.IsZero() {
		to = toPtr.UTC()
	}
	from := to.Add(-defaultWindow)
	if fromPtr != nil && !fromPtr.IsZero() {
		from = fromPtr.UTC()
	}
	if !from.Before(to) {
		return nil, apperrors.New("invalid_range", http.StatusBadRequest)
	}

	activities, err := s.activity.ListInRange(ctx, patientID, from, to)
	if err != nil {
		return nil, err
	}
	readings, err := s.glucose.ListInRange(ctx, patientID, from, to)
	if err != nil {
		return nil, err
	}

	loc := time.FixedZone("local", offsetMinutes*60)
	activityTrends, summary := rollupActivity(activities, loc)
	glucoseTrends, avgGlucose, glucoseCount := rollupGlucose(readings, loc)
	summary.AverageGlucose = avgGlucose
	summary.GlucoseReadingCount = glucoseCount

	return &contracts.Dashboard{
		Patient:        patient,
		From:           from,
		To:             to,
		ActivityTrends: activityTrends,
		GlucoseTrends:  glucoseTrends,
		Alerts:         alertsFor(activityTrends, readings),
		Summary:        summary,
	}, nil
}

type dayActivity struct {
	steps     int
	duration  int
	sedentary int
	hrSum     int
	hrCount   int
}

func rollupActivity(records []*activitycontracts.ActivityRecord, loc *time.Location) ([]contracts.ActivityTrend, contracts.DashboardSummary) {
	buckets := map[string]*dayActivity{}
	summary := contracts.DashboardSummary{}
	hrSum := 0
	hrCount := 0

	for _, record := range records {
		key := record.RecordedAt.In(loc).Format("2006-01-02")
		day, ok := buckets[key]
		if !ok {
			day = &dayActivity{}
			buckets[key] = day
		}
		day.steps += record.StepCount
		day.duration += record.DurationMinutes
		day.sedentary += record.SedentaryMinutes
		summary.TotalSteps += record.StepCount
		summary.TotalActiveMinutes += record.DurationMinutes
		summary.TotalSedentaryMinutes += record.SedentaryMinutes
		if record.HeartRate != nil {
			day.hrSum += *record.HeartRate
			day.hrCount++
			hrSum += *record.HeartRate
			hrCount++
		}
	}

	keys := make([]string, 0, len(buckets))
	for key := range buckets {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	trends := make([]contracts.ActivityTrend, 0, len(keys))
	for _, key := range keys {
		day := buckets[key]
		trend := contracts.ActivityTrend{
			Date:             key,
			StepCount:        day.steps,
			DurationMinutes:  day.duration,
			SedentaryMinutes: day.sedentary,
		}
		if day.hrCount > 0 {
			avg := round1(float64(day.hrSum) / float64(day.hrCount))
			trend.AverageHeartRate = &avg
		}
		trends = append(trends, trend)
	}

	if hrCount > 0 {
		avg := round1(float64(hrSum) / float64(hrCount))
		summary.AverageHeartRate = &avg
	}

	return trends, summary
}

func rollupGlucose(readings []*glucosecontracts.GlucoseReading, loc *time.Location) ([]contracts.GlucoseTrend, *float64, int) {
	type dayGlucose struct {
		sum   float64
		count int
	}

	buckets := map[string]*dayGlucose{}
	total := 0.0

	for _, reading := range readings {
		key := reading.RecordedAt.In(loc).Format("2006-01-02")
		day, ok := buckets[key]
		if !ok {
			day = &dayGlucose{}
			buckets[key] = day
		}
		day.sum += reading.Value
		day.count++
		total += reading.Value
	}

	keys := make([]string, 0, len(buckets))
	for key := range buckets {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	trends := make([]contracts.GlucoseTrend, 0, len(keys))
	for _, key := range keys {
		day := buckets[key]
		trends = append(trends, contracts.GlucoseTrend{
			Date:         key,
			AverageValue: round1(day.sum / float64(day.count)),
			ReadingCount: day.count,
		})
	}

	var avg *float64
	if len(readings) > 0 {
		value := round1(total / float64(len(readings)))
		avg = &value
	}

	return trends, avg, len(readings)
}

// alertsFor reports one line per kind of problem, not one line per day.
// A per-day alert feed reads like a log and buries the thing that matters.
func alertsFor(trends []contracts.ActivityTrend, readings []*glucosecontracts.GlucoseReading) []contracts.Alert {
	highGlucose, lowGlucose, lowSteps := 0, 0, 0

	for _, trend := range trends {
		if trend.StepCount > 0 && trend.StepCount < 3000 {
			lowSteps++
		}
	}
	for _, reading := range readings {
		switch {
		case reading.Value >= 180:
			highGlucose++
		case reading.Value > 0 && reading.Value < 70:
			lowGlucose++
		}
	}

	alerts := make([]contracts.Alert, 0, 3)
	if lowGlucose > 0 {
		alerts = append(alerts, contracts.Alert{
			Code:     "LOW_GLUCOSE",
			Message:  countPhrase(lowGlucose, len(readings), "reading was", "readings were") + " below 70 mg/dL.",
			Severity: "warning",
		})
	}
	if highGlucose > 0 {
		alerts = append(alerts, contracts.Alert{
			Code:     "HIGH_GLUCOSE",
			Message:  countPhrase(highGlucose, len(readings), "reading was", "readings were") + " above 180 mg/dL.",
			Severity: "warning",
		})
	}
	if lowSteps > 0 {
		alerts = append(alerts, contracts.Alert{
			Code:     "LOW_ACTIVITY",
			Message:  countPhrase(lowSteps, len(trends), "day was", "days were") + " under 3,000 steps.",
			Severity: "info",
		})
	}
	return alerts
}

// countPhrase turns 3 of 7 into "3 of 7 days were", so the card reads as a
// sentence instead of a date-stamped log line.
func countPhrase(count, total int, singular, plural string) string {
	unit := "days"
	if count == 1 {
		return "1 " + strings.TrimSuffix(unit, "s") + " " + singular
	}
	if total > 0 {
		return strconv.Itoa(count) + " of " + strconv.Itoa(total) + " " + unit + " " + plural
	}
	return strconv.Itoa(count) + " " + unit + " " + plural
}

func round1(value float64) float64 {
	return math.Round(value*10) / 10
}
