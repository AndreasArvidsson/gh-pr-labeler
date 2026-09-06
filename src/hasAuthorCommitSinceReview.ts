import { REVIEW_CHANGES_REQUESTED } from "./constants.js";
import type { Octokit, PullRequestReview } from "./types.js";

export async function hasAuthorCommitSinceReview(
    octokit: Octokit,
    owner: string,
    repo: string,
    authorId: number,
    headSha: string,
    baseSha: string,
    review: PullRequestReview | undefined,
): Promise<boolean> {
    // Skip comparison unless changes were requested on a known commit different from the current head.
    if (
        review?.state.toUpperCase() !== REVIEW_CHANGES_REQUESTED ||
        review.commit_id == null ||
        review.commit_id === headSha
    ) {
        return false;
    }

    const authorCommits = new Set<string>();

    for (let page = 1; ; page++) {
        // Fetch commits in the current head's history that are absent from the reviewed commit's history.
        // The reviewed commit and its ancestors are excluded, regardless of commit timestamps.
        const { data } = await octokit.rest.repos.compareCommits({
            owner,
            repo,
            base: review.commit_id,
            head: headSha,
            per_page: 100,
            page,
        });

        // Collect author commits even if someone else authored the latest commit.
        for (const commit of data.commits) {
            if (commit.author?.id === authorId) {
                authorCommits.add(commit.sha);
            }
        }

        // Stop when all commits have been checked or the API returns an empty page.
        if (page * 100 >= data.total_commits || data.commits.length === 0) {
            break;
        }
    }

    if (authorCommits.size === 0) {
        return false;
    }

    for (let page = 1; ; page++) {
        // Only commits absent from the base branch can represent new PR work.
        // This excludes unrelated author commits brought in by merging the base branch.
        const { data } = await octokit.rest.repos.compareCommits({
            owner,
            repo,
            base: baseSha,
            head: headSha,
            per_page: 100,
            page,
        });

        if (data.commits.some((commit) => authorCommits.has(commit.sha))) {
            return true;
        }

        if (page * 100 >= data.total_commits || data.commits.length === 0) {
            return false;
        }
    }
}
