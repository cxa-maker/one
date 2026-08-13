package worker

import (
	"net/http"

	"github.com/cxa-maker/one/backend/internal/config"
	"github.com/cxa-maker/one/backend/internal/pkg/response"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Handler serves worker observability APIs.
type Handler struct {
	DB  *gorm.DB
	Cfg *config.Config
}

// Monitor GET /workers/monitor
func (h *Handler) Monitor(c *gin.Context) {
	if h == nil || h.DB == nil {
		response.Fail(c, http.StatusInternalServerError, response.CodeInternalError, "database unavailable")
		return
	}
	out, err := BuildMonitorResponse(c.Request.Context(), h.DB, h.Cfg)
	if err != nil {
		response.Fail(c, http.StatusInternalServerError, response.CodeInternalError, "worker monitor query failed")
		return
	}
	response.OK(c, out)
}
