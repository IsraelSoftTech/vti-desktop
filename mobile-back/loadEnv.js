const path = require('path');
const fs = require('fs');

const localEnv = path.join(__dirname, '.env');
const monorepoEnv = path.join(__dirname, '../../backend/.env');

require('dotenv').config({ path: localEnv });

if (!fs.existsSync(localEnv) && fs.existsSync(monorepoEnv)) {
  require('dotenv').config({ path: monorepoEnv });
}
