# GitHub PR Labeler

A GitHub Action that keeps pull request size and review-state labels up to date. Everything runs on GitHub Actions; consuming repositories do not need a server, configuration file, or dependency installation.

## Labels

The action creates its labels automatically when they are first needed.

| Label                                    | Meaning                                              |
| ---------------------------------------- | ---------------------------------------------------- |
| `size/<50`                               | Fewer than 50 changed lines                          |
| `size/50-199`                            | 50–199 changed lines                                 |
| `size/200-499`                           | 200–499 changed lines                                |
| `size/500-999`                           | 500–999 changed lines                                |
| `size/1000+`                             | At least 1,000 changed lines                         |
| `review/changes-requested`               | A reviewer requested changes                         |
| `review/updated-after-changes-requested` | New commits were pushed after changes were requested |

PR size is `additions + deletions`. Size is recalculated when a PR is opened, reopened, or synchronized, and exactly one `size/` label is retained.

A submitted changes-request review sets `review/changes-requested`. A subsequent push replaces it with `review/updated-after-changes-requested`. A submitted approval clears both review-state labels.

## Install in another repository

Add this workflow to the consuming repository, for example as `.github/workflows/pr-labels.yml`:

```yaml
name: PR labels

on:
    pull_request:
        types: [opened, synchronize, reopened]
    pull_request_review:
        types: [submitted]

permissions:
    pull-requests: read
    issues: write

jobs:
    labels:
        runs-on: ubuntu-latest
        steps:
            - name: Update PR labels
              uses: AndreasArvidsson/gh-pr-labeler@v1
```

The action uses the workflow's `GITHUB_TOKEN`. It only needs `pull-requests: read` to inspect the PR and `issues: write` because GitHub manages PR labels through the Issues API.

## Development

Requires Node.js 24 or newer.

```shell
npm install
npm run lint
npm run test
npm run build
```

`npm run build` bundles the action and all runtime dependencies into the committed `dist/index.js`. CI verifies the tests, lint checking, and that rebuilding does not change the committed bundle.
