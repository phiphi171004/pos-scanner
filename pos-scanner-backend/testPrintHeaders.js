const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../api-go.txt');
const buf = fs.readFileSync(filePath);
let content = '';
if (buf[0] === 0xff && buf[1] === 0xfe) content = buf.toString('utf16le');
else if (buf[0] === 0xfe && buf[1] === 0xff) content = buf.toString('utf16be');
else content = buf.toString('utf8');

const lines = content.split(/\r?\n/);
console.log('--- Printing headers of Match #4 (lines 3744 to 3810) ---');
for (let j = 3744; j <= 3810; j++) {
    console.log(`${j}: ${lines[j]}`);
}
