import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const root = path.resolve(import.meta.dirname, "..");
const localeRoot = path.join(root, "src/locales");
const readCatalog = language => Object.assign({}, ...fs.readdirSync(path.join(localeRoot, language)).filter(file => file.endsWith(".json")).map(file => JSON.parse(fs.readFileSync(path.join(localeRoot, language, file), "utf8"))));
const base = readCatalog("es"), keys = Object.keys(base).sort(), errors = [];
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort().join(",");
const languages = fs.readdirSync(localeRoot).filter(file => fs.statSync(path.join(localeRoot, file)).isDirectory());
for (const language of languages) {
  const catalog = readCatalog(language);
  if (JSON.stringify(Object.keys(catalog).sort()) !== JSON.stringify(keys)) errors.push(`${language}: different catalog keys`);
  for (const key of keys) {
    if (typeof catalog[key] !== "string" || !catalog[key].trim()) errors.push(`${language}: empty ${key}`);
    else if (placeholders(catalog[key]) !== placeholders(base[key])) errors.push(`${language}: broken placeholders ${key}`);
  }
}
function walk(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(path.join(directory, item.name)) : [path.join(directory, item.name)]); }
for (const file of [...walk(path.join(root, "src")), ...walk(path.join(root, "server")), ...walk(path.join(root, "desktop"))].filter(file => /\.(tsx?|cjs)$/.test(file) && !file.includes(path.sep + "locales" + path.sep))) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const add = (node, message) => errors.push(`${path.relative(root, file)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} ${message}`);
  function visit(node) {
    if (ts.isJsxText(node) && /\p{L}/u.test(node.text)) add(node, "UI text must be in a locale catalog");
    if (ts.isJsxAttribute(node) && ["title", "placeholder", "aria-label", "alt", "description"].includes(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer) && /\p{L}/u.test(node.initializer.text)) add(node, "UI attribute must use tr()");
    if (ts.isJsxAttribute(node) && ["title", "placeholder", "aria-label", "alt", "description", "label"].includes(node.name.getText(source)) && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression && ts.isTemplateExpression(node.initializer.expression)) {
      const template = node.initializer.expression;
      if (/\p{L}/u.test(template.head.text + template.templateSpans.map(span => span.literal.text).join(""))) add(node, "UI template must use tr()");
    }
    if (ts.isCallExpression(node) && node.expression.getText(source) === "tr" && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      const key = node.arguments[0].text;
      if (!(key in base) && !(key + ".other" in base)) add(node, `missing key ${key}`);
      for (let ancestor = node.parent; ancestor && !ts.isSourceFile(ancestor); ancestor = ancestor.parent) {
        if (ts.isFunctionLike(ancestor)) break;
        if (ts.isJsxAttribute(ancestor) && ["className", "id"].includes(ancestor.name.getText(source))) { add(node, "Technical identifiers must never be translated"); break; }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
else console.log(`${languages.length} locales checked; ${keys.length} messages per locale; placeholders and UI attributes valid.`);
