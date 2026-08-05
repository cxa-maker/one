package lazada

import platformp "github.com/cxa-maker/one/backend/internal/providers/platform"

// RegisterProvider registers the Lazada beta OrderSync provider (overrides planned stub).
func RegisterProvider() {
	platformp.Register(NewProvider())
}
