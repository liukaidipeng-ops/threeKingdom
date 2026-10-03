// 把 vite build 的产物合成一个自包含的 HTML 片段，用于发布为 claude.ai Artifact。
// Artifact 发布时会自动套上 <!doctype html><head><body> 骨架，所以这里只输出
// <title>、字体、<style>、页面内容和内联脚本。
//
// 用法：npm run build:artifact [-- 输出路径]   默认输出到 dist/artifact.html
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? join(root, 'dist', 'artifact.html'));

execSync('npx vite build', { cwd: root, stdio: 'inherit' });

const dist = join(root, 'dist');
const html = readFileSync(join(dist, 'index.html'), 'utf8');

const pick = (re, what) => {
  const m = html.match(re);
  if (!m) throw new Error(`找不到 ${what}`);
  return m;
};

const [scriptTag, scriptSrc] = pick(/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/, '入口脚本');
const [cssTag, cssHref] = pick(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/, '样式表');
const js = readFileSync(join(dist, scriptSrc), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(dist, cssHref), 'utf8');

const head = pick(/<head>([\s\S]*)<\/head>/, '<head>')[1]
  .replace(scriptTag, '')
  .replace(cssTag, '')
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<meta name="description"[^>]*>\s*/i, '')
  .replace(/<link\s+rel="icon"[\s\S]*?\/>\s*/i, '');
const body = pick(/<body>([\s\S]*)<\/body>/, '<body>')[1];

const page = `${head.trim()}
<style>
${css}
</style>
${body.trim()}
<script type="module">
${js}
</script>
`;

writeFileSync(out, page);
console.log(`已生成 ${out}（${(page.length / 1024).toFixed(1)} KB）`);
