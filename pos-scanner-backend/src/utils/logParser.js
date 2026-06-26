const fs = require('fs');
const path = require('path');
const ScraperConfig = require('../models/ScraperConfig');

// Resolve path to the workspace root directory (up 3 levels from src/utils)
const workspaceRoot = path.join(__dirname, '../../../');

/**
 * Parses api-go.txt file to extract parameters for GO! / Big C
 */
function parseGoLog() {
    const filePath = path.join(workspaceRoot, 'api-go.txt');
    if (!fs.existsSync(filePath)) {
        return null;
    }

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    const result = {
        cookie: '',
        token: '',
        sign: '',
        storeid: '',
        'x-csrf-token': '',
        'x-signature': '',
        apiclientid: ''
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const nextLine = (lines[i + 1] || '').trim();

        if (!nextLine) continue;

        const lowerLine = line.toLowerCase();
        if (lowerLine === 'cookie') {
            result.cookie = nextLine;
        } else if (lowerLine === 'token') {
            result.token = nextLine;
        } else if (lowerLine === 'sign') {
            result.sign = nextLine;
        } else if (lowerLine === 'storeid') {
            result.storeid = nextLine;
        } else if (lowerLine === 'x-csrf-token') {
            result['x-csrf-token'] = nextLine;
        } else if (lowerLine === 'x-signature') {
            result['x-signature'] = nextLine;
        } else if (lowerLine === 'apiclientid') {
            result.apiclientid = nextLine;
        }
    }

    // Only return if we found at least cookie or token
    if (result.cookie || result.token) {
        return result;
    }
    return null;
}

/**
 * Parses BHX CSV files (bhx.csv and bhx2.csv) to extract parameters for BHX
 */
