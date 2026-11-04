package contracts

import (
	"time"

	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/contracts"
)

type ActivityTrend struct {
	Date             string
	StepCount        int
	DurationMinutes  int
	SedentaryMinutes int
	AverageHeartRate *float64
}

type GlucoseTrend struct {
	Date         string
	AverageValue float64
	ReadingCount int
}

type Alert struct {
	Code     string
	Message  string
	Severity string
}

type DashboardSummary struct {
	TotalSteps            int
	AverageHeartRate      *float64
	TotalActiveMinutes    int
	TotalSedentaryMinutes int
	AverageGlucose        *float64
	GlucoseReadingCount   int
}

type Dashboard struct {
	Patient        *contracts.User
	From           time.Time
	To             time.Time
	ActivityTrends []ActivityTrend
	GlucoseTrends  []GlucoseTrend
	Alerts         []Alert
	Summary        DashboardSummary
}
