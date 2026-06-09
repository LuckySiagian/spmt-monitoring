package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"github.com/google/generative-ai-go/genai"
	"github.com/google/uuid"
	"github.com/spmt/monitoring/internal/model"
	"google.golang.org/api/option"
)

// ChatWithWebsiteAI interacts with Gemini model using the latest screenshot and website status
func (s *Service) ChatWithWebsiteAI(ctx context.Context, websiteID uuid.UUID, req model.AIChatRequest) (string, error) {
	// 1. Get website info
	website, err := s.repo.GetWebsiteByID(ctx, websiteID)
	if err != nil {
		return "", fmt.Errorf("website not found: %w", err)
	}

	// 2. Get latest log for screenshot and telemetry
	latestLog, err := s.repo.GetLatestLogByWebsite(ctx, websiteID)
	var latestStatus model.LogStatus = model.StatusOnline
	if err != nil {
		latestStatus = model.StatusOffline
	} else if latestLog != nil {
		latestStatus = latestLog.Status
	}

	screenshotBase64 := ""
	telemetryStr := "{}"
	if latestLog != nil && latestLog.RootCause != "" {
		var ev map[string]interface{}
		if err := json.Unmarshal([]byte(latestLog.RootCause), &ev); err == nil {
			if sc, ok := ev["screenshot"].(string); ok {
				screenshotBase64 = sc
			}
			// Clean telemetry payload to avoid overloading tokens
			delete(ev, "screenshot")
			delete(ev, "response_body_preview")
			delete(ev, "page_text_preview")
			if cleanBytes, err := json.MarshalIndent(ev, "", "  "); err == nil {
				telemetryStr = string(cleanBytes)
			}
		}
	}

	// 3. Setup Gemini API key and Client
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return "", errors.New("GEMINI_API_KEY tidak dikonfigurasi di backend (.env). Silakan atur key terlebih dahulu untuk menggunakan fitur Chatbot AI ini.")
	}

	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return "", fmt.Errorf("gagal membuat client Gemini: %w", err)
	}
	defer client.Close()

	modelName := os.Getenv("GEMINI_MODEL")
	if modelName == "" {
		modelName = "gemini-2.5-flash"
	}
	geminiModel := client.GenerativeModel(modelName)

	systemPrompt := fmt.Sprintf(`Anda adalah Web Infrastructure AI Analyst untuk sistem SPMT Monitoring PT Pelabuhan Indonesia (Pelindo).
Tugas Anda adalah memposisikan diri sebagai administrator jaringan berpengalaman yang memeriksa visual website serta telemetri jaringan.

Detail Website:
- Nama: %s
- URL: %s
- Status Terakhir: %s

Raw Jaringan Telemetri:
%s

Petunjuk Khusus:
1. Jika ada screenshot yang disediakan, telaah tampilannya. Apakah halaman tersebut loading (ada spinner), error server (seperti 500, 502, 503, 504), terblokir internet positif/WAF (seperti Cloudflare/Sucuri challenge), halaman login, atau portal dashboard Pelindo yang sukses dimuat?
2. Berikan analisis visual yang jelas dan bahasa yang ramah (gunakan sapaan hangat "Halo!" di awal jika merespons analisis pertama kali).
3. Jelaskan juga data parameter telemetri secara awam agar mudah dimengerti. Misalnya, jika mendapatkan http code 403, jelaskan apa artinya dan mengapa bisa terjadi. Begitu juga jika ada masalah SSL, jelaskan apa itu SSL dengan bahasa yang singkat, padat, jelas, dan mudah dipahami.
4. Bantu pengguna memberikan saran penyelesaian/langkah mitigasi jika website terdeteksi sedang bermasalah.
5. SELALU jawab dalam bahasa Indonesia yang sopan dan profesional.`, website.Name, website.URL, latestStatus, telemetryStr)

	geminiModel.SystemInstruction = &genai.Content{
		Parts: []genai.Part{genai.Text(systemPrompt)},
	}

	// 5. Build Parts
	var parts []genai.Part

	// Add screenshot if available
	if screenshotBase64 != "" {
		imgData, err := base64.StdEncoding.DecodeString(screenshotBase64)
		if err == nil {
			parts = append(parts, genai.ImageData("png", imgData))
		}
	}

	// Add chat history
	historyText := ""
	if len(req.History) > 0 {
		historyText += "Riwayat Percakapan Sebelumnya:\n"
		for _, h := range req.History {
			roleName := "User"
			if h.Role == "model" {
				roleName = "Asisten AI"
			}
			historyText += fmt.Sprintf("- %s: %s\n", roleName, h.Message)
		}
		historyText += "\nPertanyaan Terbaru:\n"
	}

	if historyText != "" {
		parts = append(parts, genai.Text(historyText))
	}

	parts = append(parts, genai.Text(req.Message))

	// 6. Invoke Gemini
	resp, err := geminiModel.GenerateContent(ctx, parts...)
	if err != nil {
		return "", fmt.Errorf("gagal memanggil Gemini API: %w", err)
	}

	if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		return "", errors.New("tidak mendapatkan respons dari model Gemini")
	}

	var responseText string
	for _, part := range resp.Candidates[0].Content.Parts {
		if txt, ok := part.(genai.Text); ok {
			responseText += string(txt)
		}
	}

	return responseText, nil
}
