package engine

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type InferenceEngine struct{}

func NewInferenceEngine() *InferenceEngine {
	return &InferenceEngine{}
}

func (e *InferenceEngine) Infer(telemetry Telemetry, signals []Signal) Conclusion {
	conclusion := Conclusion{
		Status:              StatusUnknown,
		PrimaryRootCauseKey: "UNKNOWN",
		Summary:             "Sistem sedang menganalisis data telemetry.",
		TechnicalDetails:    []string{},
		Recommendation:      "Silakan tunggu analisis selesai.",
		ConfidenceScore:     0,
		HealthScore:         100, // default
		IsBrowserAccessible: true,
		Evidence:            signals,
	}

	// 1. Build Technical Details
	if telemetry.DNSResolved {
		conclusion.TechnicalDetails = append(conclusion.TechnicalDetails, fmt.Sprintf("DNS berhasil resolusi ke IP (%s)", telemetry.IPAddress))
	} else {
		conclusion.TechnicalDetails = append(conclusion.TechnicalDetails, "DNS gagal melakukan resolusi ke IP")
	}

	if telemetry.TCPPortOpen {
		conclusion.TechnicalDetails = append(conclusion.TechnicalDetails, "Koneksi TCP berhasil dibangun")
	} else {
		conclusion.TechnicalDetails = append(conclusion.TechnicalDetails, "Koneksi TCP gagal")
	}

	if telemetry.TCPPortOpen && !telemetry.TLSValid && telemetry.TLSError != "" {
		conclusion.TechnicalDetails = append(conclusion.TechnicalDetails, fmt.Sprintf("Sertifikat keamanan (SSL) bermasalah: %s", telemetry.TLSError))
	} else if telemetry.TCPPortOpen && telemetry.TLSValid {
		conclusion.TechnicalDetails = append(conclusion.TechnicalDetails, "Sertifikat keamanan (SSL) terverifikasi")
	}

	if telemetry.HTTPStatus > 0 {
		conclusion.TechnicalDetails = append(conclusion.TechnicalDetails, fmt.Sprintf("Menerima respons HTTP dengan status %d", telemetry.HTTPStatus))
	}

	// 2. Map Signals for additional context
	sigMap := make(map[string]bool)
	for _, sig := range signals {
		sigMap[sig.Name] = true
	}

	// 3. Evaluate Diagnostic Scenarios (Rule Engine)
	now := time.Now()
	hasStr := func(s, substr string) bool { return strings.Contains(strings.ToLower(s), strings.ToLower(substr)) }

	// Default baseline
	conclusion.Status = StatusOnline
	conclusion.HealthScore = 100
	conclusion.ConfidenceScore = 100
	conclusion.PrimaryRootCauseKey = "ALL_SYSTEMS_NORMAL"
	conclusion.Summary = "Website berjalan normal dan dapat diakses."
	conclusion.Recommendation = "Tidak ada tindakan yang diperlukan."

	// Applying rules in priority order (Highest severity / Most specific overrides others)

	// Skenario 7: High Latency Warning
	if telemetry.HTTPStatus >= 200 && telemetry.HTTPStatus < 400 && telemetry.ResponseTimeMs > 3000 {
		conclusion.Status = StatusOnline
		conclusion.HealthScore = 60
		conclusion.PrimaryRootCauseKey = "HIGH_LATENCY"
		conclusion.Summary = "Website sangat lambat (lebih dari 3 detik untuk merespons)."
		conclusion.Recommendation = "Periksa kondisi server — kemungkinan CPU, memori, atau database sedang kelebihan beban."
	}

	// Skenario 8: SSL Almost Expired
	if telemetry.TLSValid && telemetry.SSLExpiryDate != nil {
		daysLeft := int(telemetry.SSLExpiryDate.Sub(now).Hours() / 24)
		if daysLeft < 7 && daysLeft >= 0 {
			conclusion.Status = StatusOnline
			conclusion.HealthScore = 70
			conclusion.PrimaryRootCauseKey = "SSL_ALMOST_EXPIRED"
			conclusion.Summary = fmt.Sprintf("Sertifikat keamanan (SSL) website ini akan kedaluwarsa dalam %d hari lagi!", daysLeft)
			conclusion.Recommendation = "Segera perbarui sertifikat SSL sebelum kedaluwarsa agar pengguna tidak melihat peringatan keamanan."
		}
	}

	// Skenario 15: Intermittent Packet Loss / High Queue
	if telemetry.NodeHealth.QueueBacklog > 100 || sigMap["HIGH_PACKET_LOSS"] {
		conclusion.Status = StatusOnline
		conclusion.HealthScore = 50
		conclusion.PrimaryRootCauseKey = "NETWORK_INSTABILITY"
		conclusion.Summary = "Jaringan tidak stabil — ada banyak data yang hilang atau antrian server sangat penuh."
		conclusion.Recommendation = "Hubungi penyedia layanan internet (ISP) atau periksa beban server."
	}

	// Skenario 11: Content Missing (404)
	if telemetry.HTTPStatus == 404 {
		conclusion.Status = StatusOnline
		conclusion.HealthScore = 40
		conclusion.PrimaryRootCauseKey = "CONTENT_NOT_FOUND"
		conclusion.Summary = "Halaman utama website tidak ditemukan di server (Error 404)."
		conclusion.Recommendation = "Periksa apakah file atau halaman utama website masih ada dan dapat diakses."
	}

	// Skenario 12: Maintenance Mode
	if telemetry.HTTPStatus == 503 && hasStr(telemetry.ResponseBodyPreview, "maintenance") {
		conclusion.Status = StatusOnline
		conclusion.HealthScore = 50
		conclusion.PrimaryRootCauseKey = "MAINTENANCE_MODE"
		conclusion.Summary = "Website sedang dalam mode pemeliharaan sementara (Maintenance)."
		conclusion.Recommendation = "Ini normal jika memang ada jadwal maintenance. Tunggu sampai selesai."
		conclusion.IsBrowserAccessible = true
	}

	// Skenario 5: Application Crash (502/504)
	if telemetry.HTTPStatus == 502 || telemetry.HTTPStatus == 504 {
		conclusion.Status = StatusOffline
		conclusion.HealthScore = 0
		conclusion.PrimaryRootCauseKey = "APPLICATION_CRASH"
		conclusion.Summary = "Aplikasi di balik website ini crash atau tidak merespons."
		conclusion.Recommendation = "Tim teknis perlu segera memeriksa log dan kondisi server aplikasi."
		conclusion.IsBrowserAccessible = false
	}

	// Skenario 6: Application Error (500)
	if telemetry.HTTPStatus == 500 {
		conclusion.Status = StatusOffline
		conclusion.HealthScore = 0
		conclusion.PrimaryRootCauseKey = "INTERNAL_SERVER_ERROR"
		conclusion.Summary = "Terjadi error di dalam kode aplikasi website ini."
		conclusion.Recommendation = "Periksa log error aplikasi untuk mengetahui penyebabnya."
		conclusion.IsBrowserAccessible = false
	}

	// Skenario 18: Connection Refused (DB/Backend)
	if telemetry.HTTPStatus >= 500 && (hasStr(telemetry.ResponseBodyPreview, "connection refused") || sigMap["DATABASE_CONNECTION_ERROR"]) {
		conclusion.Status = StatusOffline
		conclusion.HealthScore = 0
		conclusion.PrimaryRootCauseKey = "DB_CONNECTION_REFUSED"
		conclusion.Summary = "Aplikasi gagal terhubung ke database atau layanan pendukung lainnya."
		conclusion.Recommendation = "Periksa apakah server database masih aktif dan dapat dijangkau oleh aplikasi."
		conclusion.IsBrowserAccessible = false
	}

	// Skenario 9: WAF/Firewall Blocking
	if telemetry.HTTPStatus == 403 {
		conclusion.Status = StatusOffline
		conclusion.HealthScore = 0
		conclusion.PrimaryRootCauseKey = "WAF_BLOCKING"
		conclusion.Summary = "Sistem pemantau diblokir oleh firewall/keamanan website (Error 403)."
		conclusion.Recommendation = "Tambahkan IP pemantau ke daftar yang diizinkan (whitelist) di pengaturan keamanan website."
		conclusion.IsBrowserAccessible = false
	}

	// Skenario 16: HTTP Auth Required
	if telemetry.HTTPStatus == 401 {
		conclusion.Status = StatusOffline
		conclusion.HealthScore = 0
		conclusion.PrimaryRootCauseKey = "UNAUTHORIZED_ACCESS"
		conclusion.Summary = "Halaman tiba-tiba terkunci oleh otentikasi (Basic Auth/401)."
		conclusion.Recommendation = "Periksa konfigurasi direktori publik di web server."
		conclusion.IsBrowserAccessible = false
	}

	// Skenario 13: Redirect Loop
	if telemetry.RedirectCount > 10 || sigMap["REDIRECT_LOOP"] {
		conclusion.Status = StatusOffline
		conclusion.HealthScore = 0
		conclusion.PrimaryRootCauseKey = "REDIRECT_LOOP"
		conclusion.Summary = "Terjadi redirect loop tak berujung."
		conclusion.Recommendation = "Periksa konfigurasi aturan redirect (contoh: HTTP ke HTTPS)."
		conclusion.IsBrowserAccessible = false
	}

	// Skenario 20: Content Tampered / Deface
	if sigMap["CONTENT_TAMPERED"] {
		conclusion.Status = StatusCritical
		conclusion.HealthScore = 0
		conclusion.PrimaryRootCauseKey = "DEFACE_DETECTED"
		conclusion.Summary = "Halaman berhasil dimuat tapi checksum/keyword tidak valid (Potensi Deface)."
		conclusion.Recommendation = "Takedown akses publik segera dan periksa integritas file."
		conclusion.IsBrowserAccessible = true
	}

	// Skenario 10: TLS Handshake Timeout / Error
	if telemetry.TCPPortOpen && !telemetry.TLSValid && telemetry.TLSError != "" {
		conclusion.Status = StatusOffline
		conclusion.HealthScore = 0
		conclusion.PrimaryRootCauseKey = "TLS_HANDSHAKE_FAIL"
		conclusion.Summary = "Server bisa dihubungi, namun sertifikat keamanan (SSL) bermasalah atau tidak valid."
		conclusion.Recommendation = "Periksa konfigurasi sertifikat SSL dan pastikan versi keamanan yang digunakan sudah sesuai."
		conclusion.IsBrowserAccessible = false
		
		// Skenario 3: SSL Expired
		if hasStr(telemetry.TLSError, "expired") || (telemetry.SSLExpiryDate != nil && telemetry.SSLExpiryDate.Before(now)) {
			conclusion.PrimaryRootCauseKey = "SSL_EXPIRED"
			conclusion.Summary = "Sertifikat keamanan (SSL) sudah kedaluwarsa. Browser akan memblokir akses pengguna."
			conclusion.Recommendation = "Segera perbarui sertifikat SSL website ini."
		}
		
		// Skenario 14: Invalid SSL Certificate Name
		if hasStr(telemetry.TLSError, "name mismatch") || hasStr(telemetry.TLSError, "certificate is valid for") {
			conclusion.PrimaryRootCauseKey = "SSL_NAME_MISMATCH"
			conclusion.Summary = "Sertifikat keamanan (SSL) tidak cocok dengan nama domain website ini."
			conclusion.Recommendation = "Pasang sertifikat yang mencakup nama domain yang benar."
		}

		// Skenario 19: TLS Protocol Downgrade
		if hasStr(telemetry.TLSError, "protocol version") {
			conclusion.PrimaryRootCauseKey = "TLS_PROTOCOL_ERROR"
			conclusion.Summary = "Server menggunakan standar keamanan yang sudah usang dan tidak didukung lagi."
			conclusion.Recommendation = "Pastikan server mendukung protokol keamanan TLS 1.2 atau TLS 1.3."
		}
	}

	// Skenario 2: Web Server Down
	if telemetry.DNSResolved && !telemetry.TCPPortOpen {
		conclusion.Status = StatusOffline
		conclusion.HealthScore = 0
		conclusion.PrimaryRootCauseKey = "WEB_SERVER_DOWN"
		conclusion.Summary = "Alamat server berhasil ditemukan, tapi server tidak merespons koneksi masuk — kemungkinan server mati atau ada firewall yang memblokir."
		conclusion.Recommendation = "Coba restart layanan web server atau periksa pengaturan firewall."
		conclusion.IsBrowserAccessible = false
	}

	// Skenario 4: DNS Failure
	if !telemetry.DNSResolved {
		conclusion.Status = StatusOffline
		conclusion.HealthScore = 0
		conclusion.PrimaryRootCauseKey = "DNS_RESOLUTION_FAILED"
		conclusion.Summary = "Sistem tidak bisa menemukan server dari nama domain ini — kemungkinan domain tidak aktif atau ada gangguan DNS."
		conclusion.Recommendation = "Periksa apakah domain masih terdaftar dan aktif di registrar domain."
		conclusion.IsBrowserAccessible = false
	}

	// Skenario 1: Complete Outage (Catch all)
	if (!telemetry.DNSResolved || !telemetry.TCPPortOpen) && sigMap["ICMP_FAILED"] {
		conclusion.Status = StatusOffline
		conclusion.HealthScore = 0
		conclusion.PrimaryRootCauseKey = "COMPLETE_OUTAGE"
		conclusion.Summary = "Server mati total — tidak ada respons sama sekali dari jaringan maupun server."
		conclusion.Recommendation = "Segera periksa kondisi fisik server atau hubungi penyedia hosting."
		conclusion.IsBrowserAccessible = false
	}

	// Cleanup response body
	telemetry.ResponseBody = nil
	jsonBytes, err := json.MarshalIndent(telemetry, "", "  ")
	if err == nil {
		conclusion.RawEvidenceJSON = string(jsonBytes)
	}

	return conclusion
}
