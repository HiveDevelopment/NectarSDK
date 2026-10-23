# Changelog

## 0.4.0

- Add framework-independent shared controls through the optional `/ui` entry point and exported `/ui.css`.
- Include theme-aware shared CSS automatically in extension builds.
- Add buttons, labelled inputs, enhanced selects, switches, notices, loading/empty states, tabs and frame-local confirmations.
- Provide keyboard navigation, focus handling, reduced-motion styles and explicit control cleanup.
- Migrate Hello Nectar, Votifier Tester and the generated starter to shared controls.
- Add a bilingual UI Gallery example and component reference documentation.
- Use cross-platform test discovery and esbuild 0.28.2.

No new Panel or Worker capabilities are exposed. Existing 0.3.x bridge APIs remain compatible.

## 0.3.0

- Export typed manifest, settings, permissions, page, slot and sidebar definitions.
- Add `createTranslator` with locale fallback, interpolation and live language switching.
- Add `nectar doctor [--built] [--panel-version ...]` and `nectar --version`.
- Generate a translated starter with status announcements, safe button handling, focus-ring spacing and request guards.
- Return useful validation errors for malformed select settings instead of throwing a TypeError.
- Include release and troubleshooting documentation.
- Bundle Votifier Tester 1.0.2 as the reference extension with themed dropdowns and responsive, frameless content.

Existing 0.2.x bridge calls remain compatible. No new host capability or Worker deployment is required. Use the included Panel layout patch if your installation does not yet support full-page iframe resizing.

## 0.2.1

Authenticated content resizing and native, frameless page presentation.

## 0.2.0

Loopback preview with fixture capabilities and rebuilds; SDK-based Votifier reference extension.

## 0.1.1

Host integration and acknowledged subscriptions; request cleanup and legacy bridge compatibility.

## 0.1.0

Typed browser client, starter generator, validator and deterministic archive packager.
