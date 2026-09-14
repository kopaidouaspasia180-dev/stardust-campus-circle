# Forward-only migrations

`001_initial_schema` is deliberately sourced from `../schema.sql` so an already-deployed database that recorded the legacy migration ID remains compatible.

Every later database change must be added here as an immutable file named `NNN_descriptive_name.sql`, for example `002_add_order_note_index.sql`. The migration runner applies files in lexical order, records a SHA-256 checksum, and refuses a changed migration that has already run.

Do not alter `schema.sql` after the initial production database is created. Add a new migration instead.
