const fs = require('fs');
const s = fs.readFileSync('src/web/app.js', 'utf8');
const idx = s.indexOf("const guildId = '");
if (idx === -1) { console.log('pattern not found'); process.exit(1); }
const start = s.lastIndexOf('<script>', idx);
const end = s.indexOf('</script>', idx);
if (start === -1 || end === -1) { console.log('script tags not found'); process.exit(1); }
const sc = s.substring(start + 8, end);
console.log('script length', sc.length);
const count = (ch) => sc.split(ch).length - 1;
console.log('parens:', count('('), count(')'), 'braces:', count('{'), count('}'), 'brackets:', count('['), count(']'), 'backticks:', count('`'), "single:'", count("'"), 'double:"', count('"'));
// Basic balance checks
if (count('(') !== count(')') || count('{') !== count('}') || count('[') !== count(']')) {
  console.log('Unbalanced symbols detected');
  process.exit(2);
}
console.log('Basic balance OK');
// Also check last non-whitespace character to ensure it doesn't end in an incomplete string or comment
const lastChar = sc.trim().slice(-1);
console.log('Last non-ws char:', lastChar);

