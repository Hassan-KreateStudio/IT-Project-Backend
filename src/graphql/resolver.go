package graphql

import (
	activitysvc "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/activity/services"
	analysissvc "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/analysis/services"
	authservices "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/services"
	caregiversvc "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/caregiver/services"
	glucosesvc "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/glucose/services"
	profilesvc "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/profile/services"
)

type Resolver struct {
	Auth      *authservices.Service
	Caregiver *caregiversvc.Service
	Activity  *activitysvc.Service
	Glucose   *glucosesvc.Service
	Profile   *profilesvc.Service
	Analysis  *analysissvc.Service
}
