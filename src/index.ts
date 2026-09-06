import * as core from "@actions/core";
import * as github from "@actions/github";
import { createMissingLabels } from "./createMissingLabels.js";
import { getErrorStatus } from "./getErrorStatus.js";
import { getLabelTransition } from "./getLabelTransition.js";
import { getLatestRelevantReview } from "./getLatestRelevantReview.js";
import { hasAuthorCommitSinceReview } from "./hasAuthorCommitSinceReview.js";
import { resolvePullNumber } from "./resolvePullNumber.js";
import type { ActionPayload } from "./types.js";

async function run(): Promise<void> {
    const token = core.getInput("github-token", { required: true });
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const payload = github.context.payload as ActionPayload;
    const pullNumber = await resolvePullNumber(
        octokit,
        owner,
        repo,
        github.context.eventName,
        payload,
    );

    if (pullNumber == null) {
        core.info(`Ignoring unsupported ${github.context.eventName} event`);
        return;
    }

    await createMissingLabels(octokit, owner, repo);

    const [{ data: pullRequest }, relevantReview, labels] = await Promise.all([
        octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber }),
        getLatestRelevantReview(octokit, owner, repo, pullNumber),
        // GH represents PRs as a special type of issue internally
        octokit.paginate(octokit.rest.issues.listLabelsOnIssue, {
            owner,
            repo,
            issue_number: pullNumber,
            per_page: 100,
        }),
    ]);
    const currentLabels = new Set(labels.map((label) => label.name));
    const hasCommitAfterReview = await hasAuthorCommitSinceReview(
        octokit,
        owner,
        repo,
        pullRequest.user.id,
        pullRequest.head.sha,
        pullRequest.base.sha,
        relevantReview,
    );
    const transition = getLabelTransition(
        {
            number: pullRequest.number,
            additions: pullRequest.additions,
            deletions: pullRequest.deletions,
        },
        relevantReview,
        currentLabels,
        hasCommitAfterReview,
    );

    for (const label of transition.remove) {
        if (!currentLabels.has(label)) {
            continue;
        }

        try {
            await octokit.rest.issues.removeLabel({
                owner,
                repo,
                // GH represents PR as a special type of issue internally
                issue_number: pullNumber,
                name: label,
            });
            core.info(`Removed label: ${label}`);
        } catch (error: unknown) {
            if (getErrorStatus(error) !== 404) {
                throw error;
            }
        }
    }

    const labelsToAdd = transition.add.filter(
        (label) => !currentLabels.has(label),
    );
    if (labelsToAdd.length > 0) {
        await octokit.rest.issues.addLabels({
            owner,
            repo,
            issue_number: pullNumber,
            labels: labelsToAdd,
        });
        for (const label of labelsToAdd) {
            core.info(`Added label: ${label}`);
        }
    }
}

// oxlint-disable-next-line promise/prefer-await-to-then
run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`Failed to update pull request labels: ${message}`);
});
