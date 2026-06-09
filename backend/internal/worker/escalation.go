package worker

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/spmt/monitoring/internal/model"
)

func (p *Pool) startEscalationMonitor() {
	ticker := time.NewTicker(1 * time.Minute)
	
	slog.Info("Escalation monitor background worker starting")
	
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-p.ctx.Done():
				slog.Info("Escalation monitor background worker stopping")
				return
			case <-ticker.C:
				p.checkEscalations()
			}
		}
	}()
}

func (p *Pool) checkEscalations() {
	ctx := context.Background()

	// 1. Get all active incidents
	incidents, err := p.repo.GetIncidents(ctx)
	if err != nil {
		slog.Error("Escalation monitor failed to fetch incidents", slog.Any("error", err))
		return
	}

	for _, inc := range incidents {
		// Only check triggered incidents (which means they are completely unacknowledged)
		if inc.Status != "TRIGGERED" {
			continue
		}

		// Check if it has been unacknowledged for more than 5 minutes
		if time.Since(inc.CreatedAt) < 5*time.Minute {
			continue
		}

		// Check if already escalated
		history, err := p.repo.GetIncidentHistory(ctx, inc.ID)
		if err != nil {
			continue
		}

		alreadyEscalated := false
		for _, h := range history {
			if h.Action == "ESCALATE" {
				alreadyEscalated = true
				break
			}
		}

		if alreadyEscalated {
			continue
		}

		// Escalate incident!
		slog.Warn("Escalating unacknowledged incident", slog.String("incident_id", inc.ID.String()), slog.String("title", inc.Title))

		// 1. Log escalation in history
		hist := &model.IncidentHistory{
			IncidentID: inc.ID,
			Username:   "SYSTEM",
			Action:     "ESCALATE",
			Details:    fmt.Sprintf("Incident has been unacknowledged for %s. Escalated to operators.", time.Since(inc.CreatedAt).Round(time.Second)),
		}
		err = p.repo.InsertIncidentHistory(ctx, hist)
		if err != nil {
			slog.Error("Failed to insert escalation history", slog.Any("error", err))
		}

		// 2. Dispatch alert via notification service (Telegram group + Email)
		if p.notif != nil {
			p.notif.NotifyEscalation(inc)
		}
	}
}
