package imagetask

import (
	"github.com/gin-gonic/gin"
	"github.com/cxa-maker/one/backend/internal/pkg/response"
	imgprov "github.com/cxa-maker/one/backend/internal/providers/image"
)

// ListProviders GET /api/v1/image/providers
func (h *Handler) ListProviders(c *gin.Context) {
	response.OK(c, imgprov.AllProviderCapabilities())
}
