# Contributing to AI Quota Tracker

Thank you for contributing to **AI Quota Tracker**!

## Core Principles for Contributors

1. **Zero Server-Side Data Retention:** Never introduce server-side databases, third-party analytics, tracking pixels, or external network calls that transmit user usage data or credentials.
2. **Shared Pure Logic (`public/js/quota-core.js`):** All usage parsers (`parseUsagePageText`), state transitions (`applyParsedUsageToState`), and smart routing calculations (`evaluateRoutes`) must remain pure functions in `public/js/quota-core.js` so they work identically in the browser (on Vercel) and in Node.js tests.
3. **Least-Privilege Extension Permissions:** Do not add `<all_urls>` or unnecessary permissions to `browser-extension/manifest.json`.
4. **XSS Safety:** Always pass user-supplied or DOM-extracted strings through `escapeHtml()` in `public/index.html`.

## Development Workflow

```bash
# 1. Run the test suite (21 automated tests, zero external dependencies)
npm test

# 2. Start the optional Local Companion server on http://127.0.0.1:3456
npm start
```

## Adding a New LLM Provider

1. Add the initial provider state structure in `getInitialState()` and `getDefaultAccounts()` inside `public/js/quota-core.js`.
2. Add the DOM text parser branch in `parseUsagePageText(providerId, rawText)` and `applyParsedUsageToState()` inside `public/js/quota-core.js`.
3. Add routing candidate scoring in `evaluateRoutes()` inside `public/js/quota-core.js`.
4. Add unit tests with realistic usage page text fixtures in `tests/api.test.js` and verify with `npm test`.
