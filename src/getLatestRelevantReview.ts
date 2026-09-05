import type { Octokit, PullRequestReview } from "./types";

import { REVIEW_APPROVED, REVIEW_CHANGES_REQUESTED } from "./constants.js";

const RELEVANT_REVIEW_STATES = new Set([
    REVIEW_APPROVED,
    REVIEW_CHANGES_REQUESTED,
]);

const permissionsCache = new Map<string, boolean>();

export async function getLatestRelevantReview(
    octokit: Octokit,
    owner: string,
    repo: string,
    pullNumber: number,
): Promise<PullRequestReview | undefined> {
    permissionsCache.clear();

    const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
    });

    for (let index = reviews.length - 1; index >= 0; index--) {
        const review = reviews[index];
        const username = review.user?.login;

        if (
            username == null ||
            review.submitted_at == null ||
            !RELEVANT_REVIEW_STATES.has(review.state.toUpperCase())
        ) {
            continue;
        }

        const isUserReviewer = await isAllowedReviewer(
            octokit,
            owner,
            repo,
            username,
        );

        if (!isUserReviewer) {
            continue;
        }

        return review;
    }

    return undefined;
}

async function isAllowedReviewer(
    octokit: Octokit,
    owner: string,
    repo: string,
    username: string,
): Promise<boolean> {
    let canReview = permissionsCache.get(username);

    if (canReview != null) {
        return canReview;
    }

    const { data } = await octokit.rest.repos.getCollaboratorPermissionLevel({
        owner,
        repo,
        username,
    });

    // GitHub maps maintain to write and triage to read in this field.
    // permissions = none | read | write | admin
    canReview = data.permission === "write" || data.permission === "admin";

    permissionsCache.set(username, canReview);

    return canReview;
}
