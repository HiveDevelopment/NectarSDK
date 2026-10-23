# Nectar SDK

Nectar is HivePanel's sandboxed extension system. This package provides a typed browser client, a starter generator, a manifest validator and a cross-platform `.nectar` packager. Version 0.3.0 is the complete first public developer-preview SDK for the capability set documented below. It is ready for extension development and testing; it does not add capabilities that the host has not implemented.

## Start developing

Requires Node.js 22 or newer. From this SDK directory:

```bash
npm ci
npm run build
node bin/nectar.mjs init ../my-extension --id yourname.example --panel-version dev
cd ../my-extension
npm install
npm run build
npm run validate
npm run doctor
npm run pack
```

From a source checkout, the generator references your local SDK using a relative `file:` dependency. Keep that directory available while developing. Once version 0.3.0 has been published to npm, developers can instead use:

```bash
npx --package @hivepanel/nectar@0.3.0 nectar init my-extension --id yourname.example --panel-version dev --sdk-source npm
cd my-extension
npm install
npm run dev
```

Published installations generate a pinned npm dependency automatically, so projects do not depend on a temporary npx cache. Use `--sdk-source local` or `--sdk-source npm` to choose explicitly. The source/tarball route works before publication. See [publishing](docs/PUBLISHING.md) for the maintainer release steps.

`panelCompatibility` is an **exact** match for Panel's `config('nectar.panel_version')`, which defaults to `dev`. Set `--panel-version` to your deployment's `NECTAR_PANEL_VERSION`; semver ranges such as `>=1.0.0` are not supported by the current host.

## Install in a development Panel

Use the Panel integration shipped with SDK 0.1.1. SDK 0.3.0 includes an optional Panel page-layout patch for borderless content and automatic iframe height. Apply those two Vue files and rebuild Panel for that presentation; the API still uses the existing integration. No Worker changes are needed. Existing extensions using the v1 bridge remain supported.

1. Upload the generated `.nectar` archive in **Admin → Extensions → Install**.
2. Review its declared permissions and configure its settings.
3. Approve network access if requested, then enable the extension.
4. Open its sidebar page. The starter appears under **Tools → Hello Nectar**.

Alternatively, copy the archive into the Panel application container and run `php artisan nectar:install /path/to/extension.nectar`. Installation leaves it disabled. That path must exist inside the container.

For this host version, replacing an installed extension requires disabling and uninstalling it before installing its rebuilt archive. Back up any extension settings first. Use a disposable development Panel.

## Client API

```ts
import { applyTheme, createNectar, decodeBody, NectarError } from '@hivepanel/nectar';

const nectar = createNectar();
const { cellId, ui } = await nectar.ready;
applyTheme(ui);
const stopThemeUpdates = nectar.onUI(next => applyTheme(next));
const cells = await nectar.cells.list();
const settings = await nectar.settings.get<{ greeting: string }>();

// Replaces this frame's subscribed event set after the host authorizes it.
const stopEvents = nectar.events.on(({ event, cell }) => console.log(event, cell.id));
await nectar.events.subscribe(['cell.updated']);
await nectar.events.subscribe([]); // Stop subscriptions/polling.

stopThemeUpdates();
stopEvents();
nectar.dispose(); // Call when your page/component unmounts.
```

Create one client per iframe. Call `ready` before reading `context`. All capability methods wait for readiness automatically. The host scopes requests to the signed-in user; the SDK cannot add authority by supplying an extension ID or token.

| API | Result | Declaration |
| --- | --- | --- |
| `ready` | `{ cellId, ui }` | None |
| `cells.list()` | Array of visible Cells, at most 100 before Comb filtering | `cells.read` |
| `settings.get<T>()` | Nonsecret administrator-configured settings | `settings.read` |
| `network.http(params)` | `{ status, body_base64 }` | `network.http` and exact host list; admin approval |
| `network.tcp(params)` | Worker session/result | `network.tcp`, `cell-allocations`; admin approval and Cell console-send permission |
| `events.subscribe(names)` | `{ ok: true }`, rejects on denial | `cells.read` and matching `events.subscribe` |
| `events.on(handler)` | Unsubscribe function | Local listener only |
| `onUI(handler)` | Unsubscribe function | Theme/locale updates |
| `dispose()` | Releases listeners and pending requests | Call on unmount |

