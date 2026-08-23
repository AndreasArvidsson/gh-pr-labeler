import assert from "node:assert/strict";
import { getLatestRelevantReviewInner } from "../src/getLatestRelevantReview";

suite("getLatestRelevantReview", () => {
    test("returns the latest submitted state-changing review", () => {
        const review = getLatestRelevantReviewInner([
            {
                state: "CHANGES_REQUESTED",
                commit_id: "old",
                submitted_at: "2026-01-01T00:00:00Z",
            },
            {
                state: "COMMENTED",
                commit_id: "head",
                submitted_at: "2026-01-02T00:00:00Z",
            },
            {
                state: "APPROVED",
                commit_id: "head",
                submitted_at: "2026-01-03T00:00:00Z",
            },
        ]);

        assert.equal(review?.state, "APPROVED");
    });

    test("ignores pending, dismissed, and non-state-changing reviews", () => {
        const review = getLatestRelevantReviewInner([
            { state: "PENDING", commit_id: "head" },
            {
                state: "DISMISSED",
                commit_id: "head",
                submitted_at: "2026-01-01T00:00:00Z",
            },
            {
                state: "COMMENTED",
                commit_id: "head",
                submitted_at: "2026-01-01T00:00:00Z",
            },
        ]);

        assert.equal(review, undefined);
    });
});
