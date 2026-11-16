# GitHub PR Labeler

A GitHub Action that keeps pull request lines, review-state, and merge-conflict labels up to date. Everything runs on GitHub Actions; consuming repositories do not need a server, configuration file, or dependency installation.

## Labels

The action creates its labels automatically when they are first needed.

| Label                                                                                                                      | Meaning                                                     |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| ![lines/<10](https://img.shields.io/badge/lines%2F%3C10-b7eb8f)                                                            | Fewer than 10 changed lines                                 |
| ![lines/10-49](https://img.shields.io/badge/lines%2F10--49-73d13d)                                                         | 10–49 changed lines                                         |
| ![lines/50-199](https://img.shields.io/badge/lines%2F50--199-d3d74b)                                                       | 50–199 changed lines                                        |
| ![lines/200-499](https://img.shields.io/badge/lines%2F200--499-fbca04)                                                     | 200–499 changed lines                                       |
| ![lines/500-999](https://img.shields.io/badge/lines%2F500--999-f9a825)                                                     | 500–999 changed lines                                       |
| ![lines/1000+](https://img.shields.io/badge/lines%2F1000%2B-d93f0b)                                                        | At least 1,000 changed lines                                |
| ![review/changes-requested](https://img.shields.io/badge/review%2Fchanges--requested-d73a4a)                               | A reviewer requested changes                                |
| ![review/updated-after-changes-requested](https://img.shields.io/badge/review%2Fupdated--after--changes--requested-0e8a16) | The PR creator pushed a commit after changes were requested |
| ![merge-conflicts](https://img.shields.io/badge/merge--conflicts-d73a4a)                                                   | The PR has merge conflicts with its base branch             |

PR size is `additions + deletions`. Lines is recalculated when a PR is opened, reopened, or synchronized, and exactly one `lines/` label is retained.

`merge-conflicts` is added when GitHub reports merge conflicts and removed when the PR can merge cleanly. The action retries up to three times at one-second intervals while GitHub calculates mergeability. If the result remains unknown, the existing conflict label is left unchanged and a warning is logged. Mergeability is checked on every action run; the workflows below refresh it on PR and review events, but changes to the base branch alone do not trigger a refresh.

Only submitted approvals and change requests from reviewers with write access or higher (write, maintain, or admin) affect review-state labels. Permissions are checked when the action runs. Reviews from other users are ignored. The latest qualifying review wins across reviewers; these labels do not represent GitHub's full merge requirements or enforce code ownership.

A submitted changes-request review sets `review/changes-requested`. A subsequent push containing a commit authored by the PR creator since the reviewed commit replaces it with `review/updated-after-changes-requested`. Commits already on the PR's base branch are excluded, so merging the base branch does not count unrelated work by the PR creator. A submitted approval clears both review-state labels. Dismissing the last relevant review also clears both labels.

## Install in another repository

Use `pull_request_target` to update labels when a PR is opened, reopened, or synchronized, including when it has merge conflicts. Review events use an unprivileged signal workflow followed by the trusted labeling workflow, so fork reviews can also update labels.

Add `.github/workflows/pr-label-events.yml`:

```yaml
name: PR label events

on:
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
    pull_request_target:
        types: [opened, synchronize, reopened]
    workflow_run:
        workflows: [PR label events]
        types: [completed]

permissions:
    contents: read
    pull-requests: write

jobs:
    labels:
        if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'
        runs-on: ubuntu-latest
        steps:
            - name: Update PR labels
              uses: AndreasArvidsson/gh-pr-labeler@v1.4.0
```

Both workflows must exist on the default branch. The first workflow has no repository permissions and does not check out or execute PR code. The second workflow runs from the trusted default branch, fetches current PR and review data through GitHub's API, and uses its write-capable `GITHUB_TOKEN` to update labels. Keep this labeling workflow limited to trusted code; do not check out or execute PR code in it.

The `pull_request_target` trigger runs even when a PR has merge conflicts; `pull_request` workflows are skipped in that case. If you invoke this action from another workflow, use a trigger that can run for conflicting PRs to keep `merge-conflicts` up to date.

## Development

Requires Node.js 24 or newer.

```shell
npm install
npm run lint
npm run test
npm run build
```

`npm run build` bundles the action and all runtime dependencies into the committed `dist/index.js`. CI verifies the tests, lint checking, and that rebuilding does not change the committed bundle.

### Update existing tag

```sh
git tag -f v1.4.0
git push origin refs/tags/v1.4.0 --force
```
