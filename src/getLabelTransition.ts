import { REVIEW_APPROVED, REVIEW_CHANGES_REQUESTED } from "./constants.js";
import {
    CHANGES_REQUESTED_LABEL,
    UPDATED_AFTER_CHANGES_REQUESTED_LABEL,
} from "./review-labels.js";
import { SIZE_LABEL_PREFIX, getSizeLabel } from "./size-labels.js";
import type {
    LabelTransition,
    PullRequestPayload,
    PullRequestReview,
} from "./types.js";

export function getLabelTransition(
    pullRequest: PullRequestPayload,
    headSha: string,
    latestReview: PullRequestReview | undefined,
    currentLabels: ReadonlySet<string>,
): LabelTransition {
    const add = new Set<string>();
    const remove = new Set<string>();
    const numChangedLines = pullRequest.additions + pullRequest.deletions;
    const sizeLabel = getSizeLabel(numChangedLines);
    add.add(sizeLabel);

    for (const label of currentLabels) {
        if (label.startsWith(SIZE_LABEL_PREFIX) && label !== sizeLabel) {
            remove.add(label);
        }
    }

    const reviewState = latestReview?.state.toUpperCase();

    if (reviewState === REVIEW_APPROVED) {
        remove.add(CHANGES_REQUESTED_LABEL);
        remove.add(UPDATED_AFTER_CHANGES_REQUESTED_LABEL);
    } else if (
        latestReview != null &&
        reviewState === REVIEW_CHANGES_REQUESTED
    ) {
        if (latestReview.commit_id === headSha) {
            add.add(CHANGES_REQUESTED_LABEL);
            remove.add(UPDATED_AFTER_CHANGES_REQUESTED_LABEL);
        } else {
            add.add(UPDATED_AFTER_CHANGES_REQUESTED_LABEL);
            remove.add(CHANGES_REQUESTED_LABEL);
        }
    } else {
        remove.add(CHANGES_REQUESTED_LABEL);
        remove.add(UPDATED_AFTER_CHANGES_REQUESTED_LABEL);
    }

    for (const label of remove) {
        add.delete(label);
    }

    return { add: [...add], remove: [...remove] };
}
