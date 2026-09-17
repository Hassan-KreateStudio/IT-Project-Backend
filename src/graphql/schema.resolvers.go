package graphql

import (
	"context"
	"time"

	activitycontracts "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/activity/contracts"
	authcontracts "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/contracts"
	authservices "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/services"
)

func (r *mutationResolver) Register(ctx context.Context, email string, password string, displayName string, role Role) (*AuthPayload, error) {
	result, err := r.Auth.Register(ctx, authservices.RegisterInput{
		Email:       email,
		Password:    password,
		DisplayName: displayName,
		Role:        authcontracts.Role(role),
	})
	if err != nil {
		return nil, gqlErr(err)
	}
	return &AuthPayload{Token: result.Token, User: mapUser(result.User)}, nil
}

func (r *mutationResolver) Login(ctx context.Context, email string, password string) (*AuthPayload, error) {
	result, err := r.Auth.Login(ctx, email, password)
	if err != nil {
		return nil, gqlErr(err)
	}
	return &AuthPayload{Token: result.Token, User: mapUser(result.User)}, nil
}

func (r *mutationResolver) LinkCaregiver(ctx context.Context, caregiverEmail string) (*User, error) {
	user, err := requireUser(ctx)
	if err != nil {
		return nil, gqlErr(err)
	}
	caregiver, err := r.Caregiver.Link(ctx, user, caregiverEmail)
	if err != nil {
		return nil, gqlErr(err)
	}
	return mapUser(caregiver), nil
}

func (r *mutationResolver) SyncActivity(ctx context.Context, records []*ActivityRecordInput) ([]*ActivityRecord, error) {
	user, err := requireUser(ctx)
	if err != nil {
		return nil, gqlErr(err)
	}

	inputs := make([]activitycontracts.SyncInput, 0, len(records))
	for _, record := range records {
		if record == nil {
			continue
		}
		inputs = append(inputs, activitycontracts.SyncInput{
			SourceID:         record.SourceID,
			RecordedAt:       record.RecordedAt,
			StepCount:        record.StepCount,
			HeartRate:        record.HeartRate,
			DurationMinutes:  record.DurationMinutes,
			Intensity:        activitycontracts.Intensity(record.Intensity),
			SedentaryMinutes: record.SedentaryMinutes,
		})
	}

	saved, err := r.Activity.Sync(ctx, user, inputs)
	if err != nil {
		return nil, gqlErr(err)
	}

	out := make([]*ActivityRecord, 0, len(saved))
	for _, record := range saved {
		out = append(out, mapActivity(record))
	}
	return out, nil
}

func (r *mutationResolver) AddGlucose(ctx context.Context, value float64, recordedAt time.Time) (*GlucoseReading, error) {
	user, err := requireUser(ctx)
	if err != nil {
		return nil, gqlErr(err)
	}
	reading, err := r.Glucose.Add(ctx, user, value, recordedAt)
	if err != nil {
		return nil, gqlErr(err)
	}
	return mapGlucose(reading), nil
}

func (r *queryResolver) Health(ctx context.Context) (string, error) {
	return "ok", nil
}

func (r *queryResolver) Me(ctx context.Context) (*User, error) {
	user, err := requireUser(ctx)
	if err != nil {
		return nil, gqlErr(err)
	}
	return mapUser(user), nil
}

func (r *queryResolver) MonitoredPatients(ctx context.Context) ([]*User, error) {
	user, err := requireUser(ctx)
	if err != nil {
		return nil, gqlErr(err)
	}
	patients, err := r.Caregiver.ListPatients(ctx, user)
	if err != nil {
		return nil, gqlErr(err)
	}
	return mapUsers(patients), nil
}

func (r *queryResolver) Dashboard(ctx context.Context, from *time.Time, to *time.Time) (*Dashboard, error) {
	user, err := requireUser(ctx)
	if err != nil {
		return nil, gqlErr(err)
	}
	dashboard, err := r.Analysis.OwnDashboard(ctx, user, from, to)
	if err != nil {
		return nil, gqlErr(err)
	}
	return mapDashboard(dashboard), nil
}

func (r *queryResolver) PatientDashboard(ctx context.Context, patientID string, from *time.Time, to *time.Time) (*Dashboard, error) {
	user, err := requireUser(ctx)
	if err != nil {
		return nil, gqlErr(err)
	}
	dashboard, err := r.Analysis.PatientDashboard(ctx, user, patientID, from, to)
	if err != nil {
		return nil, gqlErr(err)
	}
	return mapDashboard(dashboard), nil
}

func (r *Resolver) Mutation() MutationResolver { return &mutationResolver{r} }
func (r *Resolver) Query() QueryResolver       { return &queryResolver{r} }

type mutationResolver struct{ *Resolver }
type queryResolver struct{ *Resolver }
