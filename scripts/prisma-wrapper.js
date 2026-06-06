const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(process.cwd(), 'config.json');
const DEFAULT_DB_URL = 'file:./voice-log.db';

function getDatabaseUrl() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (config.sqlite && config.sqlite.databaseUrl) {
        return config.sqlite.databaseUrl;
      }
    }
  } catch (error) {
    console.error('Error reading config.json:', error.message);
  }
  return DEFAULT_DB_URL;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Please provide prisma arguments (e.g., generate, migrate dev)');
  process.exit(1);
}

const dbUrl = getDatabaseUrl();
const env = { ...process.env, DATABASE_URL: dbUrl };

const result = spawnSync('pnpm', ['exec', 'prisma', ...args], {
  env,
  stdio: 'inherit',
  shell: true
});

process.exit(result.status);
