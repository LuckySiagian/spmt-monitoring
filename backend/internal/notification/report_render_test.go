package notification

import (
	"strings"
	"testing"
	"time"
)

// sampleReportData mirrors the shape of a real weekly digest (a few monitors with
// mixed uptime), so the render assertions read close to production output.
func sampleReportData() weeklyReportData {
	return weeklyReportData{
		PeriodStart:        time.Date(2026, 6, 7, 8, 0, 0, 0, time.UTC),
		PeriodEnd:          time.Date(2026, 6, 13, 8, 0, 0, 0, time.UTC),
		TotalMonitors:      4,
		OverallUptime:      79.996,
		PrevOverallUptime:  68.006,
		HasPrev:            true,
		TotalIncidents:     4,
		PrevTotalIncidents: 2,
		TotalDowntime:      6 * 24 * time.Hour,
		AvgIncidentDur:     36 * time.Hour,
		LongestIncident:    48 * time.Hour,
		MTBF:               134 * time.Hour,
		AvgRT:              305,
		PrevAvgRT:          311,
		MinRT:              14,
		MaxRT:              840,
		Peaks:              0,
		Sites: []siteReport{
			{Name: "www.reddit.com", URL: "https://www.reddit.com", UptimePct: 68.115, Incidents: 1, HasData: true},
			{Name: "travel.pelindo.co.id", URL: "https://travel.pelindo.co.id", UptimePct: 68.116, Incidents: 1, HasData: true},
			{Name: "peluit.pelindo.co.id", URL: "https://peluit.pelindo.co.id", UptimePct: 83.752, Incidents: 2, HasData: true},
			{Name: "store.steampowered.com", URL: "https://store.steampowered.com", UptimePct: 100, Incidents: 0, HasData: true},
		},
	}
}

func TestBuildUptimeReportHTML(t *testing.T) {
	html := buildUptimeReportHTML(sampleReportData(), "https://dash.example")

	for _, want := range []string{
		"Laporan Uptime Mingguan",
		"7 Jun – 13 Jun 2026", // period
		"4 monitor",
		"79.996%",  // headline uptime
		"68.115%",  // worst monitor
		"83.752%",  // mid monitor
		"100%",     // healthy monitor
		"2 insiden",         // peluit
		"Tidak ada insiden", // steam
		"Rata-rata respons",
		"305 ms",
		"14 / 840 ms", // min/max
		"6 hari",      // total downtime
		"https://dash.example",
		"dari minggu lalu", // a week-over-week delta badge rendered
	} {
		if !strings.Contains(html, want) {
			t.Errorf("report missing %q", want)
		}
	}

	// A format-verb / argument mismatch shows up as Go's "%!" marker — catch it.
	if strings.Contains(html, "%!") {
		t.Errorf("report has a format error (%%! marker present)")
	}
}

func TestBuildUptimeReportHTML_SortedByLowestUptime(t *testing.T) {
	html := buildUptimeReportHTML(sampleReportData(), "https://dash.example")

	order := []string{"www.reddit.com", "travel.pelindo.co.id", "peluit.pelindo.co.id", "store.steampowered.com"}
	last := -1
	for _, name := range order {
		i := strings.Index(html, name)
		if i == -1 {
			t.Fatalf("monitor %q not found in report", name)
		}
		if i < last {
			t.Errorf("monitor %q out of order (expected lowest-uptime first)", name)
		}
		last = i
	}
}

func TestBuildUptimeReportHTML_NoPrevWeek(t *testing.T) {
	d := sampleReportData()
	d.HasPrev = false
	html := buildUptimeReportHTML(d, "https://dash.example")

	if strings.Contains(html, "dari minggu lalu") {
		t.Errorf("delta badges should be hidden when there is no previous-week data")
	}
}

func TestFmtPct(t *testing.T) {
	cases := map[float64]string{
		100:    "100%",
		79.996: "79.996%",
		99.9:   "99.9%",
		68.115: "68.115%",
		0:      "0%",
	}
	for in, want := range cases {
		if got := fmtPct(in); got != want {
			t.Errorf("fmtPct(%v) = %q, want %q", in, got, want)
		}
	}
}

func TestHumanDurID(t *testing.T) {
	cases := []struct {
		d    time.Duration
		want string
	}{
		{0, "0 menit"},
		{30 * time.Second, "<1 menit"},
		{90 * time.Second, "1 menit"},
		{2 * time.Hour, "2 jam"},
		{(2*60 + 15) * time.Minute, "2 jam 15 menit"},
		{25 * time.Hour, "1 hari 1 jam"},
		{48 * time.Hour, "2 hari"},
	}
	for _, c := range cases {
		if got := humanDurID(c.d); got != c.want {
			t.Errorf("humanDurID(%v) = %q, want %q", c.d, got, c.want)
		}
	}
}

func TestUptimeColor(t *testing.T) {
	cases := map[float64]string{
		100:   "#10b981",
		99.95: "#10b981",
		99.5:  "#22c55e",
		97:    "#f59e0b",
		80:    "#ef4444",
	}
	for in, want := range cases {
		if got := uptimeColor(in); got != want {
			t.Errorf("uptimeColor(%v) = %q, want %q", in, got, want)
		}
	}
}

func TestMonitorRow_EscapesAndHandlesNoData(t *testing.T) {
	row := monitorRow(siteReport{Name: "a<b>&c", URL: "https://x?q=1&y=2", HasData: false})
	if strings.Contains(row, "<b>") {
		t.Errorf("monitor name not HTML-escaped: %s", row)
	}
	if !strings.Contains(row, "—") {
		t.Errorf("no-data monitor should show an em dash for uptime")
	}
	if !strings.Contains(row, "Tidak ada insiden") {
		t.Errorf("zero incidents should read 'Tidak ada insiden'")
	}
}
