# MongoDB to SQLite Migration Guide

This document describes the process of migrating the project's database from MongoDB to SQLite using Prisma ORM.

## 1. Overview

The database has been moved from MongoDB to SQLite to simplify deployment and reduce dependency on an external database server. We use **Prisma ORM** to manage the SQLite database.

## 2. Technical Changes

- **Database**: MongoDB -> SQLite (`voice-log.db`)
- **ORM**: Mongoose/MongoDB Driver -> Prisma
- **Schema**: Flattened the `voiceMessageTTS` embedded object into separate columns in the `ServerConfig` table.

## 3. How to Migrate Data (from MongoDB Dump)

If you have an existing MongoDB database and want to move the data to the new SQLite setup, follow these steps:

### Prerequisites

- Ensure you have the latest dependencies installed: `pnpm install`

### Execution Steps

1. **Initialize SQLite Database**:
   Run the following command to create the SQLite database and apply the initial schema:

   ```bash
   npx prisma migrate dev --name init_sqlite
   ```

2. **Prepare MongoDB Dump**:
   Export your MongoDB collection to a JSON file using `mongoexport`:

   ```bash
   mongoexport --uri="mongodb://your-mongo-uri" --collection=ServerConfig --out=mongo_dump.json
   ```

   For example, default config in previous version:

   ```bash
   mongoexport --uri="mongodb://localhost:27017/VoiceLog" --collection=serverConfig --out=mongo_dump.json
   ```

   Place the resulting `mongo_dump.json` file in the project root directory.

   _Note: If your dump file has a different name or location, you can pass the path via an environment variable when starting the bot:_

   ```bash
   MONGODB_DUMP_PATH="./my_custom_dump.json" node dist
   ```

3. **Start the Bot**:
   Start the bot as usual (`node dist` or `pm2`). The bot will automatically detect the dump file and migrate the data to SQLite during the boot sequence.

4. **Verification**:
   After the bot starts, check if the `voice-log.db` file contains the migrated data using Prisma Studio:
   ```bash
   npx prisma studio
   ```

## 4. Development Notes

- To view or edit data manually: `npx prisma studio`
- To update the schema:
  1. Modify `prisma/schema.prisma`
  2. Run `npx prisma migrate dev --name <migration_name>`
  3. Run `npx prisma generate`