Cell fields: `id`, `name`, `comb`, `allocations`, `installStatus`. **These are not live CPU/RAM or power-state telemetry.** Allocations are returned only where TCP permission and user authorization allow them. `cellId` is set on Cell pages/widgets and null on dashboard pages.

`NectarError` exposes `code` and optional `status`. Codes include `NOT_EMBEDDED`, `HANDSHAKE_TIMEOUT`, `REQUEST_TIMEOUT`, `TOO_MANY_REQUESTS`, `CAPABILITY_FAILED` and `DISPOSED`. The client permits ten concurrent requests. Default handshake timeout is 10 seconds; request timeout is 15 seconds. Adjust with `createNectar({ handshakeTimeoutMs, timeoutMs })`.

### HTTPS gateway

Manifest additions:

```json
{
  "permissions": ["network.http"],
  "network": { "http": { "hosts": ["api.example.com"] } }
}
```

Merge these with your other permissions rather than replacing required capabilities.

```ts
const response = await nectar.network.http({ url: 'https://api.example.com/catalogue', method: 'GET' });
if (response.status < 200 || response.status >= 300) throw new Error(`Remote API returned ${response.status}`);
const data = JSON.parse(decodeBody(response));
```

Only GET/POST to explicitly approved public HTTPS hostnames on port 443 are supported. Redirects, private destinations and custom authentication headers are not supported. Maximum request body: 16 KiB; response body: 1 MiB. A completed gateway call can still contain a remote 4xx/5xx status: check it yourself. Network requests are rate-limited and audited without logging payloads.

### TCP gateway

Declare `network.tcp` plus `"network": { "tcp": { "scope": "cell-allocations" } }`. Select an assigned allocation returned by `cells.list()`:

```ts
const connection = await nectar.network.tcp({ cell_id: cell.id, allocation_id: allocation.id, action: 'open' });
try {
    const result = await nectar.network.tcp({
        cell_id: cell.id, allocation_id: allocation.id, action: 'exchange',
        session_id: connection.session_id, data_base64: btoa('hello\n'), read_line: true,
    });
    // result.data_base64 contains the response bytes. Use Uint8Array for binary protocols.
} finally {
    await nectar.network.tcp({ cell_id: cell.id, allocation_id: allocation.id, action: 'close', session_id: connection.session_id });
}
```

Sessions expire and are scoped to the extension/user/Cell. Arbitrary destinations, UDP and general-purpose sockets are not exposed. Use `read_json` only for a protocol that expects it; protocol-specific code belongs in your extension.

## Pages, widgets and sidebar placement

The generated `nectar.json` is a working example. Change `frontend.pages` to add pages:

```json
{
  "slug": "tools",
  "title": "Server tools",
  "entry": "dist/pages/tools.html",
  "context": "cell",
  "sidebar": { "group": "tools", "icon": "settings" }
}
```

Dashboard pages use `/extensions/<id>/<slug>` and do not require a Cell. Cell pages use `/cells/<cell>/extensions/<id>/<slug>`. Add `frontend.combs`, such as `["game:minecraft"]`, to limit supported Combs. An empty/absent list supports all Combs.

Groups: `extensions`, `overview`, `management`, `automation`, `configuration`, `game`, `tools`. Icons: `puzzle`, `vote`, `settings`, `download`, `network`, `terminal`. Administrators can override page placement. Set `navigation: false` to hide a page's navigation link.

Widget slots: `dashboard.widgets`, `server.console.after`, `server.overview.after`. Declare them in `frontend.slots`; each uses `dist/index.html`. Cell pages and widgets receive `cellId` through `ready`. The basic builder uses one TypeScript entry for all declared pages; branch on `location.pathname` or adapt your bundler for separate entries.

## Theme and language

`applyTheme(ui)` applies Panel's `--hp-*` design tokens and document language. Consume colour values with `rgb(var(--hp-surface))`, `rgb(var(--hp-foreground))`, `rgb(var(--hp-accent))`, and radii with `var(--hp-panelRadius)` / `var(--hp-buttonRadius)`. The starter follows theme changes automatically.

Use `ui.locale` to select **your own extension's language catalogue**, with English fallback. `ui.messages` currently contains a small host-selected message set, not the full Panel catalogue. Do not depend on unrelated host translation keys. Text from settings or API responses should be rendered through `textContent` or framework escaping.

