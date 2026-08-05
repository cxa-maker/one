package shopee

import platformp "github.com/cxa-maker/one/backend/internal/providers/platform"

// RegisterProvider registers the Shopee beta OrderSync provider.
func RegisterProvider() {
	platformp.Register(NewProvider())
}
