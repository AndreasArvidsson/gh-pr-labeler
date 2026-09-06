import assert from "node:assert/strict";
import { hasAuthorCommitSinceReview } from "../src/hasAuthorCommitSinceReview.js";
import type { Octokit } from "../src/types.js";

interface Commit {
    readonly sha: string;
    readonly author: { readonly id: number } | null;
    readonly committer?: { readonly id: number };
}

function createMock(
    commits: readonly Commit[],
    prCommits = commits,
): {
    readonly octokit: Octokit;
    readonly pages: readonly number[];
    readonly basePages: readonly number[];
} {
    const pages: number[] = [];
    const basePages: number[] = [];
    const octokit = {
        rest: {
            repos: {
                compareCommits: (parameters: {
                    owner: string;
                    repo: string;
                    base: string;
                    head: string;
                    page: number;
                    per_page: number;
                }): Promise<{
                    data: { commits: readonly Commit[]; total_commits: number };
                }> => {
                    assert.equal(parameters.owner, "owner");
                    assert.equal(parameters.repo, "repo");
                    assert.ok(["reviewed", "base"].includes(parameters.base));
                    assert.equal(parameters.head, "head");
                    assert.equal(parameters.per_page, 100);
                    const comparisonCommits =
                        parameters.base === "reviewed" ? commits : prCommits;
                    (parameters.base === "reviewed" ? pages : basePages).push(
                        parameters.page,
                    );
                    return Promise.resolve({
                        data: {
                            commits: comparisonCommits.slice(
                                (parameters.page - 1) * 100,
                                parameters.page * 100,
                            ),
                            total_commits: comparisonCommits.length,
                        },
                    });
                },
            },
        },
    };
    return {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        octokit: octokit as unknown as Octokit,
        pages,
        basePages,
    };
}

suite("hasAuthorCommitSinceReview", () => {
    test("finds an author commit even when the latest commit is someone else's", async () => {
        const mock = createMock([
            { sha: "author-fix", author: { id: 42 } },
            { sha: "other-fix", author: { id: 7 } },
        ]);
        assert.equal(
            await hasAuthorCommitSinceReview(
                mock.octokit,
                "owner",
                "repo",
                42,
                "head",
                "base",
                { state: "CHANGES_REQUESTED", commit_id: "reviewed" },
            ),
            true,
        );
    });

    test("does not count other authors, unknown authors, or the committer", async () => {
        const mock = createMock([
            { sha: "other-fix", author: { id: 7 }, committer: { id: 42 } },
            { sha: "unknown-fix", author: null },
        ]);
        assert.equal(
            await hasAuthorCommitSinceReview(
                mock.octokit,
                "owner",
                "repo",
                42,
                "head",
                "base",
                { state: "CHANGES_REQUESTED", commit_id: "reviewed" },
            ),
            false,
        );
    });

    test("checks later pages for the PR creator", async () => {
        const commits: Commit[] = Array.from({ length: 100 }, (_, index) => ({
            sha: `other-${index}`,
            author: { id: 7 },
        }));
        commits.push({ sha: "author-fix", author: { id: 42 } });
        const mock = createMock(commits);
        assert.equal(
            await hasAuthorCommitSinceReview(
                mock.octokit,
                "owner",
                "repo",
                42,
                "head",
                "base",
                { state: "CHANGES_REQUESTED", commit_id: "reviewed" },
            ),
            true,
        );
        assert.deepEqual(mock.pages, [1, 2]);
        assert.deepEqual(mock.basePages, [1, 2]);
    });

    test("skips comparison without an applicable review or a new head", async () => {
        const mock = createMock([]);
        for (const review of [
            undefined,
            { state: "APPROVED", commit_id: "reviewed" },
            { state: "CHANGES_REQUESTED", commit_id: null },
            { state: "CHANGES_REQUESTED", commit_id: "head" },
        ]) {
            assert.equal(
                await hasAuthorCommitSinceReview(
                    mock.octokit,
                    "owner",
                    "repo",
                    42,
                    "head",
                    "base",
                    review,
                ),
                false,
            );
        }
        assert.deepEqual(mock.pages, []);
        assert.deepEqual(mock.basePages, []);
    });

    test("ignores an unrelated author commit merged from the base branch", async () => {
        const oldAuthorCommit = { sha: "reviewed", author: { id: 42 } };
        const baseCommit = { sha: "base-work", author: { id: 42 } };
        const mergeCommit = { sha: "head", author: { id: 7 } };
        const mock = createMock(
            [baseCommit, mergeCommit],
            [oldAuthorCommit, mergeCommit],
        );

        assert.equal(
            await hasAuthorCommitSinceReview(
                mock.octokit,
                "owner",
                "repo",
                42,
                "head",
                "base",
                { state: "CHANGES_REQUESTED", commit_id: "reviewed" },
            ),
            false,
        );
    });

    test("still counts an author fix when the base branch was also merged", async () => {
        const baseCommit = { sha: "base-work", author: { id: 42 } };
        const authorFix = { sha: "author-fix", author: { id: 42 } };
        const mergeCommit = { sha: "head", author: { id: 7 } };
        const mock = createMock(
            [baseCommit, authorFix, mergeCommit],
            [authorFix, mergeCommit],
        );

        assert.equal(
            await hasAuthorCommitSinceReview(
                mock.octokit,
                "owner",
                "repo",
                42,
                "head",
                "base",
                { state: "CHANGES_REQUESTED", commit_id: "reviewed" },
            ),
            true,
        );
    });
});
