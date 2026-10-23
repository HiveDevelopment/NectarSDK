# Publish the SDK

Target repository: **HiveDevelopment/NectarSDK** (public). Package: **@hivedevelopment/nectar**. Version: **0.3.0**.

## Use the repository

The repository is **HiveDevelopment/NectarSDK**. Clone it and wait for the Windows/Linux Node 22/24 SDK checks before publishing:

```powershell
git clone https://github.com/HiveDevelopment/NectarSDK.git
cd NectarSDK
npm ci
npm test
```

## First npm publication

Use an npm account authorized for the **hivedevelopment** scope. If the organization does not exist, its owner must create it on npm first. Do not share login tokens in chat.

```powershell
npm login
npm whoami
npm ci
npm test
npm publish --dry-run --access public
npm publish --access public
npm view @hivedevelopment/nectar@0.3.0 version
```

Follow npm's browser/2FA prompts. Do not republish 0.3.0 if it already exists; bump the version for later changes. A local first publish does not use GitHub provenance.

## Subsequent releases through GitHub OIDC

In the npm package settings, add a GitHub Actions trusted publisher:

- Organization/user: HiveDevelopment
- Repository: NectarSDK
- Workflow filename: publish.yml
- Allow direct publishing with npm publish

The workflow uses Node 24, `id-token: write` and provenance, with no persistent publish token. Configure trust only when ready to publish; npm requires a first successful use within two days. Run **Publish npm package** manually from Actions on main after versioning and passing CI. The exact repository URL in package.json must match the repository you create.

Official reference: https://docs.npmjs.com/trusted-publishers/

After publishing, test the README's npx quick start from an empty directory. Source generation was tested locally; registry installation can only be verified after the first publication.
