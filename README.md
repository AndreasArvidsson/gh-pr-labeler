# GitHub PR Labeler

A GitHub Action that keeps pull request size and review-state labels up to date. Everything runs on GitHub Actions; consuming repositories do not need a server, configuration file, or dependency installation.

## Labels

The action creates its labels automatically when they are first needed.

| Label                                                                                                                      | Meaning                                              |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| ![size/<10](https://img.shields.io/badge/size%2F%3C10-b7eb8f)                                                              | Fewer than 10 changed lines                          |
| ![size/10-49](https://img.shields.io/badge/size%2F10--49-c5def5)                                                           | 10–49 changed lines                                  |
| ![size/50-199](https://img.shields.io/badge/size%2F50--199-bfdadc)                                                         | 50–199 changed lines                                 |
| ![size/200-499](https://img.shields.io/badge/size%2F200--499-fbca04)                                                       | 200–499 changed lines                                |
| ![size/500-999](https://img.shields.io/badge/size%2F500--999-f9a825)                                                       | 500–999 changed lines                                |
| ![size/1000+](https://img.shields.io/badge/size%2F1000%2B-d93f0b)                                                          | At least 1,000 changed lines                         |
| ![review/changes-requested](https://img.shields.io/badge/review%2Fchanges--requested-d73a4a)                               | A reviewer requested changes                         |
| ![review/updated-after-changes-requested](https://img.shields.io/badge/review%2Fupdated--after--changes--requested-0e8a16) | New commits were pushed after changes were requested |

PR size is `additions + deletions`. Size is recalculated when a PR is opened, reopened, or synchronized, and exactly one `size/` label is retained.

Only submitted approvals and change requests from reviewers with write access or higher (write, maintain, or admin) affect review-state labels. Permissions are checked when the action runs. Reviews from other users are ignored. The latest qualifying review wins across reviewers; these labels do not represent GitHub's full merge requirements or enforce code ownership.

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
              uses: AndreasArvidsson/gh-pr-labeler@v1.2.0
```

Both workflows must exist on the default branch. The first workflow has no repository permissions and does not check out or execute PR code. The second workflow runs from the trusted default branch, fetches current PR and review data through GitHub's API, and uses its write-capable `GITHUB_TOKEN` to update labels.

Repositories that do not accept fork or Dependabot pull requests can invoke `AndreasArvidsson/gh-pr-labeler@v1.2.0` directly from their existing PR workflow instead.

## Development

Requires Node.js 24 or newer.

```shell
npm install
npm run lint
npm run test
npm run build
```

`npm run build` bundles the action and all runtime dependencies into the committed `dist/index.js`. CI verifies the tests, lint checking, and that rebuilding does not change the committed bundle.
