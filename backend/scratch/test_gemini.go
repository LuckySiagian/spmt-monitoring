package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/google/generative-ai-go/genai"
	"github.com/joho/godotenv"
	"google.golang.org/api/option"
)

func main() {
	// Load .env
	_ = godotenv.Load("../.env")
	apiKey := os.Getenv("GEMINI_API_KEY")
	fmt.Printf("Testing Gemini API key: %s\n", apiKey)

	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		log.Fatalf("Failed to create client: %v", err)
	}
	defer client.Close()

	model := client.GenerativeModel("gemini-2.5-flash")
	resp, err := model.GenerateContent(ctx, genai.Text("Hello, list 3 colors."))
	if err != nil {
		log.Fatalf("GenerateContent error: %v", err)
	}

	for _, candidate := range resp.Candidates {
		for _, part := range candidate.Content.Parts {
			fmt.Println(part)
		}
	}
}
