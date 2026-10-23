# Nectar UI Gallery

A dashboard example for SDK 0.4.0, demonstrating the optional shared UI components in English and German. It has no capabilities and performs no server changes.

From the SDK root, run npm ci and npm run build. Then:

```bash
cd examples/ui-gallery
npm install
npm run dev
```

Test both tabs, switches, dropdown keyboard controls, dialog cancellation/confirmation and live theme/language changes using the preview toolbar. Build with npm run build, validate with npm run validate and package with npm run pack.

Install the archive in Admin → Extensions and open Tools → UI Gallery to test in Panel. Dialogs are confined to the sandboxed extension frame.
