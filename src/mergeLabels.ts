import type { LabelDefinition } from "./types.js";

export const MERGE_CONFLICTS_LABEL = "merge-conflicts";

export const MERGE_LABELS: readonly LabelDefinition[] = [
    {
        name: MERGE_CONFLICTS_LABEL,
        color: "d73a4a",
        description: "Pull request has merge conflicts with its base branch",
    },
];
