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

A submitted changes-request review sets `review/changes-requested`. A subsequent push replaces it with `review/updated-after-changes-requested`. A submitted approval clears both review-state labels. Dismissing the last relevant review also clears both labels.

## Install in another repository

Fork pull requests receive a read-only token. To support them safely, use one unprivileged workflow to receive PR events and a second trusted workflow to update labels after the first workflow completes.

Add `.github/workflows/pr-label-events.yml`:

```yaml
name: PR label events

on:
    pull_request:
        types: [opened, synchronize, reopened]
    pull_request_review:
        types: [submitted, dismissed]

permissions: {}

jobs:
    signal:
        runs-on: ubuntu-latest
        steps:
            - run: echo "PR label event received"
```

Then add `.github/workflows/pr-labels.yml`:

```yaml
name: PR labels

on:
    workflow_run:
        workflows: [PR label events]
        types: [completed]

permissions:
    pull-requests: write

jobs:
    labels:
        if: github.event.workflow_run.conclusion == 'success'
        runs-on: ubuntu-latest
        steps:
            - name: Update PR labels
              uses: AndreasArvidsson/gh-pr-labeler@v1.0.0
```

Both workflows must exist on the default branch. The first workflow has no repository permissions and does not check out or execute PR code. The second workflow runs from the trusted default branch, fetches current PR and review data through GitHub's API, and uses its write-capable `GITHUB_TOKEN` to update labels.

Repositories that do not accept fork or Dependabot pull requests can invoke `AndreasArvidsson/gh-pr-labeler@v1.0.0` directly from their existing PR workflow instead.

## Development

Requires Node.js 24 or newer.

```shell
npm install
npm run lint
npm run test
npm run build
```

`npm run build` bundles the action and all runtime dependencies into the committed `dist/index.js`. CI verifies the tests, lint checking, and that rebuilding does not change the committed bundle.
