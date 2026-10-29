import fs from 'fs';
const content = fs.readFileSync('C:/Users/eleml/.gemini/antigravity/brain/d5cb20f6-d21a-4243-b5f8-5798d0b64415/.user_uploaded/media_1793262411481_421fee96.csv', 'utf-8');
const lines = content.split(/\r?\n/).filter(Boolean).slice(1);
const filenames = lines.map(l => l.split(',')[0]);
console.log('Total files:', filenames.length);
const withSpaces = filenames.filter(f => f.includes(' '));
console.log('With spaces:', withSpaces.length);
const withUnderscores = filenames.filter(f => f.includes('_'));
console.log('With underscores:', withUnderscores.length, withUnderscores);
