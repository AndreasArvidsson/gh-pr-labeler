import assert from "node:assert/strict";
import {
    CHANGES_REQUESTED_LABEL,
    UPDATED_AFTER_CHANGES_REQUESTED_LABEL,
    getReviewLabelTransition,
} from "../src/review-labels.js";

suite("getReviewLabelTransition", () => {
    test("sets changes requested and clears the updated label", () => {
        assert.deepEqual(
            getReviewLabelTransition(
                { kind: "review-submitted", state: "changes_requested" },
                new Set([UPDATED_AFTER_CHANGES_REQUESTED_LABEL]),
            ),
            {
                add: [CHANGES_REQUESTED_LABEL],
                remove: [UPDATED_AFTER_CHANGES_REQUESTED_LABEL],
            },
        );
    });

    test("replaces changes requested after a push", () => {
        assert.deepEqual(
            getReviewLabelTransition(
                { kind: "pull-request-synchronized" },
                new Set([CHANGES_REQUESTED_LABEL]),
            ),
            {
                add: [UPDATED_AFTER_CHANGES_REQUESTED_LABEL],
                remove: [CHANGES_REQUESTED_LABEL],
            },
        );
    });

    test("does nothing after a push without changes requested", () => {
        assert.deepEqual(
            getReviewLabelTransition(
                { kind: "pull-request-synchronized" },
                new Set(),
            ),
            { add: [], remove: [] },
        );
    });

    test("clears both review labels after approval", () => {
        assert.deepEqual(
            getReviewLabelTransition(
                { kind: "review-submitted", state: "APPROVED" },
                new Set(),
            ),
            {
                add: [],
                remove: [
                    CHANGES_REQUESTED_LABEL,
                    UPDATED_AFTER_CHANGES_REQUESTED_LABEL,
                ],
            },
        );
    });

    test("ignores other review states", () => {
        assert.deepEqual(
            getReviewLabelTransition(
                { kind: "review-submitted", state: "commented" },
                new Set(),
            ),
            { add: [], remove: [] },
        );
    });
});
