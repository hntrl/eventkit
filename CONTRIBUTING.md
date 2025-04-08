# How to contribute to eventkit

Thanks for taking the time to contribute to eventkit!

When it comes to open source, there are many different ways to contribute, all of which are valuable. Here are a few guidelines that will help you contribute to eventkit.

## Did you find a bug?

* Make sure the bug wasn't already reported by searching on GitHub under [Issues](https://github.com/hntrl/eventkit/issues).
* If you're unable to find an open issue addressing the problem, [open a new one](https://github.com/hntrl/eventkit/issues/new). Be sure to include a title and clear description, as much relevant information as possible, and a code sample if applicable. If possible, use the relevant bug report templates to create the issue.

## Proposing new or changing existing features?

Please provide thoughtful comments and some sample code that show what you'd like to do with eventkit in your app. It helps the conversation if you can show us how you're limited by the current API first before jumping to a conclusion about what needs to be changed and/or added.

## Issue not getting attention?

If you need a bug fixed and nobody is fixing it, your best bet is to provide a fix for it and make a [pull request](https://help.github.com/en/github/collaborating-with-issues-and-pull-requests/creating-a-pull-request). Open source code belongs to all of us, and it's all of our responsibility to push it forward.

## Making a Pull Request?

When creating the PR in GitHub, make sure that you set the base to the correct branch. If you are submitting a PR that touches any code, this should be the dev branch. You set the base in GitHub when authoring the PR with the dropdown below the "Compare changes" heading.

### Setup

Before you can contribute, you'll need to fork the repo. This will look a bit different depending on what type of contribution you are making:

* All new features, bug-fixes, or anything that touches material code should be branched off of and merged into the `dev` branch.
* Changes that only touch documentation should be branched off of and merged into the `main` branch.

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

# Test only react-router-dom
pnpm test --projects packages/react-router-dom
```

## New Releases

When it's time to cut a new release, we follow a process based on our branching strategy depending on the type of release.

### Major and Minor Releases

For major and minor releases, we follow the following process:

```bash
# Start from the dev branch.
git checkout dev

# Merge the main branch into dev to ensure that any hotfixes and
# docs updates are available in the release.
git merge main

# Create a new release branch from dev.
git checkout -b release/v0.1.0

# Create a new tag and update version references throughout the
# codebase.
pnpm run version [nextVersion]

# Push the release branch along with the new release tag.
git push origin release/v0.1.0 --follow-tags

# Wait for GitHub actions to run all tests. If the tests pass, the
# release is ready to go! Merge the release branch into main and dev.
git checkout main
git merge release/v0.1.0
git checkout dev
git merge release/v0.1.0

# The release branch can now be deleted.
git branch -D release/v0.1.0
git push origin --delete release/v0.1.0

# Now go to GitHub and create the release from the new tag. Let
# GitHub Actions take care of the rest!
```

### Hot-fix Releases

Sometimes we have a crucial bug that needs to be patched right away. If the bug affects the latest release, we can create a new version directly from `main` (or the relevant major release branch where the bug exists):

```bash
# From the main branch, make sure to run the build and all tests
# before creating a new release.
pnpm install && pnpm build && pnpm test

# Assuming the tests pass, create the release tag and update
# version references throughout the codebase.
pnpm run version [nextVersion]

# Push changes along with the new release tag.
git push origin main --follow-tags

# In GitHub, create the release from the new tag and it will be
# published via GitHub actions

# When the hot-fix is done, merge the changes into dev and clean
# up conflicts as needed.
git checkout dev
git merge main
git push origin dev
```

---

This project is a volunteer effort, and we encourage you to contribute in any way you can.

Thanks! ❤️ ❤️ ❤️