package graphql

import (
	"time"
	"context"
	"net/http"

	activitycontracts "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/activity/contracts"
	analysiscontracts "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/analysis/contracts"
	authcontracts "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/contracts"
	glucosecontracts "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/glucose/contracts"
	profilecontracts "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/profile/contracts"
	apperrors "github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/errors"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/middleware"

	"github.com/vektah/gqlparser/v2/gqlerror"
)

func requireUser(ctx context.Context) (*authcontracts.User, error) {
	user, ok := middleware.UserFromContext(ctx)
	if !ok || user == nil {
		return nil, apperrors.New("unauthorized", http.StatusUnauthorized)
	}
	return user, nil
}

func gqlErr(err error) error {
	if err == nil {
		return nil
	}
	if appErr, ok := apperrors.IsAppError(err); ok {
		return &gqlerror.Error{
			Message: appErr.Error(),
			Extensions: map[string]any{
				"code":   appErr.Code,
				"status": appErr.Status,
			},
		}
	}
	return err
}

func mapUser(user *authcontracts.User) *User {
	if user == nil {
		return nil
	}
	return &User{
		ID:          user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		Role:        Role(user.Role),
		CreatedAt:   user.CreatedAt,
		Since:       sinceOrNull(user.Since),
	}
}

func sinceOrNull(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	return &t
}

func mapUsers(users []*authcontracts.User) []*User {
	out := make([]*User, 0, len(users))
	for _, user := range users {
		out = append(out, mapUser(user))
	}
	return out
}

func mapActivity(record *activitycontracts.ActivityRecord) *ActivityRecord {
	if record == nil {
		return nil
	}
	return &ActivityRecord{
		ID:               record.ID,
		SourceID:         record.SourceID,
		RecordedAt:       record.RecordedAt,
		StepCount:        record.StepCount,
		HeartRate:        record.HeartRate,
		DurationMinutes:  record.DurationMinutes,
		Intensity:        ActivityIntensity(record.Intensity),
		SedentaryMinutes: record.SedentaryMinutes,
	}
}

func mapProfile(profile *profilecontracts.Profile) *PatientProfile {
	if profile == nil {
		return nil
	}
	return &PatientProfile{
		AgeYears:  profile.AgeYears,
		HeightCm:  profile.HeightCm,
		WeightKg:  profile.WeightKg,
		Bmi:       profile.BMI,
		UpdatedAt: profile.UpdatedAt,
	}
}

func mapGlucose(reading *glucosecontracts.GlucoseReading) *GlucoseReading {
	if reading == nil {
		return nil
	}
	return &GlucoseReading{
		ID:         reading.ID,
		Value:      reading.Value,
		RecordedAt: reading.RecordedAt,
	}
}

func mapDashboard(dashboard *analysiscontracts.Dashboard) *Dashboard {
	if dashboard == nil {
		return nil
	}

	activityTrends := make([]*ActivityTrend, 0, len(dashboard.ActivityTrends))
	for _, trend := range dashboard.ActivityTrends {
		item := &ActivityTrend{
			Date:             trend.Date,
			StepCount:        trend.StepCount,
			DurationMinutes:  trend.DurationMinutes,
			SedentaryMinutes: trend.SedentaryMinutes,
			AverageHeartRate: trend.AverageHeartRate,
		}
		activityTrends = append(activityTrends, item)
	}

	glucoseTrends := make([]*GlucoseTrend, 0, len(dashboard.GlucoseTrends))
	for _, trend := range dashboard.GlucoseTrends {
		item := &GlucoseTrend{
			Date:         trend.Date,
			AverageValue: trend.AverageValue,
			ReadingCount: trend.ReadingCount,
		}
		glucoseTrends = append(glucoseTrends, item)
	}

	alerts := make([]*Alert, 0, len(dashboard.Alerts))
	for _, alert := range dashboard.Alerts {
		item := &Alert{
			Code:     alert.Code,
			Message:  alert.Message,
			Severity: alert.Severity,
		}
		alerts = append(alerts, item)
	}

	return &Dashboard{
		Patient:        mapUser(dashboard.Patient),
		From:           dashboard.From,
		To:             dashboard.To,
		ActivityTrends: activityTrends,
		GlucoseTrends:  glucoseTrends,
		Alerts:         alerts,
		Summary: &DashboardSummary{
			TotalSteps:            dashboard.Summary.TotalSteps,
			AverageHeartRate:      dashboard.Summary.AverageHeartRate,
			TotalActiveMinutes:    dashboard.Summary.TotalActiveMinutes,
			TotalSedentaryMinutes: dashboard.Summary.TotalSedentaryMinutes,
			AverageGlucose:        dashboard.Summary.AverageGlucose,
			GlucoseReadingCount:   dashboard.Summary.GlucoseReadingCount,
		},
	}
}
