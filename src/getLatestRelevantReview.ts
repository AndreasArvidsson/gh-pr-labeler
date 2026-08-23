import type { Octokit, PullRequestReview } from "./types";

import { REVIEW_APPROVED, REVIEW_CHANGES_REQUESTED } from "./constants.js";

const RELEVANT_REVIEW_STATES = new Set([
    REVIEW_APPROVED,
    REVIEW_CHANGES_REQUESTED,
]);

export async function getLatestRelevantReview(
    octokit: Octokit,
    owner: string,
    repo: string,
    pullNumber: number,
): Promise<PullRequestReview | undefined> {
    const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
    });

    return getLatestRelevantReviewInner(reviews);
}

export function getLatestRelevantReviewInner(
    reviews: readonly PullRequestReview[],
): PullRequestReview | undefined {
    return reviews.findLast(
        (review) =>
            review.submitted_at != null &&
            RELEVANT_REVIEW_STATES.has(review.state.toUpperCase()),
    );
}
