package config

import (
	"os"
	"strings"
)

type Config struct {
	Port           string
	JWTSecret      string
	Neo4jURI       string
	Neo4jUser      string
	Neo4jPassword  string
	Neo4jDatabase  string
	MigrationsDir  string
}

func Load() Config {
	loadDotEnv(".env")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	database := os.Getenv("NEO4J_DATABASE")
	if database == "" {
		database = "neo4j"
	}

	migrationsDir := os.Getenv("MIGRATIONS_DIR")
	if migrationsDir == "" {
		migrationsDir = "migrations"
	}

	return Config{
		Port:          port,
		JWTSecret:     strings.TrimSpace(os.Getenv("JWT_SECRET")),
		Neo4jURI:      strings.TrimSpace(os.Getenv("NEO4J_URI")),
		Neo4jUser:     envOr("NEO4J_USER", "neo4j"),
		Neo4jPassword: os.Getenv("NEO4J_PASSWORD"),
		Neo4jDatabase: database,
		MigrationsDir: migrationsDir,
	}
}

func envOr(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func loadDotEnv(path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}

	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}

		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		_ = os.Setenv(key, value)
	}
}
