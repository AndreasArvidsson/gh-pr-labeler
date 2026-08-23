import { getReviewLabelTransition } from "./review-labels.js";
import { SIZE_LABEL_PREFIX, getSizeLabel } from "./size-labels.js";
import type {
    LabelTransition,
    PullRequestPayload,
    ReviewEvent,
} from "./types.js";

export function getLabelTransition(
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
        const numChangedLines = pullRequest.additions + pullRequest.deletions;
        const sizeLabel = getSizeLabel(numChangedLines);
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
        reviewState != null
    ) {
        reviewEvent = { kind: "review-submitted", state: reviewState };
    }

    if (reviewEvent != null) {
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
