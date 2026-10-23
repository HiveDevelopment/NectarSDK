# Publish the SDK

Target repository: **HiveDevelopment/nectar-sdk** (public). Package: **@hivepanel/nectar**. Version: **0.3.0**.

## Create the repository

From the SDK directory, with GitHub CLI installed and authenticated:

```powershell
git init -b main
git add .
git commit -m "Release Nectar SDK 0.3.0"
gh repo create HiveDevelopment/nectar-sdk --public --description "Typed SDK and development tools for HivePanel Nectar extensions" --source . --remote origin --push
```

If the repository already exists, add its remote and push instead. Do not overwrite an existing repository. Wait for all four SDK check jobs (Windows/Linux, Node 22/24) to pass before publishing.

## First npm publication

Use an npm account authorized for the **hivepanel** scope. If the organization does not exist, its owner must create it on npm first. Do not share login tokens in chat.

```powershell
npm login
npm whoami
npm ci
npm test
npm publish --dry-run --access public
npm publish --access public
npm view @hivepanel/nectar@0.3.0 version
```

Follow npm's browser/2FA prompts. Do not republish 0.3.0 if it already exists; bump the version for later changes. A local first publish does not use GitHub provenance.

## Subsequent releases through GitHub OIDC

In the npm package settings, add a GitHub Actions trusted publisher:

- Organization/user: HiveDevelopment
- Repository: nectar-sdk
- Workflow filename: publish.yml
- Allow direct publishing with npm publish

The workflow uses Node 24, `id-token: write` and provenance, with no persistent publish token. Configure trust only when ready to publish; npm requires a first successful use within two days. Run **Publish npm package** manually from Actions on main after versioning and passing CI. The exact repository URL in package.json must match the repository you create.

Official reference: https://docs.npmjs.com/trusted-publishers/

After publishing, test the README's npx quick start from an empty directory. Source generation was tested locally; registry installation can only be verified after the first publication.
