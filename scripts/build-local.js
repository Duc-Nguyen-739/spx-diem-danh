/**
 * scripts/build-local.js — Gộp GAS template thành 1 file HTML cho test local (chrome).
 *
 * GAS deploy: Code.gs doGet dùng createTemplateFromFile('index').evaluate() — template
 *   index.html có <?!= include('css') ?> / <?!= include('js') ?> nạp từ css.html/js.html
 *   (file .html riêng — GAS không chấp nhận .css/.js vì HtmlService sanitize).
 * Local (file://): trình duyệt không render GAS template → build-local.js thay
 *   các directive include bằng nội dung thật → index.local.html.
 *
 * Usage:
 *   node scripts/build-local.js                              (CLI — ghi index.local.html)
 *   const { build } = require('./build-local.js'); build();  (module — test)
 *
 * index.local.html KHÔNG commit (gitignore + claspignore).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { inlineHtml } = require('./inline-html.js');

const ROOT = path.resolve(__dirname, '..');

function build() {
  const indexPath = path.join(ROOT, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  const bom = html.charCodeAt(0) === 0xfeff ? html.charAt(0) : '';
  if (bom) html = html.slice(1);
  const out = inlineHtml(
    bom + html,
    path.join(ROOT, 'css.html'),
    path.join(ROOT, 'js.html'),
    path.join(ROOT, 'mobile.html'),
    path.join(ROOT, 'lib-jsqr.html'),
    path.join(ROOT, 'lib-quagga.html'),
    path.join(ROOT, 'camera-scan.html'),
    path.join(ROOT, 'camera-css.html')
  );
  if (out.includes('<?!=')) {
    throw new Error('build-local: còn sót directive <?!= ... ?> chưa thay thế — index.html đổi syntax?');
  }
  const outPath = path.join(ROOT, 'index.local.html');
  fs.writeFileSync(outPath, out, 'utf8');
  return out;
}

if (require.main === module) {
  build();
  console.log('index.local.html built (templates resolved)');
}

module.exports = { build };