function parseBhxLog() {
    const paths = [
        path.join(workspaceRoot, 'bhx2.csv'),
        path.join(workspaceRoot, 'bhx.csv')
    ];

    const result = {
        cookie: '',
        authorization: '',
        deviceid: '',
        xapikey: '',
        provinceId: null,
        storeId: ''
    };

    let parsedAny = false;

    for (const filePath of paths) {
        if (!fs.existsSync(filePath)) continue;

        const content = fs.readFileSync(filePath, 'utf8');

        // Regex searches (using multi-line matching)
        const authMatch = /Authorization:\s*Bearer\s+([A-Za-z0-9_-]+)/i.exec(content);
        const deviceTokenMatch = /device_token=([A-Za-z0-9_-]+)/i.exec(content);
        const apiKeyMatch = /Xapikey:\s*([A-Za-z0-9_-]+)/i.exec(content);
        const deviceIdMatch = /Deviceid:\s*([A-Za-z0-9_-]+)/i.exec(content);
        const cookieMatch = /Cookie:\s*([^\r\n"]+)/i.exec(content);
        const provinceMatch = /provinceId=(\d+)/i.exec(content);
        const storeMatch = /storeId=(\d+)/i.exec(content);

        if (authMatch) result.authorization = authMatch[1];
        else if (deviceTokenMatch && !result.authorization) result.authorization = deviceTokenMatch[1];

        if (apiKeyMatch) result.xapikey = apiKeyMatch[1];
        if (deviceIdMatch) result.deviceid = deviceIdMatch[1];
        if (cookieMatch) result.cookie = cookieMatch[1];
        
        if (provinceMatch) result.provinceId = parseInt(provinceMatch[1]);
        if (storeMatch) result.storeId = storeMatch[1];

        parsedAny = true;
    }

    if (parsedAny) {
        return result;
    }
    return null;
}

/**
 * Parses winmart.csv to extract store parameters for WinMart
 */
function parseWinmartLog() {
    const filePath = path.join(workspaceRoot, 'winmart.csv');
    if (!fs.existsSync(filePath)) {
        return null;
    }

    const content = fs.readFileSync(filePath, 'utf8');

    const result = {
        storeCode: '',
        storeGroupCode: '',
        cookie: ''
    };

    const storeCodeRegex = /storeCode=([^&\s\"',\\%]+)/gi;
    const storeGroupCodeRegex = /storeGroupCode=([^&\s\"',\\%]+)/gi;
    const cookieMatch = /Cookie:\s*([^\r\n"]+)/i.exec(content);

    let match;
    const storeCodes = [];
    while ((match = storeCodeRegex.exec(content)) !== null) {
        storeCodes.push(match[1]);
    }

    const storeGroupCodes = [];
    while ((match = storeGroupCodeRegex.exec(content)) !== null) {
        storeGroupCodes.push(match[1]);
    }

    if (storeCodes.length > 0) result.storeCode = storeCodes[0];
    if (storeGroupCodes.length > 0) result.storeGroupCode = storeGroupCodes[0];
    if (cookieMatch) result.cookie = cookieMatch[1];

    if (result.storeCode || result.storeGroupCode) {
        return result;
    }
    return null;
}

/**
 * Automatically parses all logs and saves configurations in MongoDB
 */
async function autoParseAndSaveConfigs() {
    console.log('--- Starting Network Logs Parsing ---');
    
    // 1. GO!
    try {
        const goExists = await ScraperConfig.findOne({ name: 'sieuthi-go' });
        if (!goExists) {
            const goConfig = parseGoLog();
            if (goConfig) {
                console.log('Parsed GO! Log successfully. Store:', goConfig.storeid);
                await ScraperConfig.create({
                    name: 'sieuthi-go',
                    supermarketName: 'GO!',
                    cookie: goConfig.cookie || '',
                    storeId: goConfig.storeid || '',
                    headers: {
                        token: goConfig.token || '',
                        sign: goConfig.sign || '',
                        xCsrfToken: goConfig['x-csrf-token'] || '',
                        xSignature: goConfig['x-signature'] || '',
                        apiclientid: goConfig.apiclientid || '8465102',
                    }
                });
            }
        } else {
            console.log('GO! Config already exists in DB. Skipping overwrite.');
        }
    } catch (err) {
        console.error('Error parsing GO! log:', err.message);
    }

    // 2. BHX
    try {
        const bhxExists = await ScraperConfig.findOne({ name: 'sieuthi-bhx' });
        if (!bhxExists) {
            const bhxConfig = parseBhxLog();
            if (bhxConfig) {
                console.log('Parsed BHX Log successfully. Store:', bhxConfig.storeId, 'Province:', bhxConfig.provinceId);
                await ScraperConfig.create({
                    name: 'sieuthi-bhx',
                    supermarketName: 'Bách Hóa Xanh',
                    cookie: bhxConfig.cookie || '',
                    storeId: bhxConfig.storeId || '2546',
                    provinceId: bhxConfig.provinceId || 1027,
                    headers: {
                        authorization: bhxConfig.authorization || '',
                        deviceid: bhxConfig.deviceid || '',
                        xapikey: bhxConfig.xapikey || 'bhx-api-core-2022',
                    }
                });
            }
        } else {
            console.log('BHX Config already exists in DB. Skipping overwrite.');
        }
    } catch (err) {
        console.error('Error parsing BHX log:', err.message);
    }

    // 3. WinMart
    try {
        const winmartExists = await ScraperConfig.findOne({ name: 'sieuthi-winmart' });
        if (!winmartExists) {
            const winmartConfig = parseWinmartLog();
            if (winmartConfig) {
                console.log('Parsed WinMart Log successfully. StoreCode:', winmartConfig.storeCode, 'GroupCode:', winmartConfig.storeGroupCode);
                await ScraperConfig.create({
                    name: 'sieuthi-winmart',
                    supermarketName: 'WinMart',
                    cookie: winmartConfig.cookie || '',
                    storeCode: winmartConfig.storeCode || '1535',
                    storeGroupCode: winmartConfig.storeGroupCode || '1998',
                });
            }
        } else {
            console.log('WinMart Config already exists in DB. Skipping overwrite.');
        }
    } catch (err) {
        console.error('Error parsing WinMart log:', err.message);
    }
    
    console.log('--- Network Logs Parsing Completed ---');
}

function parseRawText(text) {
    if (!text) return null;
    const lines = text.split(/\r?\n/);
    const result = {
        cookie: '',
        token: '',
        sign: '',
        storeId: '',
        xCsrfToken: '',
        xSignature: '',
        apiclientid: '',
        authorization: '',
        deviceid: '',
        xapikey: '',
        provinceId: '',
        storeCode: '',
        storeGroupCode: ''
    };

    // 1. Check if it's a curl command
    if (text.includes('curl ') || text.includes('-H ') || text.includes('--header ')) {
        const headerRegex = /(?:-H|--header)\s+["']([^"']+)["']/g;
        let match;
        while ((match = headerRegex.exec(text)) !== null) {
            const headerStr = match[1];
            const colonIdx = headerStr.indexOf(':');
            if (colonIdx !== -1) {
                const name = headerStr.substring(0, colonIdx).trim().toLowerCase();
                const value = headerStr.substring(colonIdx + 1).trim();
                mapHeader(name, value, result);
            }
        }
        if (result.cookie) {
            extractParamsFromCookie(result.cookie, result);
        }
        if (result.cookie || result.token || result.authorization) {
            return result;
        }
    }

    // 2. Try parsing line-by-line
    let hasColon = false;
    for (const line of lines) {
        if (line.includes(':') && !line.startsWith('http://') && !line.startsWith('https://')) {
            hasColon = true;
            break;
        }
    }

    if (hasColon) {
        for (const line of lines) {
            const colonIdx = line.indexOf(':');
            if (colonIdx !== -1) {
                const name = line.substring(0, colonIdx).trim().toLowerCase();
                const value = line.substring(colonIdx + 1).trim();
                mapHeader(name, value, result);
            }
        }
    } else {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const nextLine = (lines[i + 1] || '').trim();
            if (!nextLine) continue;
            const name = line.toLowerCase();
            mapHeader(name, nextLine, result);
        }
    }

    if (result.cookie) {
        extractParamsFromCookie(result.cookie, result);
    }

    if (result.cookie || result.token || result.authorization) {
        return result;
    }
    return null;
}

function mapHeader(name, value, result) {
    // Normalizing name to standard format
    const cleanName = name.replace(/^:/, '').trim().toLowerCase();
    if (cleanName === 'cookie') {
        result.cookie = value;
    } else if (cleanName === 'token') {
        result.token = value;
    } else if (cleanName === 'sign') {
        result.sign = value;
    } else if (cleanName === 'storeid' || cleanName === 'store') {
        result.storeId = value;
    } else if (cleanName === 'x-csrf-token') {
        result.xCsrfToken = value;
    } else if (cleanName === 'x-signature') {
        result.xSignature = value;
    } else if (cleanName === 'apiclientid') {
        result.apiclientid = value;
    } else if (cleanName === 'authorization') {
        result.authorization = value;
    } else if (cleanName === 'deviceid') {
        result.deviceid = value;
    } else if (cleanName === 'xapikey') {
        result.xapikey = value;
    } else if (cleanName === 'provinceid') {
        result.provinceId = value;
    } else if (cleanName === 'storecode') {
        result.storeCode = value;
    } else if (cleanName === 'storegroupcode') {
        result.storeGroupCode = value;
    }
}

function extractParamsFromCookie(cookieStr, result) {
    const storeMatch = /storeId=(\d+)/i.exec(cookieStr);
    if (storeMatch && !result.storeId) result.storeId = storeMatch[1];

    const provinceMatch = /provinceId=(\d+)/i.exec(cookieStr);
    if (provinceMatch && !result.provinceId) result.provinceId = provinceMatch[1];
}

module.exports = {
    autoParseAndSaveConfigs,
    parseGoLog,
    parseBhxLog,
    parseWinmartLog,
    parseRawText
};
