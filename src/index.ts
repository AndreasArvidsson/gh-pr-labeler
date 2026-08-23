import * as core from "@actions/core";
import * as github from "@actions/github";
import { createMissingLabels } from "./createMissingLabels.js";
import { getErrorStatus } from "./getErrorStatus.js";
import { getLabelTransition } from "./getLabelTransition.js";
import type { ActionPayload } from "./types.js";

async function run(): Promise<void> {
    const token = core.getInput("github-token", { required: true });
    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const payload = github.context.payload as ActionPayload;
    const pullRequest = payload.pull_request;

    if (pullRequest == null) {
        core.info(
            `Ignoring ${github.context.eventName}: event has no pull request`,
        );
        return;
    }

    // GH represents PR as a special type of issue internally
    const issueNumber = pullRequest.number;

    await createMissingLabels(octokit, owner, repo);

    const labelsResponse = await octokit.paginate(
        octokit.rest.issues.listLabelsOnIssue,
        {
            owner,
            repo,
            issue_number: issueNumber,
            per_page: 100,
        },
    );
    const currentLabels = new Set(
        labelsResponse
            .map((label) => label.name)
            .filter((name): name is string => typeof name === "string"),
    );
    const transition = getLabelTransition(
        github.context.eventName,
        payload.action,
        payload.review?.state,
        pullRequest,
        currentLabels,
    );

    for (const label of transition.remove) {
        if (!currentLabels.has(label)) {
            continue;
        }

        try {
            await octokit.rest.issues.removeLabel({
                owner,
                repo,
                issue_number: issueNumber,
                name: label,
            });
            core.info(`Removed label ${label}`);
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
            issue_number: issueNumber,
            labels: labelsToAdd,
        });
        core.info(`Added ${labelsToAdd.join(", ")}`);
    }
}

// oxlint-disable-next-line promise/prefer-await-to-then
run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`Failed to update pull request labels: ${message}`);
});
