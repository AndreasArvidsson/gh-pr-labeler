import * as core from "@actions/core";
import type { GitHub } from "@actions/github/lib/utils";
import { getErrorStatus } from "./getErrorStatus";
import { LINES_LABELS } from "./linesLabels";
import { REVIEW_LABELS } from "./reviewLabels";
import type { LabelDefinition } from "./types";

export async function createMissingLabels(
    octokit: InstanceType<typeof GitHub>,
    owner: string,
    repo: string,
): Promise<void> {
    const labels: readonly LabelDefinition[] = [
        ...LINES_LABELS,
        ...REVIEW_LABELS,
    ];

    for (const label of labels) {
        try {
            await octokit.rest.issues.getLabel({
                owner,
                repo,
                name: label.name,
            });
            continue;
        } catch (error: unknown) {
            if (getErrorStatus(error) !== 404) {
                throw error;
            }
        }

        try {
            await octokit.rest.issues.createLabel({
                owner,
                repo,
                name: label.name,
                color: label.color,
                description: label.description,
            });
            core.info(`Created label: ${label.name}`);
        } catch (createError: unknown) {
            if (getErrorStatus(createError) !== 422) {
                throw createError;
            }

            // Another concurrent run may have created the label after our lookup.
            await octokit.rest.issues.getLabel({
                owner,
                repo,
                name: label.name,
            });
        }
    }
}
