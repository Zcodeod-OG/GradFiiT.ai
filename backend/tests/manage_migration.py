"""
Alembic Migration Management Script
"""

import sys
from pathlib import Path
import subprocess

sys.path.insert(0, str(Path(__file__).parent.parent))


def run_command(cmd: list[str]) -> int:
    """Run shell command and return exit code."""
    print(f"Running: {' '.join(cmd)}")
    print("-" * 60)
    result = subprocess.run(cmd, cwd="backend")
    print("-" * 60)
    return result.returncode


def create_migration(message: str = "auto migration"):
    """Create new migration."""
    print(f"📝 Creating migration: {message}")
    return run_command([
        "alembic", "revision", "--autogenerate", "-m", message
    ])


def upgrade_database(revision: str = "head"):
    """Upgrade database to revision."""
    print(f"⬆️  Upgrading database to: {revision}")
    return run_command(["alembic", "upgrade", revision])


def downgrade_database(revision: str = "-1"):
    """Downgrade database by revision."""
    print(f"⬇️  Downgrading database to: {revision}")
    return run_command(["alembic", "downgrade", revision])


def show_current():
    """Show current migration."""
    print("📍 Current migration:")
    return run_command(["alembic", "current"])


def show_history():
    """Show migration history."""
    print("📜 Migration history:")
    return run_command(["alembic", "history", "--verbose"])


def show_heads():
    """Show head revisions."""
    print("🎯 Head revisions:")
    return run_command(["alembic", "heads"])


def main():
    """Main CLI."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Manage Alembic migrations")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # Create migration
    create_parser = subparsers.add_parser("create", help="Create new migration")
    create_parser.add_argument("message", help="Migration message")
    
    # Upgrade
    upgrade_parser = subparsers.add_parser("upgrade", help="Upgrade database")
    upgrade_parser.add_argument(
        "revision",
        nargs="?",
        default="head",
        help="Target revision (default: head)"
    )
    
    # Downgrade
    downgrade_parser = subparsers.add_parser("downgrade", help="Downgrade database")
    downgrade_parser.add_argument(
        "revision",
        nargs="?",
        default="-1",
        help="Target revision (default: -1)"
    )
    
    # Current
    subparsers.add_parser("current", help="Show current migration")
    
    # History
    subparsers.add_parser("history", help="Show migration history")
    
    # Heads
    subparsers.add_parser("heads", help="Show head revisions")
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 1
    
    # Execute command
    if args.command == "create":
        return create_migration(args.message)
    elif args.command == "upgrade":
        return upgrade_database(args.revision)
    elif args.command == "downgrade":
        return downgrade_database(args.revision)
    elif args.command == "current":
        return show_current()
    elif args.command == "history":
        return show_history()
    elif args.command == "heads":
        return show_heads()
    
    return 0


if __name__ == "__main__":
    sys.exit(main())