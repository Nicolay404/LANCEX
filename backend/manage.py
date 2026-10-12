#!/usr/bin/env python
"""Punto de entrada de Django para LANCEX.

Recordatorio (ADR-0003): el esquema se gestiona con SQL en supabase/migrations.
No ejecutar makemigrations, migrate, flush, sqlflush, loaddata ni createsuperuser.
"""

import os
import sys

FORBIDDEN_COMMANDS = {"makemigrations", "migrate", "flush", "sqlflush", "loaddata", "createsuperuser"}


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] in FORBIDDEN_COMMANDS:
        sys.stderr.write(
            f"'{sys.argv[1]}' está prohibido en LANCEX (ADR-0003). "
            "El esquema se gestiona con SQL en supabase/migrations.\n"
        )
        sys.exit(2)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
