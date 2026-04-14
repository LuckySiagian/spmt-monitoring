package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	DBHost        string
	DBPort        string
	DBUser        string
	DBPassword    string
	DBName        string
	DBSSLMode     string
	JWTSecret     string
	JWTExpiryHours int
	ServerPort    string
	FrontendURL   string
}

func Load() (*Config, error) {
	_ = godotenv.Load()
	
	// ✅ SECURITY: Validate critical secrets are set
	if secret := os.Getenv("JWT_SECRET"); secret == "" || secret == "default-secret-change-me" {
		return nil, fmt.Errorf("JWT_SECRET must be set in environment variables (use: openssl rand -base64 32)")
	}

	jwtExpiry, _ := strconv.Atoi(getEnv("JWT_EXPIRY_HOURS", "2")) // ✅ SECURITY: Reduced from 24 to 2 hours

	cfg := &Config{
		DBHost:         getEnv("DB_HOST", "localhost"),
		DBPort:         getEnv("DB_PORT", "5432"),
		DBUser:         getEnv("DB_USER", "postgres"),
		DBPassword:     getEnv("DB_PASSWORD", ""),
		DBName:         getEnv("DB_NAME", "spmt_monitoring"),
		DBSSLMode:      getEnv("DB_SSLMODE", "require"), // ✅ SECURITY: Changed from 'disable' to 'require' for encrypted connections
		JWTSecret:      getEnv("JWT_SECRET", ""),
		JWTExpiryHours: jwtExpiry,
		ServerPort:     getEnv("SERVER_PORT", "8080"),
		FrontendURL:    getEnv("FRONTEND_URL", "http://localhost:5173"),
	}

	return cfg, nil
}

func (c *Config) DSN() string {
	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		c.DBHost, c.DBPort, c.DBUser, c.DBPassword, c.DBName, c.DBSSLMode)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
