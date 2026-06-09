package worker

import (
	"sync"
	"time"
)

type asnCacheEntry struct {
	value     string
	createdAt time.Time
}

type ASNCache struct {
	mu       sync.RWMutex
	items    map[string]asnCacheEntry
	ttl      time.Duration
	maxSize  int
}

func NewASNCache(ttl time.Duration, maxSize int) *ASNCache {
	return &ASNCache{
		items:   make(map[string]asnCacheEntry),
		ttl:     ttl,
		maxSize: maxSize,
	}
}

func (c *ASNCache) Get(key string) (string, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	entry, exists := c.items[key]
	if !exists {
		return "", false
	}
	if time.Since(entry.createdAt) > c.ttl {
		return "", false
	}
	return entry.value, true
}

func (c *ASNCache) Set(key, value string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Clear expired entries first to free space
	for k, v := range c.items {
		if time.Since(v.createdAt) > c.ttl {
			delete(c.items, k)
		}
	}

	// Size-based eviction if still exceeds maxSize
	if len(c.items) >= c.maxSize && c.maxSize > 0 {
		var oldestKey string
		var oldestTime time.Time
		first := true
		for k, v := range c.items {
			if first || v.createdAt.Before(oldestTime) {
				oldestKey = k
				oldestTime = v.createdAt
				first = false
			}
		}
		if oldestKey != "" {
			delete(c.items, oldestKey)
		}
	}

	c.items[key] = asnCacheEntry{
		value:     value,
		createdAt: time.Now(),
	}
}
