import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from '../src/components/Markdown.js';

test('chat renders Markdown tables and lists without executing HTML or unsafe links', () => {
  const text = '# Results\n\n**Two** leads.\n\n- Check evidence\n\n| Vendor | Status |\n|---|---|\n| Demo | Uncertain |\n\n[Source](https://example.com/invoice)\n\n[Unsafe](javascript:alert%281%29)\n\n<script>alert(1)</script>\n\n![Tracking](https://example.com/pixel)';
  const html = renderToStaticMarkup(createElement(Markdown, { text, onOpen: () => {} }));
  assert.match(html, /<h1>Results<\/h1>/); assert.match(html, /<strong>Two<\/strong>/);
  assert.match(html, /<li>Check evidence<\/li>/); assert.match(html, /<table>/);
  assert.match(html, /href="https:\/\/example.com\/invoice"/);
  assert.doesNotMatch(html, /<script|javascript:|<img/);
});
