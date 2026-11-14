# Data version: rules for contributors

How `pnpm migrate` uses the data version is described in [Upgrading](UPGRADING.md#data-version). When you change the assets format or the database:

- Bump `DATA_VERSION` only for a breaking change to the assets format or where the files live, at most once per PR, with exactly one step for the bump in `ASSET_STEPS` (`src/Migration/assets/steps.ts`; a bump that only moves files has a step that changes nothing, and the move in `src/Migration/assets/layout.ts`).
- Database changes go into a new Prisma migration. Never edit a released migration; this release adds `prisma/migrations/20261108080000_platform_scope`.
- Prisma does not wrap SQLite migrations in a transaction: a migration with more than one statement puts them between `BEGIN;` and `COMMIT;` (with `PRAGMA foreign_keys` outside, where SQLite honours it), so that a failure leaves nothing half done.
