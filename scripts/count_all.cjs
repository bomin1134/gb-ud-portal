const fs = require('fs');
const text = fs.readFileSync('src/App.jsx','utf8');
console.log('backticks total:', (text.match(/`/g) || []).length);
console.log('parens open vs close:', (text.match(/\(/g) || []).length, (text.match(/\)/g) || []).length);
console.log('braces { vs }:', (text.match(/\{/g) || []).length, (text.match(/\}/g) || []).length);
