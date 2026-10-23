# Extension release checklist

1. Set a unique extension ID, release version and exact Panel compatibility target in `nectar.json`.
2. Declare only permissions and network scopes actually required. Static assets and ordinary settings must not contain secrets.
3. Run `npm run build`, `npm run validate`, then `npm run doctor` (or `nectar doctor --built`).
4. Use `npm run dev` to check supported themes, regional locales, empty data, denied permissions, network failures, mobile layout and keyboard interaction. Preview never calls a live service.
5. Run `npm run pack`. Verify the archive contains only root `nectar.json` and `dist/` assets. Never ship preview fixtures, tokens, source maps or node_modules.
6. Install on a disposable Panel. On this host, replacing an extension requires disabling and uninstalling it before uploading the replacement; back up settings first.
7. Review/approve the extension's network scopes and enable it. Test with an administrator, ordinary user and restricted Cell subuser. Confirm inaccessible Cells cannot be used by supplying their IDs.
8. Verify page/sidebar placement, Cell scoping, live theme/language updates, error display and cleanup when navigating away. Test a real provider/listener separately from fixtures.
9. Publish the archive, source, version notes, required Panel target and setup instructions together.

The SDK does not currently expose backend execution, files, database access, power operations, arbitrary Cell mutations, UDP or durable lifecycle hooks. Requested features in these areas need authorized host capabilities first.
