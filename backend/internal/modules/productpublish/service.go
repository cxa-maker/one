package productpublish

import (
	"strings"
	"time"

	"github.com/cxa-maker/one/backend/internal/modules/idempotency"
	"github.com/cxa-maker/one/backend/internal/modules/operationlog"
	"github.com/cxa-maker/one/backend/internal/modules/productcheck"
	"github.com/cxa-maker/one/backend/internal/modules/settings"
	"github.com/cxa-maker/one/backend/internal/modules/shop"
	"github.com/cxa-maker/one/backend/internal/rdb"
	"gorm.io/gorm"
)

// Service wires DB + outbound provider execution for product_publish_tasks.
type Service struct {
	DB          *gorm.DB
	Redis       *rdb.Client
	Shops       *shop.Service
	Settings    *settings.Service
	OpLog       *operationlog.Service
	Readiness   *productcheck.Service
	Idempotency *idempotency.Service

	QueueEnabled bool
	QueueName    string
	TaskTimeout  time.Duration

	BatchMaxProducts int
	BatchMaxTargets  int
	BatchMaxTasks    int
}

func (s *Service) normalizedQueueName() string {
	q := strings.TrimSpace(s.QueueName)
	if q == "" {
		return "product:publish:tasks"
	}
	return q
}
