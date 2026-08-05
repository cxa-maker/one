package amazon

import platformp "github.com/cxa-maker/one/backend/internal/providers/platform"

// RegisterProvider registers the Amazon beta OrderSync provider (overrides any prior stub).
func RegisterProvider() {
	platformp.Register(NewProvider())
}
