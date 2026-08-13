package imagetask

import (
	"github.com/cxa-maker/one/backend/internal/pkg/response"
	imgprov "github.com/cxa-maker/one/backend/internal/providers/image"
	"github.com/gin-gonic/gin"
)

// ListProviders GET /api/v1/image/providers
func (h *Handler) ListProviders(c *gin.Context) {
	response.OK(c, imgprov.AllProviderCapabilities())
}
