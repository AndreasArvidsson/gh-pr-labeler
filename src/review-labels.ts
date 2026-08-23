export const CHANGES_REQUESTED_LABEL = "review/changes-requested";
export const UPDATED_AFTER_CHANGES_REQUESTED_LABEL =
    "review/updated-after-changes-requested";

export const REVIEW_LABELS = [
    {
        name: CHANGES_REQUESTED_LABEL,
        color: "d73a4a",
        description: "A reviewer requested changes",
    },
    {
        name: UPDATED_AFTER_CHANGES_REQUESTED_LABEL,
        color: "0e8a16",
        description: "New commits were pushed after changes were requested",
    },
] as const;

export type ReviewEvent =
    | { kind: "review-submitted"; state: string }
    | { kind: "pull-request-synchronized" };

export interface LabelTransition {
    add: readonly string[];
    remove: readonly string[];
}

export function getReviewLabelTransition(
    event: ReviewEvent,
    currentLabels: ReadonlySet<string>,
): LabelTransition {
    if (event.kind === "pull-request-synchronized") {
        if (currentLabels.has(CHANGES_REQUESTED_LABEL)) {
            return {
                add: [UPDATED_AFTER_CHANGES_REQUESTED_LABEL],
                remove: [CHANGES_REQUESTED_LABEL],
            };
        }

        return { add: [], remove: [] };
    }

    const state = event.state.toUpperCase();

    if (state === "CHANGES_REQUESTED") {
        return {
            add: [CHANGES_REQUESTED_LABEL],
            remove: [UPDATED_AFTER_CHANGES_REQUESTED_LABEL],
        };
    }

    if (state === "APPROVED") {
        return {
            add: [],
            remove: [
                CHANGES_REQUESTED_LABEL,
                UPDATED_AFTER_CHANGES_REQUESTED_LABEL,
            ],
        };
    }

    return { add: [], remove: [] };
}
