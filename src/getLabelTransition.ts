import { REVIEW_CHANGES_REQUESTED } from "./constants.js";
import { LINES_LABEL_PREFIX, getLinesLabel } from "./linesLabels.js";
import {
    CHANGES_REQUESTED_LABEL,
    UPDATED_AFTER_CHANGES_REQUESTED_LABEL,
} from "./reviewLabels.js";
import type {
    LabelTransition,
    PullRequestPayload,
    PullRequestReview,
} from "./types.js";

export function getLabelTransition(
    pullRequest: PullRequestPayload,
    latestReview: PullRequestReview | undefined,
    currentLabels: ReadonlySet<string>,
    hasAuthorCommitSinceReview: boolean,
): LabelTransition {
    const add = new Set<string>();
    const remove = new Set<string>();
    const numChangedLines = pullRequest.additions + pullRequest.deletions;
    const linesLabel = getLinesLabel(numChangedLines);
    add.add(linesLabel);

    // Remove any existing lines label that is different from the chosen one.
    for (const label of currentLabels) {
        if (label.startsWith(LINES_LABEL_PREFIX) && label !== linesLabel) {
            remove.add(label);
        }
    }

    // Review has changes requested: Update labels based on whether the author has committed since the review.
    if (latestReview?.state.toUpperCase() === REVIEW_CHANGES_REQUESTED) {
        if (hasAuthorCommitSinceReview) {
            add.add(UPDATED_AFTER_CHANGES_REQUESTED_LABEL);
            remove.add(CHANGES_REQUESTED_LABEL);
        } else {
            add.add(CHANGES_REQUESTED_LABEL);
            remove.add(UPDATED_AFTER_CHANGES_REQUESTED_LABEL);
        }
    }
    // Review is approved all there is no review: Remove all review-related labels
    else {
        remove.add(CHANGES_REQUESTED_LABEL);
        remove.add(UPDATED_AFTER_CHANGES_REQUESTED_LABEL);
    }

    for (const label of remove) {
        add.delete(label);
    }

    return { add: [...add], remove: [...remove] };
}
