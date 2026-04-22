#!/bin/bash

# Create Alembic migration
# Usage: ./scripts/create_migration.sh "migration message"

MESSAGE=${1:-"auto migration"}

echo "Creating Alembic migration: $MESSAGE"
echo ""

cd backend

# Create migration
alembic revision --autogenerate -m "$MESSAGE"

echo ""
echo "✅ Migration created!"
echo ""
echo "To apply migration:"
echo "  alembic upgrade head"
echo ""
echo "To rollback:"
echo "  alembic downgrade -1"