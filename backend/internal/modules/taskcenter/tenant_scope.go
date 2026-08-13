package taskcenter

import (
	"github.com/cxa-maker/one/backend/internal/pkg/adminperm"
	"github.com/cxa-maker/one/backend/internal/pkg/tenantquery"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// applyListTenantScope adds tenant filter from gin context to task list queries.
func (s *Service) applyListTenantScope(c *gin.Context, tx *gorm.DB, tenantColumn string) (*gorm.DB, int64, error) {
	if s == nil || s.DB == nil {
		return nil, 0, gorm.ErrInvalidDB
	}
	tid, err := adminperm.TenantIDFromGin(c)
	if err != nil {
		return nil, 0, err
	}
	if tenantColumn == "" {
		return tenantquery.ScopeTenant(tx, tid), tid, nil
	}
	return tenantquery.ScopeTenant(tx, tid), tid, nil
}

// tenantIDFromGin extracts trusted tenant for task commands.
func tenantIDFromGin(c *gin.Context) (int64, error) {
	return adminperm.TenantIDFromGin(c)
}
