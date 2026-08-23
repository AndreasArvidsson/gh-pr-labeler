import * as core from "@actions/core";
import * as github from "@actions/github";
import type { LabelTransition, ReviewEvent } from "./review-labels.js";
import { REVIEW_LABELS, getReviewLabelTransition } from "./review-labels.js";
import { SIZE_LABEL_PREFIX, SIZE_LABELS, getSizeLabel } from "./size-labels.js";

interface LabelDefinition {
    readonly name: string;
    readonly color: string;
    readonly description: string;
}

interface PullRequestPayload {
    readonly number: number;
    readonly additions: number;
    readonly deletions: number;
}

interface ActionPayload {
    readonly action?: string;
    readonly pull_request?: PullRequestPayload;
    readonly review?: {
        readonly state?: string;
    };
}

function getStatus(error: unknown): number | undefined {
    if (typeof error !== "object" || error == null || !("status" in error)) {
        return undefined;
    }

    return typeof error.status === "number" ? error.status : undefined;
}

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
    const definitions: readonly LabelDefinition[] = [
        ...SIZE_LABELS,
        ...REVIEW_LABELS,
    ];

    for (const definition of definitions) {
        try {
            await octokit.rest.issues.getLabel({
                owner,
                repo,
                name: definition.name,
            });
        } catch (error: unknown) {
            if (getStatus(error) !== 404) {
                throw error;
            }

            try {
                await octokit.rest.issues.createLabel({
                    owner,
                    repo,
                    name: definition.name,
                    color: definition.color,
                    description: definition.description,
                });
                core.info(`Created label ${definition.name}`);
            } catch (createError: unknown) {
                if (getStatus(createError) !== 422) {
                    throw createError;
                }

                // Another concurrent run may have created the label after our lookup.
                await octokit.rest.issues.getLabel({
                    owner,
                    repo,
                    name: definition.name,
                });
            }
        }
    }

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
    const transition = getTransition(
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
            if (getStatus(error) !== 404) {
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

function getTransition(
    eventName: string,
    action: string | undefined,
    reviewState: string | undefined,
    pullRequest: PullRequestPayload,
    currentLabels: ReadonlySet<string>,
): LabelTransition {
    const add = new Set<string>();
    const remove = new Set<string>();

    if (
        eventName === "pull_request" &&
        (action === "opened" ||
            action === "reopened" ||
            action === "synchronize")
    ) {
        const sizeLabel = getSizeLabel(
            pullRequest.additions + pullRequest.deletions,
        );
        add.add(sizeLabel);

        for (const label of currentLabels) {
            if (label.startsWith(SIZE_LABEL_PREFIX) && label !== sizeLabel) {
                remove.add(label);
            }
        }
    }

    let reviewEvent: ReviewEvent | undefined;
    if (eventName === "pull_request" && action === "synchronize") {
        reviewEvent = { kind: "pull-request-synchronized" };
    } else if (
        eventName === "pull_request_review" &&
        action === "submitted" &&
        reviewState !== undefined
    ) {
        reviewEvent = { kind: "review-submitted", state: reviewState };
    }

    if (reviewEvent !== undefined) {
        const reviewTransition = getReviewLabelTransition(
            reviewEvent,
            currentLabels,
        );
        for (const label of reviewTransition.add) {
            add.add(label);
        }
        for (const label of reviewTransition.remove) {
            remove.add(label);
        }
    }

    for (const label of remove) {
        add.delete(label);
    }

    return { add: [...add], remove: [...remove] };
}

// oxlint-disable-next-line promise/prefer-await-to-then
run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`Failed to update pull request labels: ${message}`);
});
