# Nectar SDK

The official TypeScript SDK and development tools for **Nectar**, HivePanel's sandboxed extension system.

Build extensions with native Panel pages, sidebar entries and widgets. Nectar provides a typed client for approved Panel capabilities, local development previews, manifest validation and `.nectar` packaging.

[Documentation](https://docs.hivepanel.dev) · [npm](https://www.npmjs.com/package/@hivedevelopment/nectar) · [GitHub](https://github.com/HiveDevelopment/NectarSDK) · [Report an issue](https://github.com/HiveDevelopment/NectarSDK/issues)

## Requirements

- Node.js **22 or newer**; Node.js 24 is recommended.
- npm.
- A HivePanel installation with Nectar support for testing real permissions and services.

The **0.3.x developer preview** supports the capabilities listed below. SDK releases do not automatically add new capabilities to your Panel or Worker.

## Quick start

Create an extension using the published SDK:

```bash
npx --package @hivedevelopment/nectar@0.3.0 nectar init my-extension --id yourname.example --panel-version dev --sdk-source npm
cd my-extension
npm install
npm run dev
```

Open the loopback URL printed by the preview server. Edit `src/main.ts`, `public/style.css` and `nectar.json`; changes rebuild and reload automatically.

The generated project uses a pinned npm dependency, so it does not depend on a temporary `npx` cache or a local SDK checkout.

`--panel-version` must exactly match your Panel's `NECTAR_PANEL_VERSION`, which defaults to `dev`. Version ranges are not supported by the current host.

## What you can build

- **Panel pages and widgets:** standalone dashboard pages, Cell pages and content in supported widget slots.
- **Sidebar integration:** place extension pages under existing navigation groups, with supported icons and Comb filters.
- **Cell discovery:** read the Cell catalogue available to the signed-in user.
- **Extension settings:** read nonsecret administrator-configured settings.
- **Approved networking:** scoped HTTPS requests and TCP sessions to authorized Cell allocations.
- **Theme and language support:** Panel design tokens, live UI updates and extension-owned translation catalogues.
- **Catalogue events:** subscribe to supported Cell changes inferred from polling.
- **Developer tooling:** local fixture previews, automatic rebuilds, diagnostics, validation and deterministic archives.

The SDK does not currently expose filesystem access, database access, power controls, arbitrary Cell mutations or backend extension code. Catalogue events are polled updates, not durable lifecycle hooks or live resource metrics.

## Use the client

Inside an extension:

```ts
import { applyTheme, createNectar } from '@hivedevelopment/nectar';

const nectar = createNectar();
const { cellId, ui } = await nectar.ready;

applyTheme(ui);
nectar.onUI(next => applyTheme(next));

const cells = await nectar.cells.list();

// Dispose the client when your page or component unmounts.
window.addEventListener('pagehide', () => nectar.dispose(), { once: true });
```

Declare `cells.read` in `nectar.json` before calling `cells.list()`. All capability methods wait for the host handshake and remain subject to host permissions. Create one client per iframe.

For API reference, manifest options, network scopes, UI guidance and translations, see the [HivePanel documentation](https://docs.hivepanel.dev).

## Build and install

From your extension directory:

```bash
npm run build
npm run validate
npm run doctor
npm run pack
```

Upload the generated `.nectar` file through **Admin → Extensions → Install** in your development Panel. Review its permissions, configure its settings, approve declared network access if required, then enable it.

For the current host version, replacing an installed extension requires disabling and uninstalling it before installing the replacement. Back up its settings first and use a disposable development Panel.

## CLI commands

Run these inside an extension project using `npx nectar` or its generated npm scripts.

| Command | Purpose |
| --- | --- |
| `nectar init <directory>` | Generate a new extension. |
| `nectar dev` | Start the loopback preview with fixtures and automatic rebuilds. |
| `nectar build` | Bundle the frontend and generate its HTML entries. |
| `nectar validate --built` | Validate the manifest and built archive contents. |
| `nectar doctor --built` | Check Node.js, the manifest, source entry and built archive contract. |
| `nectar pack` | Package built files into a `.nectar` archive. |
| `nectar --version` | Print the SDK version. |

`pack` validates existing build output; it does not rebuild your source. Run `build` before packaging changes.

## Reference extensions

The repository includes two complete examples:

- [Hello Nectar](https://github.com/HiveDevelopment/NectarSDK/tree/main/examples/hello-nectar): dashboard page with Cell discovery, settings, themes, translations and event subscriptions.
- [Votifier Tester](https://github.com/HiveDevelopment/NectarSDK/tree/main/examples/votifier-tester): Minecraft Cell page using approved allocation-scoped TCP to send a NuVotifier v2 test vote.

Clone this repository to run an example:

```bash
git clone https://github.com/HiveDevelopment/NectarSDK.git
cd NectarSDK
npm ci
npm run build
cd examples/votifier-tester
npm install
npm run dev
```

The Votifier preview uses the demo token `preview-token`. Preview calls use local fixtures and never contact a real Panel, external API or TCP listener. Test actual networking, user permissions and installation separately on your development Panel.

## Sandbox and permissions

Extensions run in an opaque-origin iframe with a restrictive content security policy. Bundle your frontend dependencies and use the SDK bridge for privileged operations. Direct network requests, parent-page DOM access, browser storage, backend PHP and shell hooks are not exposed.

Network access requires both manifest declarations and administrator approval. Cell access also depends on the signed-in user's permissions. Never bundle credentials or secrets into extension assets.

## Contributing

From a source checkout:

```bash
npm ci
npm test
npm pack
```

Run the examples and test your changes on a development Panel before distributing them. Development, publishing and troubleshooting guides are maintained on [docs.hivepanel.dev](https://docs.hivepanel.dev).

## License

MIT — Copyright © Jordan Watts (Hive Development).

See [LICENSE.md](https://github.com/HiveDevelopment/NectarSDK/blob/main/LICENSE.md).
