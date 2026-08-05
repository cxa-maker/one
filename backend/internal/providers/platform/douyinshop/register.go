package douyinshop

import platformp "github.com/cxa-maker/one/backend/internal/providers/platform"

// RegisterProvider registers the Douyin Shop provider (call after BindShops for token refresh persistence).
func RegisterProvider() {
	platformp.Register(NewProvider())
}
