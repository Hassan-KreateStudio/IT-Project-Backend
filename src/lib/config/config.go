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
	RedisURL       string
	MigrationsDir  string
	ResendAPIKey   string
	MailFrom       string
	AuthDebugCodes bool
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
		Port:           port,
		JWTSecret:      strings.TrimSpace(os.Getenv("JWT_SECRET")),
		Neo4jURI:       strings.TrimSpace(os.Getenv("NEO4J_URI")),
		Neo4jUser:      envOr("NEO4J_USER", "neo4j"),
		Neo4jPassword:  os.Getenv("NEO4J_PASSWORD"),
		Neo4jDatabase:  database,
		RedisURL:       strings.TrimSpace(os.Getenv("REDIS_URL")),
		MigrationsDir:  migrationsDir,
		ResendAPIKey:   strings.TrimSpace(os.Getenv("RESEND_API_KEY")),
		MailFrom:       strings.TrimSpace(os.Getenv("MAIL_FROM")),
		AuthDebugCodes: truthy(os.Getenv("AUTH_DEBUG_CODES")),
	}
}

func envOr(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func truthy(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
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