## Settings and events

Manifest settings support `text`, `number`, `toggle`, `select`, `password`. Numeric settings can specify `min`/`max`; select settings require `options`. Password defaults are forbidden and password values are excluded from `settings.get()`. Static extension assets are public when enabled; never bundle secrets.

Events: `cell.created`, `cell.updated`, `cell.deleted`. Declare them under `events.subscribe` and request `cells.read`. The host checks every subscription. Events are inferred from **15-second polling of the user's visible catalogue**, not durable lifecycle hooks. The first poll establishes a baseline; initial Cells do not emit creation events. Visibility loss can appear as deletion, and deletion payloads contain only `{ id }`. The list is capped at 100 before Comb filtering. Do not use these events for billing, backups or guaranteed automation.

## Build and package contract

`nectar build` bundles `src/main.ts` as a classic script, copies `public/` into `dist/`, and creates the HTML entries. CSS belongs in `public/style.css`. Rebuild before packing; `pack` validates built files but does not rebuild them. Compiled framework code can be bundled too, provided it needs no `eval` or inline JavaScript.

A `.nectar` file is a ZIP containing only root `nectar.json` and static files under `dist/`. No wrapping folder. Allowed types: JSON, HTML, JS, CSS, PNG, WebP, WOFF2. Limits: 150 files, 20 MiB archive, 60 MiB unpacked. The packager rejects symlinks, source maps, source files, missing entries and case-insensitive filename collisions. Archive contents are deterministic. Panel validates again on install.

The iframe uses `sandbox="allow-scripts"` with an opaque origin and strict CSP. Use relative classic scripts and styles; no CDN imports, inline scripts, direct fetch, WebSockets, workers, local storage, parent DOM access, backend PHP or shell hooks. All privileged operations go through the bridge. Opening built HTML directly will report that it must be opened inside a host. Use `nectar dev` for a local sandbox with mocks. Hot reload is local only; an installed Panel extension still needs rebuilding and reinstalling.

## Native page presentation

Full extension pages should sit directly in the Panel layout rather than adding a second framed card around their whole content. The 0.2.1 Panel patch removes the outer content wrapper, uses the native Cell-page heading/icon styles and opts full pages into automatic height. Widgets retain their existing fixed-height behaviour.

The SDK reports content height after its authenticated handshake using ResizeObserver. The host accepts resize messages only from the correct frame and nonce and clamps height to 80–12000px. It keeps the same opaque-origin sandbox and CSP. `createNectar({ autoResize: false })` disables reporting if your extension manages its own layout. Avoid `min-height: 100vh` or other viewport-height feedback in an auto-sized page. Use normal content flow; the SDK disconnects its observer on disposal.

Use zero body margins and leave a small content inset (for example 6px) for focus outlines and no full-page card border. Match the canvas with `rgb(var(--hp-surfaceDark))`; use panels only for individual sections where they add meaning. `applyTheme` also supplies `--nectar-accent-foreground` for readable text on filled accent buttons. The Votifier example demonstrates this and hides its Cell selector when context already provides the Cell.

## Local preview and automatic rebuilds

Inside a generated project or one of the examples:

```bash
npm run dev
# or: npx nectar dev --port 5174
```

Open the exact loopback URL printed by the command, normally `http://127.0.0.1:5174`. The toolbar selects a page/widget entry, Cell context, dark/light theme, language and success/denied/network-failure scenarios. Declared Cell events can be injected manually. Rebuild errors appear above the frame. Edits to `src/`, `public/`, `nectar.json` or `nectar.preview.json` rebuild and reload the frame automatically. Changes inside dependencies are not watched.

Preview runs the same `allow-scripts` opaque-origin iframe and CSP restrictions as Panel. It binds only to loopback and accepts scoped mock capability calls. **It never connects to a real Panel, external HTTP service or TCP listener.** Do not put production tokens in preview fixtures. Browser-side direct fetch and parent DOM access stay blocked. No permission is granted merely by using the SDK; mock calls check the manifest too, while real authorization must still be tested in Panel.

Create `nectar.preview.json` beside your manifest to override mock data:

