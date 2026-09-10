import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "../src/markdown.js";
import { tabScope, withinScope } from "@close/shared";

test("navigation cannot change the selected Gmail account or Sheet document", () => {
  const gmail = tabScope("https://mail.google.com/mail/u/0/#inbox")!;
  assert.equal(
    withinScope("https://mail.google.com/mail/u/0/#search/invoice", gmail),
    true,
  );
  assert.equal(
    withinScope("https://mail.google.com/mail/u/1/#inbox", gmail),
    false,
  );
  const sheet = tabScope(
    "https://docs.google.com/spreadsheets/d/selected/edit",
  )!;
  assert.equal(
    withinScope("https://docs.google.com/spreadsheets/d/different/edit", sheet),
    false,
  );
  assert.equal(withinScope("https://evil.example/", gmail), false);
  assert.equal(tabScope("https://mail.google.com/mail/#inbox"), null);
});

test("Markdown renders tables and lists without executing HTML, unsafe URLs or remote images", () => {
  const html = renderToStaticMarkup(
    React.createElement(Markdown, {
      text: "## Findings\n\n| Vendor | Amount |\n| --- | --- |\n| Demo | $12 |\n\n- Review first\n\n[Source](https://example.com/invoice)\n\n<script>alert(1)</script>\n\n[Bad](javascript:alert(1))\n\n![tracking](https://example.com/pixel)",
    }),
  );
  assert.match(html, /<table>/);
  assert.match(html, /<li>Review first/);
  assert.match(html, /noopener noreferrer/);
  assert.doesNotMatch(html, /<script|javascript:|<img/);
});
