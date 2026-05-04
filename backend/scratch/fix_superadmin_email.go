package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	connStr := fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s",
		os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"), os.Getenv("DB_HOST"), os.Getenv("DB_PORT"), os.Getenv("DB_NAME"), os.Getenv("DB_SSLMODE"),
	)
	pool, err := pgxpool.New(context.Background(), connStr)
	if err != nil {
		log.Fatalf("Koneksi Gagal: %v", err)
	}
	defer pool.Close()

	ctx := context.Background()
	targetEmail := "situkko135@gmail.com"

	// 1. Clear email from any other user who has it (biar nggak bentrok UNIQUE constraint)
	_, err = pool.Exec(ctx, "UPDATE users SET email = NULL WHERE email = $1 AND username != 'superadmin'", targetEmail)
	if err != nil {
		log.Printf("Gagal clear email lama: %v", err)
	}

	// 2. Set email for superadmin
	_, err = pool.Exec(ctx, "UPDATE users SET email = $1 WHERE username = 'superadmin'", targetEmail)
	if err != nil {
		fmt.Printf("❌ Gagal update superadmin: %v\n", err)
	} else {
		fmt.Printf("✅ BERHASIL! Email superadmin sekarang: %s\n", targetEmail)
		fmt.Printf("Sekarang superadmin akan menerima notifikasi otomatis ke gmail tersebut.\n")
	}
}
