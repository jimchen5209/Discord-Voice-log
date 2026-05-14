# Database Migration: MongoDB $\rightarrow$ SQLite (Prisma ORM)

This document records the complete transition of the project's database layer from MongoDB to SQLite using Prisma ORM.

## 1. Motivation
The migration was implemented to:
- **Simplify Deployment**: Remove the requirement for a running MongoDB server.
- **Improve Performance**: Local SQLite storage reduces network latency for configuration reads.
- **Enhance Type Safety**: Leverage Prisma's auto-generated TypeScript types.
- **Native Node.js usage**: Utilize SQLite's lightweight nature without external dependencies.

## 2. Architectural Changes

### Data Model Mapping
Since SQLite is a relational database, we flattened the MongoDB document structure:

| MongoDB Field | SQLite Column (Prisma) | Type | Note |
| :--- | :--- | :--- | :--- |
| `_id` | `serverID` | `String` | Primary Key |
| `lang` | `lang` | `String` | Default: `en_US` |
| `channelID` | `channelID` | `String` | Default: `""` |
| $\dots$ | $\dots$ | $\dots$ | $\dots$ |
| `voiceMessageTTS` | `ttsEnabled`, `ttsType`, etc. | Mixed | Flattened nested object |

### Implementation Details
- **Prisma Client**: Implemented as a singleton in `src/Core/SQLite/Client.ts`.
- **Compatibility Layer**: The `DbServerConfigManager` in `src/Core/SQLite/Core.ts` implements the same public API as the original MongoDB manager, ensuring zero breaks in business logic.
- **Configuration**: Database connection settings (e.g., `databaseUrl`) are managed via the `sqlite` section in `config.json`.
- **Initialization**: Removed asynchronous event-based connection (`.once('connect')`) in favor of synchronous Prisma client initialization.

## 3. Files Added/Modified

### 📁 New Files
- `prisma/schema.prisma`: The source of truth for the database schema.
- `src/Core/SQLite/Client.ts`: Prisma client instance.
- `src/Core/SQLite/Core.ts`: SQLite implementation of the database manager.
- `src/Core/SQLite/Migration.ts`: Logic for migrating data from MongoDB dumps to SQLite.
- `src/Core/SQLite/db/ServerConfig.ts`: Type definitions for the server configuration.

### 📁 Modified Files
- `src/index.ts`: Updated bot boot sequence and shutdown logic.
- `src/Utils/Config.ts`: Added SQLite configuration support.
- `src/Utils/Instances.ts`: Renamed `mongoDB` $\rightarrow$ `db`.
- `src/Core/Discord/VoiceLog/...`: Updated all imports to use the new SQLite core.

### 🗑️ Deleted
- `src/Core/MongoDB/`: Fully removed.

## 4. Maintenance Guide

### Schema Updates
If you need to add fields to the database:
1. Edit `prisma/schema.prisma`.
2. Run `npx prisma migrate dev --name <migration_name>`.
3. Run `npx prisma generate`.

### Data Inspection
Use Prisma Studio for a GUI view of the data:
```bash
npx prisma studio
```

## 5. Migration Path (Existing Users)
Users with existing MongoDB data can migrate by providing a JSON dump:
1. Export MongoDB data to a JSON file (e.g., `mongo_dump.json`).
2. Place the dump file in the project root.
3. Start the bot; the migration will be performed automatically during the boot sequence.
   *Note: Custom dump paths can be specified by passing the `MONGODB_DUMP_PATH` environment variable during launch.*
