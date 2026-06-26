const fs = require('fs');
let content = fs.readFileSync(__dirname + '/../public/app.js', 'utf8');

// The issue: onclick attributes contain single quotes which conflict 
// with the outer JavaScript single-quoted strings.
// 
// Solution: Replace ALL onclick="..." that contain JS code with 
// onclick using globally-scoped helper functions.

// 1. Find the openSiklusForm function and add helper functions before it
// Actually, the helpers need to be closures. Let me just fix the quotes directly.

// Replace the problematic onclick strings with properly escaped versions:

// Old Batal button pattern (after fixes):
// onclick="const m=document.getElementById('modal-save'); m.style.display=''; const ft=document.querySelector('#modal > div > div.border-t.flex.justify-end:last-child'); if(ft) ft.style.display=''; closeModal()"

// New: Use a simple onclick that calls closeModal and restores footer
// We can't fix this with simple string replace because of nested quotes.
// Instead, let's rewrite the whole openSiklusForm to use template literals.

// Actually, the simplest fix: Find the entire openSiklusForm function and rewrite it.
// Let me find the function boundaries first.

const marker = 'async function openSiklusForm(editing) {';
const start = content.indexOf(marker);

// Find end of function
let idx = start + marker.length;
let braceCount = 0;
let foundOpen = false;
let end = start;
for (let i = idx; i < content.length; i++) {
  if (content[i] === '{') { braceCount++; foundOpen = true; }
  else if (content[i] === '}') { braceCount--; }
  if (foundOpen && braceCount === 0) { end = i + 1; break; }
}

const oldFunc = content.substring(start, end);
console.log('openSiklusForm length:', oldFunc.length);

// Fix single quotes inside onclick="..." throughout the function
// Strategy: Replace all inner single quotes with &apos; HTML entities
// or use template literals for the JS strings

// Actually, the cleanest fix: change all onclick="..." to onclick='...'
// and then use &quot; for HTML entity if needed inside.

// Let me just escape single quotes inside double-quoted onclick attributes
// Replace ' with \' inside onclick="..." blocks

let result = '';
let i = 0;
let inOnclick = false;
let onclickQuote = null;

while (i < content.length - start) {
  let remaining = content.substring(start + i);
  let ch = content[start + i];
  
  // Check for onclick=" or onclick='
  let onclickMatch = remaining.match(/^onclick=(['"])/);
  if (onclickMatch) {
    inOnclick = true;
    onclickQuote = onclickMatch[1];
    result += 'onclick=' + onclickQuote;
    i += 9; // length of 'onclick="' or "onclick='"
    continue;
  }
  
  if (inOnclick && ch === onclickQuote) {
    // Check if this quote is escaped
    if (i > 0 && content[start + i - 1] === '\\') {
      result += ch; // already escaped
      i++;
      continue;
    }
    inOnclick = false;
    result += ch;
    i++;
    continue;
  }
  
  if (inOnclick && ch === "'" && onclickQuote === '"') {
    // Single quote inside double-quoted onclick - escape it!
    result += "\\'";
    i++;
    continue;
  }
  
  if (inOnclick && ch === '"' && onclickQuote === "'") {
    // Double quote inside single-quoted onclick - escape it
    result += '\\"';
    i++;
    continue;
  }
  
  result += ch;
  i++;
}

const newContent = content.substring(0, start) + result + content.substring(end);
fs.writeFileSync(__dirname + '/../public/app.js', newContent, 'utf8');
console.log('Quote escaping applied! Total length:', newContent.length);
