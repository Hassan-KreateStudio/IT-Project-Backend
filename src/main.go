package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	activityrepo "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/activity/repository"
	activitysvc "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/activity/services"
	analysissvc "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/analysis/services"
	authrepo "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/repository"
	authservices "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/auth/services"
	caregiverrepo "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/caregiver/repository"
	caregiversvc "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/caregiver/services"
	glucoserepo "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/glucose/repository"
	glucosesvc "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/glucose/services"
	patientsvc "github.com/Hassan-KreateStudio/IT-Project-Backend/src/domains/patient/services"
	gql "github.com/Hassan-KreateStudio/IT-Project-Backend/src/graphql"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/lib/config"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/middleware"
	neo4jdb "github.com/Hassan-KreateStudio/IT-Project-Backend/src/platform/neo4j"
	redisdb "github.com/Hassan-KreateStudio/IT-Project-Backend/src/platform/redis"
	"github.com/Hassan-KreateStudio/IT-Project-Backend/src/routes"

	"github.com/go-chi/chi/v5"
)

func main() {
	migrateOnly := flag.Bool("migrate-only", false, "run Neo4j migrations and exit")
	flag.Parse()

	cfg := config.Load()
	if cfg.JWTSecret == "" {
		log.Fatal("JWT_SECRET is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	client, err := neo4jdb.ConnectWithRetry(ctx, cfg.Neo4jURI, cfg.Neo4jUser, cfg.Neo4jPassword, cfg.Neo4jDatabase, 30, 2*time.Second)
	cancel()
	if err != nil {
		log.Fatalf("neo4j connect: %v", err)
	}
	defer client.Close(context.Background())

	cache, err := redisdb.Connect(context.Background(), cfg.RedisURL)
	if err != nil {
		log.Fatalf("redis connect: %v", err)
	}
	if cache != nil {
		defer cache.Close()
		log.Printf("redis auth cache enabled")
	} else {
		log.Printf("redis auth cache disabled (REDIS_URL empty)")
	}

	if err := neo4jdb.Migrate(context.Background(), client, cfg.MigrationsDir); err != nil {
		log.Fatalf("neo4j migrate: %v", err)
	}
	if *migrateOnly {
		log.Printf("migrations applied")
		return
	}

	users := authrepo.New(client)
	auth := authservices.New(users, cfg.JWTSecret)
	patients := patientsvc.New(users)
	caregiver := caregiversvc.New(caregiverrepo.New(client))
	activity := activitysvc.New(activityrepo.New(client))
	glucose := glucosesvc.New(glucoserepo.New(client))
	analysis := analysissvc.New(patients, caregiver, activity, glucose)

	resolver := &gql.Resolver{
		Auth:      auth,
		Caregiver: caregiver,
		Activity:  activity,
		Glucose:   glucose,
		Analysis:  analysis,
	}

	app := chi.NewRouter()
	middleware.Apply(app)
	routes.Register(app, client, resolver, auth, cache)

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      app,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("listening on :%s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("shutdown: %v", err)
	}
}
