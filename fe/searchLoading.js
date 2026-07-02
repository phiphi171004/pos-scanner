const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/App.js');
const buf = fs.readFileSync(filePath);
let content = '';
if (buf[0] === 0xff && buf[1] === 0xfe) content = buf.toString('utf16le');
else if (buf[0] === 0xfe && buf[1] === 0xff) content = buf.toString('utf16be');
else content = buf.toString('utf8');

const lines = content.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('loadingProducts')) {
        console.log(`Line ${i + 1}: ${line}`);
    }
}
