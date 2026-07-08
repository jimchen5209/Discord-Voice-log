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

1. **Generate Prisma Client**:
   ```bash
   pnpm db:generate
   ```

2. **Build the Project**:
   Build the project so that the `dist` folder is available:
   ```bash
   pnpm build:prod
   ```

3. **Migrate Config**:
   Run the bot once to migrate `config.json` to new version:
   ```bash
   node dist
   ```
   *The bot will exit immediately after backup adbdmigrating config.*

4. **Initialize SQLite Database**:
   Run the following command to create the SQLite database and apply the initial schema:
   ```bash
   pnpm db:migrate
   ```

5. **Prepare MongoDB Dump**:
   Export your MongoDB collection to a JSON file using `mongoexport`:

   ```bash
   mongoexport --uri="mongodb://your-mongo-uri" --collection=ServerConfig --out=mongo_dump.json
   ```

   *Note: If your MongoDB instance requires authentication, you must add the `--authenticationDatabase=admin` flag to the command.*

   For example, default config in previous version:

   ```bash
   mongoexport --uri="mongodb://localhost:27017/VoiceLog" --collection=serverConfig --out=mongo_dump.json
   ```

   Place the resulting `mongo_dump.json` file in the project root directory.

6. **Run Data Migration**:
   Start the bot again. The bot will detect the `mongo_dump.json` and `config.json`, and perform the data migration to SQLite during the boot sequence:
   ```bash
   node dist
   ```

   _Note: If your dump file has a different name or location, you can pass the path via an environment variable when starting the bot:_

   ```bash
   MONGODB_DUMP_PATH="./my_custom_dump.json" node dist
   ```
7. **Verification**:
   After the bot starts, check if the `voice-log.db` file contains the migrated data using Prisma Studio:
   ```bash
   pnpm db:studio
   ```

## 4. Development Notes

- To view or edit data manually: `npx prisma studio`
- To update the schema:
  1. Modify `prisma/schema.prisma`
  2. Run `pnpm db:migrate`
  3. Run `pnpm db:generate`
