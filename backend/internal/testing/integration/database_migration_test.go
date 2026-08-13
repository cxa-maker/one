package integration

import (
	"testing"

	"github.com/cxa-maker/one/backend/internal/database"
	"github.com/cxa-maker/one/backend/internal/testing/safeenv"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestAutoMigrateAgainstIsolatedPostgres(t *testing.T) {
	cfg, ok, err := safeenv.TestDatabaseURLFromEnv()
	require.NoError(t, err)
	if !ok {
		t.Skip("TEST_DATABASE_URL is not set; skipping PostgreSQL integration migration test")
	}

	db, err := gorm.Open(postgres.Open(cfg.URL), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	defer sqlDB.Close()

	require.NoError(t, database.AutoMigrate(db))

	for _, table := range []string{"admin_users", "products", "product_skus", "product_publish_tasks", "inventory_sync_tasks"} {
		require.Truef(t, db.Migrator().HasTable(table), "expected migrated table %s", table)
	}
}
