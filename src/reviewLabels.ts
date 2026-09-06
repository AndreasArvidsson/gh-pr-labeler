import type { LabelDefinition } from "./types.js";

export const CHANGES_REQUESTED_LABEL = "review/changes-requested";
export const UPDATED_AFTER_CHANGES_REQUESTED_LABEL =
    "review/updated-after-changes-requested";

export const REVIEW_LABELS: readonly LabelDefinition[] = [
    {
        name: CHANGES_REQUESTED_LABEL,
        color: "d73a4a",
        description: "A reviewer requested changes",
    },
    {
        name: UPDATED_AFTER_CHANGES_REQUESTED_LABEL,
        color: "0e8a16",
        description:
            "The PR creator pushed a commit after changes were requested",
    },
] as const;
