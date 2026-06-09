package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	TotalChecks = promauto.NewCounter(prometheus.CounterOpts{
		Name: "spmt_monitoring_checks_total",
		Help: "The total number of website checking operations",
	})

	FailedChecks = promauto.NewCounter(prometheus.CounterOpts{
		Name: "spmt_monitoring_checks_failed_total",
		Help: "The total number of failed website checking operations",
	})

	WorkerQueueSize = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "spmt_monitoring_worker_queue_size",
		Help: "The number of jobs currently in the worker queue",
	})

	ActiveWorkers = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "spmt_monitoring_active_workers",
		Help: "The number of active concurrent workers in the pool",
	})

	WebsocketClients = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "spmt_monitoring_websocket_clients",
		Help: "The number of active connected WebSocket clients",
	})

	MonitoringDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "spmt_monitoring_check_duration_seconds",
		Help:    "The duration of website check operations in seconds",
		Buckets: prometheus.DefBuckets,
	}, []string{"website_name", "status"})
)
