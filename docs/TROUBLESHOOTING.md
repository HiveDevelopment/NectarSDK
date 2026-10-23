# Troubleshooting

| Symptom | Check |
| --- | --- |
| Command is unavailable | Run npm install in your extension and use npm scripts or npx nectar. Node.js 22+ is required. |
| Open inside HivePanel / handshake timeout | Use nectar dev or install the archive in Panel. Opening dist/index.html directly has no host. Confirm your Panel has Nectar integration. |
| Installation rejected | Run nectar doctor --built --panel-version YOUR_TARGET. Compatibility is exact, not a semver range. |
| Network permission denied | Declare both capability and scope; administrator approval and the current user's Cell permissions still apply. |
| No Cells or allocations | Check account access, Comb filters and page context. Allocations require TCP permission and authorization. The catalogue is capped at 100 before filtering. |
| Form button does nothing | Sandbox disallows native form submission. Use type=button, reportValidity and SDK calls; do not weaken the sandbox. |
| Fetch/CDN/storage fails | Direct network and browser storage are intentionally unavailable. Bundle dependencies and use declared bridge capabilities. |
| Focus outline clipped | Leave a small inset in the extension content. An iframe cannot paint outside its boundary. |
| Frame height loops | Avoid viewport-height sizing in auto-resized pages. Use normal flow; autoResize:false opts out of reports. |
| Changes absent in Panel | Preview hot reload is local only. Rebuild, bump the extension version and reinstall on a disposable Panel. Back up settings. |
| Events seem delayed | Events derive from 15-second catalogue polling. They are not durable hooks or live resource metrics. |
| Select setting crashes validation | Upgrade to SDK 0.3.0; malformed options/defaults now return errors. |

A 0.3.0 SDK does not imply that Panel supports extra APIs. Consult the README's capability table. Never copy Panel credentials into frontend code or preview fixtures.
