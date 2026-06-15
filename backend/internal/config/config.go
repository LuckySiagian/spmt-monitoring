package config

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

const defaultJWTSecret = "default-secret-change-me"

type Config struct {
	Env           string
	DBHost        string
	DBPort        string
	DBUser        string
	DBPassword    string
	DBName        string
	DBSSLMode     string
	JWTSecret     string
	JWTExpiryHours  int
	ServerPort      string
	FrontendURL     string
	AllowedOrigins  []string
	TurnstileSecret string
	SMTPHost        string
	SMTPPort        int
	SMTPUser        string
	SMTPPass        string
	SMTPFrom        string
	TelegramToken   string
	TelegramChatID  string
	ReportWeekday   int // 0=Sunday ... 1=Monday ... 6=Saturday
	ReportHour      int // 0-23, server local time
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	jwtExpiry, _ := strconv.Atoi(getEnv("JWT_EXPIRY_HOURS", "24"))

	cfg := &Config{
		Env:            getEnv("APP_ENV", "development"),
		DBHost:         getEnv("DB_HOST", "localhost"),
		DBPort:         getEnv("DB_PORT", "5432"),
		DBUser:         getEnv("DB_USER", "postgres"),
		DBPassword:     getEnv("DB_PASSWORD", ""),
		DBName:         getEnv("DB_NAME", "spmt_monitoring"),
		DBSSLMode:      getEnv("DB_SSLMODE", "disable"),
		JWTSecret:       getEnv("JWT_SECRET", defaultJWTSecret),
		JWTExpiryHours:  jwtExpiry,
		ServerPort:      getEnv("SERVER_PORT", "8080"),
		FrontendURL:     getEnv("FRONTEND_URL", "http://localhost:5173"),
		AllowedOrigins:  parseCSV(getEnv("ALLOWED_ORIGINS", "")),
		TurnstileSecret: getEnv("TURNSTILE_SECRET", ""),
		SMTPHost:        getEnv("SMTP_HOST", "smtp.gmail.com"),
		SMTPPort:        getEnvInt("SMTP_PORT", 587),
		SMTPUser:        getEnv("SMTP_USER", ""),
		SMTPPass:        getEnv("SMTP_PASS", ""),
		SMTPFrom:        getEnv("SMTP_FROM", ""),
		TelegramToken:   getEnv("TELEGRAM_BOT_TOKEN", ""),
		TelegramChatID:  getEnv("TELEGRAM_CHAT_ID", ""),
		ReportWeekday:   getEnvInt("REPORT_WEEKDAY", 1), // default Monday
		ReportHour:      getEnvInt("REPORT_HOUR", 8),    // default 08:00
	}

	isProd := strings.EqualFold(cfg.Env, "production") || strings.EqualFold(cfg.Env, "prod")

	// Guard: never run production with the insecure default JWT secret — anyone
	// who knows it can forge admin tokens. Fail fast instead of silently booting.
	if cfg.JWTSecret == defaultJWTSecret || cfg.JWTSecret == "" {
		if isProd {
			return nil, fmt.Errorf("JWT_SECRET must be set to a strong value in production (it is currently the insecure default)")
		}
		log.Println("⚠️  WARNING: JWT_SECRET is the insecure default — set a strong JWT_SECRET before deploying to production.")
	}

	// Guard: a wide-open CORS policy (any origin) in production is a misconfiguration.
	if len(cfg.AllowedOrigins) == 0 {
		if isProd {
			return nil, fmt.Errorf("ALLOWED_ORIGINS must list the frontend origin(s) in production (CORS would otherwise accept any origin)")
		}
		log.Println("⚠️  WARNING: ALLOWED_ORIGINS is empty — CORS accepts ANY origin (dev only). Set it before deploying to production.")
	}

	return cfg, nil
}

// parseCSV splits a comma-separated env value into a trimmed, non-empty slice.
func parseCSV(raw string) []string {
	var out []string
	for _, part := range strings.Split(raw, ",") {
		if t := strings.TrimSpace(part); t != "" {
			out = append(out, t)
		}
	}
	return out
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

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		i, _ := strconv.Atoi(v)
		return i
	}
	return fallback
}
