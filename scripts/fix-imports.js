const fs = require('fs');
const path = require('path');

/**
 * Recursively finds all JavaScript files in a directory
 * @param {string} dir - Directory to search
 * @param {Array<string>} fileList - Accumulator for found files
 * @returns {Array<string>} List of JavaScript files
 */
function findJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findJsFiles(filePath, fileList);
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

/**
 * Fixes import paths in JavaScript files
 * @param {string} filePath - Path to JavaScript file
 */
function fixImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Fix all relative imports to shared modules
  // This handles TypeScript-generated requires like: require("../../shared/utils")
  content = content.replace(/require\(['"]\.\.\/.\.\.\/shared\//g, 'require("./shared/');
  content = content.replace(/require\(['"]\.\.\/shared\//g, 'require("./shared/');
  content = content.replace(/require\(['"]\.\.\/\.\.\/\.\.\/shared\//g, 'require("./shared/');
  
  // Fix direct imports to specific modules
  content = content.replace(/require\(['"]\.\.\/.\.\.\/utils['"]\)/g, 'require("./shared/utils")');
  content = content.replace(/require\(['"]\.\.\/.\.\.\/constants['"]\)/g, 'require("./shared/constants")');
  content = content.replace(/require\(['"]\.\.\/.\.\.\/logger['"]\)/g, 'require("./shared/logger")');
  content = content.replace(/require\(['"]\.\.\/.\.\.\/metrics['"]\)/g, 'require("./shared/metrics")');
  content = content.replace(/require\(['"]\.\.\/.\.\.\/monitoring['"]\)/g, 'require("./shared/monitoring")');
  content = content.replace(/require\(['"]\.\.\/.\.\.\/dynamodb['"]\)/g, 'require("./shared/dynamodb")');
  content = content.replace(/require\(['"]\.\.\/.\.\.\/error-handler['"]\)/g, 'require("./shared/error-handler")');
  content = content.replace(/require\(['"]\.\.\/.\.\.\/types['"]\)/g, 'require("./shared/types")');
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Fixed imports in ${filePath}`);
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Please provide a directory path');
    process.exit(1);
  }
  
  const dir = args[0];
  console.log(`Fixing imports in ${dir}...`);
  
  const jsFiles = findJsFiles(dir);
  jsFiles.forEach(fixImports);
  
  console.log(`Fixed imports in ${jsFiles.length} files`);
}

main();