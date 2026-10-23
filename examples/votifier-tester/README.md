# Votifier Tester — Nectar SDK example

This extension sends NuVotifier v2 test votes through Nectar's approved TCP gateway. The vote protocol is extension code; the Panel/Worker bridge remains generic.

## Preview without a Panel

Install/build the SDK at the repository root first, then:

```bash
npm install
npm run dev
```

Open the printed `http://127.0.0.1:5174` URL. Enter a valid Minecraft username and **`preview-token`**. The preview verifies the challenge and HMAC locally; no real vote or socket connection is made. Try an incorrect token, the network-failure scenario, theme/language changes and editing source or fixtures.

## Install in HivePanel

Requires the Panel integration shipped with SDK 0.1.1; no further Panel/Worker update is needed for this example.

1. Build and package with `npm run build` then `npm run pack`, or use the supplied `hivepanel.votifier-tester-1.0.1.nectar`.
2. If the older `hivepanel.votifier-tester` is installed, disable and uninstall that extension first. Current Nectar does not support replacing an installed ID in place. Keep a copy of any settings you need; this extension never saves vote tokens.
3. Install the new archive under **Admin → Extensions**.
4. Review and approve its TCP network permission, then enable it.
5. Open a Minecraft Cell and choose **Tools → Votifier Tester**. This version is a full Cell page rather than a console widget. The Cell's Comb must declare the Minecraft game identifier.

The manifest targets the default `NECTAR_PANEL_VERSION=dev`. If your installation uses another value, set the exact configured version in `nectar.json` and rebuild. A compatibility range is not accepted by the current host.

## Real server test

1. Start your Minecraft server with NuVotifier v2 installed.
2. Confirm its listener port is an allocation assigned to that Cell, and that allocation is active on the Worker/container. The game port and Votifier port are usually different.
3. Open the extension with a user who has **console command/send** permission on the Cell. Viewing a Cell alone does not permit TCP operations.
4. Select the allocation where NuVotifier listens.
5. Enter a Minecraft username. Use **HivePanelTest** as the service name if you configured a token for that service; otherwise enter the service name associated with the token you intend to test.
6. Enter the corresponding real NuVotifier token and click **Send test vote**. Do not use the preview token on a real server unless you deliberately configured it for a disposable test.
7. Expect **Test vote accepted by NuVotifier**. Check the Minecraft console/reward plugin separately: acceptance does not guarantee a reward was processed.
8. Confirm the token field clears. Try an intentionally wrong token and confirm you see a rejection with the field cleared again.

Tokens are kept in the form/request memory for the attempt and are not stored in extension settings or browser storage. TCP sessions are closed after success or failure; Worker expiry still handles interrupted pages. Requests go through Panel and Worker authorization and auditing.

The page uses SDK theme updates and its own English/German translation files. It does not access the parent DOM, use native form submission, or request relaxed iframe permissions. The send button explicitly validates the form and calls the SDK so it works under `sandbox="allow-scripts"` and `form-action 'none'`.

## Protocol reference

The implementation follows [NuVotifier's protocol documentation](https://github.com/NuVotifier/NuVotifier/wiki/Technical-QA): challenge-bound HMAC-SHA256 payload, big-endian framing and a numeric timestamp in milliseconds. Unit tests compare signatures against Node's crypto implementation and exercise success/failure against a real loopback TCP test listener. The implementation supports v2 only, not the RSA v1 protocol.
