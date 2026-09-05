import type { SizeLabel } from "./types";

export const SIZE_LABEL_PREFIX = "size/";

export const SIZE_LABELS: readonly SizeLabel[] = [
    {
        name: "size/<10",
        maxValue: 9,
        color: "b7eb8f",
        description: "Pull request changes fewer than 10 lines",
    },
    {
        name: "size/10-49",
        maxValue: 49,
        color: "73d13d",
        description: "Pull request changes 10 to 49 lines",
    },
    {
        name: "size/50-199",
        maxValue: 199,
        color: "d3d74b",
        description: "Pull request changes 50 to 199 lines",
    },
    {
        name: "size/200-499",
        maxValue: 499,
        color: "fbca04",
        description: "Pull request changes 200 to 499 lines",
    },
    {
        name: "size/500-999",
        maxValue: 999,
        color: "f9a825",
        description: "Pull request changes 500 to 999 lines",
    },
    {
        name: "size/1000+",
        maxValue: Infinity,
        color: "d93f0b",
        description: "Pull request changes at least 1,000 lines",
    },
] as const;

export function getSizeLabel(changedLines: number): string {
    if (!Number.isFinite(changedLines) || changedLines < 0) {
        throw new RangeError(
            "changedLines must be a non-negative finite number",
        );
    }

    const label = SIZE_LABELS.find((l) => changedLines <= l.maxValue);

    if (label != null) {
        return label.name;
    }

    return SIZE_LABELS[SIZE_LABELS.length - 1].name;
}
