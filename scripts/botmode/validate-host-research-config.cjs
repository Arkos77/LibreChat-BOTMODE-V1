const fs = require('node:fs');
const { configSchema } = require('librechat-data-provider');

const result = configSchema.safeParse(JSON.parse(fs.readFileSync(0, 'utf8')));
if (!result.success) {
  for (const issue of result.error.issues) {
    console.error(`${issue.path.join('.')}: ${issue.message}`);
  }
  process.exitCode = 1;
} else {
  console.log('HOST_RESEARCH_CONFIG_SCHEMA=PASS');
}
