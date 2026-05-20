package observability

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// SPMT_WEBSITE_UP: 1 if website is ONLINE or DEGRADED, 0 if OFFLINE or CRITICAL
	WebsiteUp = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "spmt_website_up",
			Help: "Current health status of the website (1 = UP, 0 = DOWN)",
		},
		[]string{"website_name", "url"},
	)

	// SPMT_PROBE_DURATION_SECONDS: Histogram of response times
	ProbeDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "spmt_probe_duration_seconds",
			Help:    "Duration of successful website probes in seconds",
			Buckets: []float64{0.1, 0.5, 1, 2, 5, 10, 15, 30},
		},
		[]string{"website_name"},
	)

	// SPMT_SIGNAL_DETECTED_TOTAL: Counter for each diagnostic signal
	SignalDetected = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "spmt_signal_detected_total",
			Help: "Total number of diagnostic signals detected (e.g. WAF_BLOCK, HTTP_5XX)",
		},
		[]string{"website_name", "signal_name", "severity"},
	)

	// SPMT_WORKER_QUEUE_SIZE: Current length of the worker jobs channel
	WorkerQueueSize = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "spmt_worker_queue_size",
			Help: "Current number of websites waiting to be probed",
		},
	)

	// SPMT_NETWORK_BASELINE_LATENCY_MS: Quorum latency
	NetworkBaselineLatency = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "spmt_network_baseline_latency_ms",
			Help: "Latency of the monitoring node to internet backbone",
		},
	)
)