```json
{
  "cells": [{
    "id": "preview-minecraft", "name": "My local example", "comb": "paper", "game": "minecraft",
    "installStatus": "installed", "allocations": [{ "id": "preview-votifier", "ip": "127.0.0.1", "port": 8192 }]
  }],
  "settings": { "greeting": "Hello from local preview" },
  "http": { "GET https://api.example.com/catalogue": { "status": 200, "body": { "items": [] } } },
  "votifier": { "token": "preview-token" }
}
```

`game` is preview-only metadata used for manifest Comb filtering. HTTP fixtures are selected by exact method and URL, and the hostname must also be declared in the manifest. Missing fixtures fail explicitly. The TCP mock implements a NuVotifier v2 handshake and signature check only; it is not a general socket simulator. Its demo token is `preview-token`. Settings are merged with manifest defaults; password settings are excluded from the capability response. Manual events do not modify the fixture catalogue; edit the fixtures to change the list.

Preview files and toolbar code are not included in `.nectar` archives. The preview does not emulate database-backed user permissions, worker allocation networking, TLS/proxy routing or durable events. Test those on your development Panel.

## Votifier reference extension

`examples/votifier-tester/` is a complete SDK-based NuVotifier v2 example with a Cell page under **Tools → Votifier Tester**, matching `game:minecraft`. It uses `cells.read` and approved `network.tcp` calls. It has its own English/German catalogue and follows Panel design tokens.

```bash
cd examples/votifier-tester
npm install
npm run dev
```

For a local simulated vote, enter a Minecraft username and the demo token `preview-token`. Change scenarios to test rejection and networking errors. The extension clears the token after every attempt, sends a numeric millisecond timestamp, checks the listener response and closes the TCP session. Native form submission remains blocked by the sandbox: its button validates inputs and invokes the SDK directly. No `allow-forms` or looser CSP is needed.

Build and install the generated `.nectar` file to test an actual server. See the example's README for permissions, replacing the old Votifier extension, and a real-vote checklist. The protocol source is kept separate from the SDK: game protocols do not belong in the core bridge.

## Verification

```bash
npm test
npm pack
```

SDK tests cover handshake source/origin/nonce checks, timeout/disposal, unique request identifiers, backpressure, events, permission failures and archive validation. The accompanying Panel patch includes bridge contract tests. Also test installation on a disposable Panel with a normal user, a restricted Cell subuser, an administrator, and denied/unapproved capabilities before distributing your extension.

This release does not expose arbitrary Cell mutations, filesystem access, database access, power controls or backend extension code. Add host capabilities with authorization and tests before adding SDK methods for them.

## Project diagnostics

Run `nectar doctor --built` inside your extension. It checks Node.js, manifest validity, the TypeScript entry and built archive constraints. Supply `--panel-version dev` (or your exact target) to check host compatibility. Run `nectar --version` to identify your installed SDK. These checks do not contact a Panel or verify remote permissions.

## Typed manifest definitions

Import `NectarManifest`, `ExtensionPage`, `ExtensionSetting`, `Permission`, `WidgetSlot`, `SidebarGroup` and `SidebarIcon` for tooling and typed configuration. For example:

```ts
import type { NectarManifest } from '@hivepanel/nectar';
const manifest = {
    id: 'example.tools', name: 'Tools', version: '1.0.0', panelCompatibility: 'dev',
    frontend: { entry: 'dist/index.html', slots: ['dashboard.widgets'] },
} satisfies NectarManifest;
```

The CLI still reads **nectar.json**. These types provide editor checking; they do not generate JSON or replace `nectar validate`. Runtime limits, page slug/entry correspondence and permission/scope matching remain validator checks.

## Reusable translations

```ts
import { createTranslator } from '@hivepanel/nectar';
const language = createTranslator({
    en: { welcome: 'Hello {name}' },
    de: { welcome: 'Hallo {name}' },
});
language.setLocale((await nectar.ready).ui.locale);
heading.textContent = language.t('welcome', { name: 'Jordan' });
nectar.onUI(ui => {
    language.setLocale(ui.locale);
    heading.textContent = language.t('welcome', { name: 'Jordan' });
});
```

Lookup tries the exact locale, its base language, then English (or a supplied fallback). Missing keys display their key; missing parameters retain their placeholder. Render translated values as text, never unsanitized HTML. The generated starter includes English/German text and responds to live locale updates.

See [the release checklist](docs/RELEASE-CHECKLIST.md), [troubleshooting](docs/TROUBLESHOOTING.md) and [changelog](CHANGELOG.md) before distributing an extension.
