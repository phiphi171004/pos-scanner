const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../api-go.txt');
const buf = fs.readFileSync(filePath);
let content = '';
if (buf[0] === 0xff && buf[1] === 0xfe) content = buf.toString('utf16le');
else if (buf[0] === 0xfe && buf[1] === 0xff) content = buf.toString('utf16be');
else content = buf.toString('utf8');

const lines = content.split(/\r?\n/);
let matchCount = 0;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('token') && !line.includes('csrfToken') && !line.includes('device_token')) {
        console.log(`Line ${i}: ${line}`);
        // print next line
        if (i + 1 < lines.length) {
            console.log(`  Next: ${lines[i+1]}`);
        }
    }
}
