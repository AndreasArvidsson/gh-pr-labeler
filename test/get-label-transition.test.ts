import assert from "node:assert/strict";
import { getLabelTransition } from "../src/getLabelTransition.js";
import {
    CHANGES_REQUESTED_LABEL,
    UPDATED_AFTER_CHANGES_REQUESTED_LABEL,
} from "../src/reviewLabels.js";

suite("getLabelTransition", () => {
    test("replaces the existing lines label without touching unrelated labels", () => {
        const transition = getLabelTransition(
            { number: 42, additions: 125, deletions: 75 },
            "head",
            undefined,
            new Set(["lines/<50", "bug"]),
        );

        assert.deepEqual(transition, {
            add: ["lines/200-499"],
            remove: [
                "lines/<50",
                CHANGES_REQUESTED_LABEL,
                UPDATED_AFTER_CHANGES_REQUESTED_LABEL,
            ],
        });
    });

    test("recalculates lines and marks updates after requested changes", () => {
        const transition = getLabelTransition(
            { number: 42, additions: 40, deletions: 20 },
            "new-head",
            {
                state: "CHANGES_REQUESTED",
                commit_id: "old-head",
                submitted_at: "2026-01-01T00:00:00Z",
            },
            new Set(["lines/<50", CHANGES_REQUESTED_LABEL, "bug"]),
        );

        assert.deepEqual(
            new Set(transition.add),
            new Set(["lines/50-199", UPDATED_AFTER_CHANGES_REQUESTED_LABEL]),
        );
        assert.deepEqual(
            new Set(transition.remove),
            new Set(["lines/<50", CHANGES_REQUESTED_LABEL]),
        );
    });

    test("recalculates lines and clears review labels after approval", () => {
        const transition = getLabelTransition(
            { number: 42, additions: 600, deletions: 400 },
            "head",
            {
                state: "APPROVED",
                commit_id: "head",
                submitted_at: "2026-01-01T00:00:00Z",
            },
            new Set([
                "lines/<50",
                CHANGES_REQUESTED_LABEL,
                UPDATED_AFTER_CHANGES_REQUESTED_LABEL,
            ]),
        );

        assert.deepEqual(transition, {
            add: ["lines/1000+"],
            remove: [
                "lines/<50",
                CHANGES_REQUESTED_LABEL,
                UPDATED_AFTER_CHANGES_REQUESTED_LABEL,
            ],
        });
    });

    test("recalculates lines and sets changes requested for a review on the current commit", () => {
        const transition = getLabelTransition(
            { number: 42, additions: 20, deletions: 10 },
            "head",
            {
                state: "CHANGES_REQUESTED",
                commit_id: "head",
                submitted_at: "2026-01-01T00:00:00Z",
            },
            new Set([UPDATED_AFTER_CHANGES_REQUESTED_LABEL]),
        );

        assert.deepEqual(
            new Set(transition.add),
            new Set(["lines/10-49", CHANGES_REQUESTED_LABEL]),
        );
        assert.deepEqual(transition.remove, [
            UPDATED_AFTER_CHANGES_REQUESTED_LABEL,
        ]);
    });

    test("clears review labels when no relevant review remains", () => {
        const transition = getLabelTransition(
            { number: 42, additions: 20, deletions: 10 },
            "head",
            undefined,
            new Set([
                CHANGES_REQUESTED_LABEL,
                UPDATED_AFTER_CHANGES_REQUESTED_LABEL,
            ]),
        );

        assert.deepEqual(transition, {
            add: ["lines/10-49"],
            remove: [
                CHANGES_REQUESTED_LABEL,
                UPDATED_AFTER_CHANGES_REQUESTED_LABEL,
            ],
        });
    });
});
