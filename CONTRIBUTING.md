# How to contribute to eventkit

Thanks for taking the time to contribute to eventkit!

When it comes to open source, there are many different ways to contribute, all of which are valuable. Here are a few guidelines that will help you contribute to eventkit.

## Did you find a bug?

- Make sure the bug wasn't already reported by searching on GitHub under [Issues](https://github.com/hntrl/eventkit/issues).
- If you're unable to find an open issue addressing the problem, [open a new one](https://github.com/hntrl/eventkit/issues/new). Be sure to include a title and clear description, as much relevant information as possible, and a code sample if applicable. If possible, use the relevant issue templates to create the issue.
- If you've encountered a security issue, please see our [SECURITY.md](SECURITY.md) guide for info on how to report it.

## Proposing new or changing existing features?

Please provide thoughtful comments and some sample code that show what you'd like to do with eventkit. It helps the conversation if you can show us how you're limited by the current API first before jumping to a conclusion about what needs to be changed and/or added.

## Issue not getting attention?

If you need a bug fixed and nobody is fixing it, your best bet is to provide a fix for it and make a [pull request](https://help.github.com/en/github/collaborating-with-issues-and-pull-requests/creating-a-pull-request). Open source code belongs to all of us, and it's all of our responsibility to push it forward.

## Making a Pull Request?

When creating the PR in GitHub, make sure that you set the base to the correct branch. If you are submitting a PR that touches any code, this should be the dev branch. You set the base in GitHub when authoring the PR with the dropdown below the "Compare changes" heading.

### Setup

Before you can contribute, you'll need to fork the repo. This will look a bit different depending on what type of contribution you are making:

- All new features, bug-fixes, or anything that touches material code should be branched off of and merged into the `dev` branch.
- Changes that only touch documentation should be branched off of and merged into the `main` branch.

The following steps will get you setup to start issuing commits:

1. Fork the repo (click the <kbd>Fork</kbd> button at the top right of [this page](https://github.com/hntrl/eventkit))
2. Clone your fork locally

   ```bash
   # in a terminal, cd to parent directory where you want your clone to be, then
   git clone https://github.com/<your_github_username>/eventkit.git
   cd eventkit

   # if you are making *any* code changes, make sure to checkout the dev branch
   git checkout dev
   ```

### Tests

All commits that fix bugs or add features should have tests. Do not merge code without tests!

### Docs + Examples

All commits that add or change public APIs must also have accompanying updates to all relevant documentation and examples. PR's that don't have accompanying docs will not be merged.

Documentation is defined using static markdown files in the `docs` directory, and using the [TypeDoc](https://typedoc.org/) comments found in the source code. You can preview the docs site locally by running `pnpm docs:dev` from the root directory. Any changes you make to either the docs or source code comments will be reflected in the docs site running locally.

Once changes make their way into the `main` branch they will automatically be published to the docs site.

## Development

### Packages

Eventkit uses a monorepo setup to host code for multiple packages. These packages live in the `packages` directory.

We use [pnpm workspaces](https://pnpm.io/workspaces/) to manage installation of dependencies and running various scripts. To get everything installed, make sure you have [pnpm installed](https://pnpm.io/installation), and then run `pnpm install` from the repo root.

### Building

Calling `pnpm build` from the root directory will run the build, which should take only a few seconds. It's important to build all the packages together because the individual packages have dependencies on one another.

### Testing

Running `pnpm test` from the root directory will run **every** package's tests. If you want to run tests for a specific package, use `pnpm test --projects packages/<package-name>`:

```bash
# Test all packages
pnpm test

# Test only the base package
pnpm test --projects packages/eventkit
```

### Documenting changes

We use [changesets](https://github.com/changesets/changesets) to manage the changelog and versioning of the packages. When you make any material changes to the codebase in a PR, you should document your changes by running `pnpm changeset` from the root directory. Follow the prompts to add a changelog entry, and the changelog's will be updated automatically come release time.

## New Releases

Releases are managed by changesets and are automatically created when a PR is merged into `main`. When code lands in `main`, a new PR will open that will update the changelog and version of the packages. Once that PR is merged, a new release will be created and published to npm.

---

This project is a volunteer effort, and we encourage you to contribute in any way you can.

Thanks! ❤️ ❤️ ❤️
