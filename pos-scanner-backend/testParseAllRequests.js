const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../api-go.txt');
if (!fs.existsSync(filePath)) {
    console.log('File not found:', filePath);
    process.exit(1);
}

let content = '';
try {
    const buf = fs.readFileSync(filePath);
    if (buf[0] === 0xff && buf[1] === 0xfe) content = buf.toString('utf16le');
    else if (buf[0] === 0xfe && buf[1] === 0xff) content = buf.toString('utf16be');
    else content = buf.toString('utf8');
} catch (err) {
    console.error('Error reading file:', err);
    process.exit(1);
}

const lines = content.split(/\r?\n/);

function inspectFromLine(startIndex) {
    console.log(`\n=== Inspecting request starting around line ${startIndex} ===`);
    let headers = {};
    let payload = null;
    
    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        const nextLine = (lines[i + 1] || '').trim();
        
        if (line.toLowerCase() === 'cookie') {
            headers.cookie = nextLine;
        } else if (line.toLowerCase() === 'token') {
            headers.token = nextLine;
        } else if (line.toLowerCase() === 'sign') {
            headers.sign = nextLine;
        } else if (line.toLowerCase() === 'x-signature') {
            headers.xSignature = nextLine;
        } else if (line.toLowerCase() === 'x-csrf-token') {
            headers.xCsrfToken = nextLine;
        } else if (line.toLowerCase() === 'storeid') {
            headers.storeId = nextLine;
        }
        
        // Payload starts after request headers. In browser logs, it's usually at the end of the section.
        // Let's look for a line starting with { and ending with }
        if (line.startsWith('{') && line.endsWith('}')) {
            try {
                payload = JSON.parse(line);
            } catch (e) {
                payload = line;
            }
            break;
        }
        
        // Stop if we hit the divider -------------------------api2--------------------- or end of request
        if (line.includes('-------------------------api2---------------------')) {
            break;
        }
    }
    
    console.log('Headers:', JSON.stringify(headers, null, 2));
    console.log('Payload:', JSON.stringify(payload, null, 2));
}

inspectFromLine(1);
inspectFromLine(3703);
