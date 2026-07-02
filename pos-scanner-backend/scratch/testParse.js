const { parseRawText } = require('../src/utils/logParser');

const sampleHeaders = `
accept: application/json, text/plain, */*
apiclientid: 8465102
cookie: my_test_cookie_123
sign: test_sign_456
storeid: 999
token: test_token_789
x-csrf-token: test_csrf_000
x-signature: test_sig_999
`;

const sampleCurl = `curl 'https://sieuthi-go.vn/api/order2_listProduct' \\
  -H 'cookie: my_curl_cookie_abc' \\
  -H 'token: my_curl_token_def' \\
  -H 'sign: my_curl_sign_ghi' \\
  -H 'storeid: 888' \\
  -H 'x-csrf-token: my_curl_csrf_jkl'`;

console.log('--- TEST 1: Headers ---');
console.log(parseRawText(sampleHeaders));

console.log('\n--- TEST 2: cURL ---');
console.log(parseRawText(sampleCurl));
