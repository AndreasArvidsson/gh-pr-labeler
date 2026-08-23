import assert from "node:assert/strict";
import { getLabelTransition } from "../src/getLabelTransition.js";
import {
    CHANGES_REQUESTED_LABEL,
    UPDATED_AFTER_CHANGES_REQUESTED_LABEL,
} from "../src/review-labels.js";

suite("getLabelTransition", () => {
    test("replaces the existing size label without touching unrelated labels", () => {
        const transition = getLabelTransition(
            "pull_request",
            "opened",
            undefined,
            { number: 42, additions: 125, deletions: 75 },
            new Set(["size/<50", "bug"]),
        );

        assert.deepEqual(transition, {
            add: ["size/200-499"],
            remove: ["size/<50"],
        });
    });

    test("combines size and review transitions after new commits", () => {
        const transition = getLabelTransition(
            "pull_request",
            "synchronize",
            undefined,
            { number: 42, additions: 40, deletions: 20 },
            new Set(["size/<50", CHANGES_REQUESTED_LABEL, "bug"]),
        );

        assert.deepEqual(
            new Set(transition.add),
            new Set(["size/50-199", UPDATED_AFTER_CHANGES_REQUESTED_LABEL]),
        );
        assert.deepEqual(
            new Set(transition.remove),
            new Set(["size/<50", CHANGES_REQUESTED_LABEL]),
        );
    });

    test("routes submitted approvals without recalculating size", () => {
        const transition = getLabelTransition(
            "pull_request_review",
            "submitted",
            "approved",
            { number: 42, additions: 600, deletions: 400 },
            new Set([
                "size/<50",
                CHANGES_REQUESTED_LABEL,
                UPDATED_AFTER_CHANGES_REQUESTED_LABEL,
            ]),
        );

        assert.deepEqual(transition, {
            add: [],
            remove: [
                CHANGES_REQUESTED_LABEL,
                UPDATED_AFTER_CHANGES_REQUESTED_LABEL,
            ],
        });
    });
});
