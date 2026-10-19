const fs = require('node:fs');
const path = require('node:path');
const compiled = path.join(__dirname, '../desktop-server/src/lib/i18n.js');
module.exports = require(fs.existsSync(compiled) ? compiled : '../src/lib/i18n.ts');
