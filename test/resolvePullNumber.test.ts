import assert from "node:assert/strict";
import { resolvePullNumber } from "../src/resolvePullNumber.js";
import type { Octokit } from "../src/types.js";

interface OctokitMock {
    readonly octokit: Octokit;
    readonly requestedCommitShas: readonly string[];
    readonly requestedPullLists: readonly unknown[];
    readonly requestedReviewLists: readonly unknown[];
}

interface OpenPullRequest {
    readonly number: number;
    readonly head: {
        readonly ref: string;
        readonly sha?: string;
        readonly repo: { readonly id: number } | null;
    };
}

function listReviews(): never {
    throw new Error("The endpoint should be passed to paginate");
}

function listPullRequestsAssociatedWithCommit(): never {
    throw new Error("The endpoint should be passed to paginate");
}

function createOctokitMock(
    associatedPullRequests: readonly { readonly number: number }[] = [],
    openPullRequests: readonly OpenPullRequest[] = [],
    reviews: Readonly<
        Record<number, readonly { readonly commit_id: string }[]>
    > = {},
    closedPullRequests: readonly OpenPullRequest[] = [],
): OctokitMock {
    const requestedCommitShas: string[] = [];
    const requestedPullLists: unknown[] = [];
    const requestedReviewLists: unknown[] = [];
    const octokit = {
        paginate: (
            endpoint: unknown,
            parameters: {
                readonly commit_sha: string;
                readonly pull_number: number;
            },
        ): Promise<readonly unknown[]> => {
            if (endpoint === listReviews) {
                requestedReviewLists.push(parameters);
                return Promise.resolve(reviews[parameters.pull_number] ?? []);
            }
            if (endpoint === listClosedPullRequests) {
                requestedPullLists.push(parameters);
                return Promise.resolve(openPullRequests);
            }
            assert.equal(endpoint, listPullRequestsAssociatedWithCommit);
            requestedCommitShas.push(parameters.commit_sha);
            return Promise.resolve(associatedPullRequests);
        },
        rest: {
            repos: { listPullRequestsAssociatedWithCommit },
            pulls: { list: listClosedPullRequests, listReviews },
        },
    };

    function listClosedPullRequests(
        parameters: unknown,
    ): Promise<{ data: readonly OpenPullRequest[] }> {
        requestedPullLists.push(parameters);
        return Promise.resolve({ data: closedPullRequests });
    }

    return {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        octokit: octokit as unknown as Octokit,
        requestedCommitShas,
        requestedPullLists,
        requestedReviewLists,
    };
}

suite("resolvePullNumber", () => {
    for (const advanced of [false, true]) {
        test(`finds a merged fork PR ${advanced ? "by its reviewed commit" : "by its head SHA"}`, async () => {
            const mock = createOctokitMock(
                [],
                [],
                {
                    2293: [{ commit_id: "review-head" }],
                },
                [
                    {
                        number: 2293,
                        head: {
                            ref: "feature",
                            sha: advanced ? "new-head" : "review-head",
                            repo: { id: 2 },
                        },
                    },
                ],
            );
            assert.equal(
                await resolvePullNumber(
                    mock.octokit,
                    "owner",
                    "repo",
                    "workflow_run",
                    {
                        workflow_run: {
                            conclusion: "success",
                            event: "pull_request_review",
                            head_sha: "review-head",
                            head_branch: "feature",
                            head_repository: { id: 1 },
                            pull_requests: [],
                        },
                    },
                ),
                2293,
            );
            assert.deepEqual(mock.requestedPullLists, [
                { owner: "owner", repo: "repo", state: "open", per_page: 100 },
                {
                    owner: "owner",
                    repo: "repo",
                    state: "closed",
                    sort: "updated",
                    direction: "desc",
                    per_page: 100,
                },
            ]);
        });
    }

    test("skips a closed PR from a reused branch without commit evidence", async () => {
        const mock = createOctokitMock([], [], {}, [
            {
                number: 42,
                head: { ref: "feature", sha: "old-head", repo: { id: 1 } },
            },
        ]);
        assert.equal(
            await resolvePullNumber(
                mock.octokit,
                "owner",
                "repo",
                "workflow_run",
                {
                    workflow_run: {
                        conclusion: "success",
                        event: "pull_request_review",
                        head_sha: "new-head",
                        head_branch: "feature",
                        head_repository: { id: 1 },
                    },
                },
            ),
            undefined,
        );
    });

    test("uses the pull request from a direct event", async () => {
        const mock = createOctokitMock();
        const pullNumber = await resolvePullNumber(
            mock.octokit,
            "owner",
            "repo",
            "pull_request",
            {
                pull_request: { number: 42, additions: 1, deletions: 2 },
            },
        );

        assert.equal(pullNumber, 42);
        assert.deepEqual(mock.requestedCommitShas, []);
    });

    test("uses the pull request included in a workflow run", async () => {
        const mock = createOctokitMock();
        const pullNumber = await resolvePullNumber(
            mock.octokit,
            "owner",
            "repo",
            "workflow_run",
            {
                workflow_run: {
                    conclusion: "success",
                    event: "pull_request_review",
                    pull_requests: [{ number: 42 }],
                },
            },
        );

        assert.equal(pullNumber, 42);
        assert.deepEqual(mock.requestedCommitShas, []);
    });

    test("finds a fork pull request from the workflow head commit", async () => {
        const mock = createOctokitMock([{ number: 42 }]);
        const pullNumber = await resolvePullNumber(
            mock.octokit,
            "owner",
            "repo",
            "workflow_run",
            {
                workflow_run: {
                    conclusion: "success",
                    event: "pull_request",
                    head_sha: "fork-head",
                    pull_requests: [],
                },
            },
        );

        assert.equal(pullNumber, 42);
        assert.deepEqual(mock.requestedCommitShas, ["fork-head"]);
    });

    test("finds the source branch when a branch update has no commit association", async () => {
        const mock = createOctokitMock(
            [],
            [
                { number: 41, head: { ref: "feature", repo: { id: 2 } } },
                { number: 42, head: { ref: "feature", repo: { id: 1 } } },
                { number: 43, head: { ref: "other", repo: { id: 1 } } },
                { number: 44, head: { ref: "feature", repo: null } },
            ],
        );
        const pullNumber = await resolvePullNumber(
            mock.octokit,
            "owner",
            "repo",
            "workflow_run",
            {
                workflow_run: {
                    conclusion: "success",
                    event: "pull_request",
                    head_sha: "update-branch-merge",
                    head_branch: "feature",
                    head_repository: { id: 1 },
                    pull_requests: [],
                },
            },
        );

        assert.equal(pullNumber, 42);
        assert.deepEqual(mock.requestedCommitShas, ["update-branch-merge"]);
        assert.deepEqual(mock.requestedPullLists, [
            { owner: "owner", repo: "repo", state: "open", per_page: 100 },
        ]);
    });

    test("finds a fork review PR when the run reports the base repository", async () => {
        const mock = createOctokitMock(
            [],
            [
                {
                    number: 2316,
                    head: {
                        ref: "push-tpqxnvkyksnv",
                        sha: "review-head",
                        repo: { id: 2 },
                    },
                },
                {
                    number: 2317,
                    head: {
                        ref: "push-tpqxnvkyksnv",
                        sha: "other-head",
                        repo: { id: 3 },
                    },
                },
            ],
        );

        const pullNumber = await resolvePullNumber(
            mock.octokit,
            "owner",
            "repo",
            "workflow_run",
            {
                workflow_run: {
                    conclusion: "success",
                    event: "pull_request_review",
                    head_sha: "review-head",
                    head_branch: "push-tpqxnvkyksnv",
                    head_repository: { id: 1 },
                    pull_requests: [],
                },
            },
        );

        assert.equal(pullNumber, 2316);
        assert.deepEqual(mock.requestedCommitShas, ["review-head"]);
        assert.equal(mock.requestedPullLists.length, 1);
    });

    test("finds a fork review after its branch advances using the reviewed commit", async () => {
        const mock = createOctokitMock(
            [],
            [
                {
                    number: 2316,
                    head: { ref: "feature", sha: "new-head", repo: { id: 2 } },
                },
                {
                    number: 2317,
                    head: {
                        ref: "feature",
                        sha: "other-head",
                        repo: { id: 3 },
                    },
                },
                {
                    number: 2318,
                    head: { ref: "other", sha: "other-head", repo: { id: 2 } },
                },
            ],
            {
                2316: [{ commit_id: "old-head" }],
                2317: [{ commit_id: "unrelated-head" }],
                2318: [{ commit_id: "old-head" }],
            },
        );
        const pullNumber = await resolvePullNumber(
            mock.octokit,
            "owner",
            "repo",
            "workflow_run",
            {
                workflow_run: {
                    conclusion: "success",
                    event: "pull_request_review",
                    head_sha: "old-head",
                    head_branch: "feature",
                    head_repository: { id: 1 },
                    pull_requests: [],
                },
            },
        );

        assert.equal(pullNumber, 2316);
        assert.deepEqual(mock.requestedReviewLists, [
            { owner: "owner", repo: "repo", pull_number: 2316, per_page: 100 },
            { owner: "owner", repo: "repo", pull_number: 2317, per_page: 100 },
        ]);
    });

    test("skips an unverified fork branch for a dismissed review", async () => {
        const mock = createOctokitMock(
            [],
            [
                {
                    number: 2317,
                    head: {
                        ref: "antigravity",
                        sha: "656bb9089f23acd7ed0e68e75a573a0f78599793",
                        repo: { id: 905_965_742 },
                    },
                },
                {
                    number: 2318,
                    head: {
                        ref: "other",
                        sha: "other-head",
                        repo: { id: 2 },
                    },
                },
            ],
            {
                2317: [
                    {
                        commit_id: "02772cc2a52ff628738528aa3181da5ffcd08b7b",
                    },
                ],
            },
        );

        assert.equal(
            await resolvePullNumber(
                mock.octokit,
                "talonhub",
                "community",
                "workflow_run",
                {
                    workflow_run: {
                        conclusion: "success",
                        event: "pull_request_review",
                        head_sha: "cc2dcaa9afcef6ffb084ae0aad9e34e2cf836fea",
                        head_branch: "antigravity",
                        head_repository: { id: 240_185_541 },
                        pull_requests: [],
                    },
                },
            ),
            undefined,
        );
        assert.deepEqual(mock.requestedReviewLists, [
            {
                owner: "talonhub",
                repo: "community",
                pull_number: 2317,
                per_page: 100,
            },
        ]);
    });

    for (const matchingReviews of [false, true]) {
        test(`${matchingReviews ? "rejects ambiguous" : "skips missing"} review commit matches`, async () => {
            const reviews = matchingReviews ? [{ commit_id: "old-head" }] : [];
            const mock = createOctokitMock(
                [],
                [
                    {
                        number: 41,
                        head: {
                            ref: "feature",
                            sha: "new-head",
                            repo: { id: 2 },
                        },
                    },
                    {
                        number: 42,
                        head: {
                            ref: "feature",
                            sha: "new-head",
                            repo: { id: 3 },
                        },
                    },
                ],
                { 41: reviews, 42: reviews },
            );

            const resolution = resolvePullNumber(
                mock.octokit,
                "owner",
                "repo",
                "workflow_run",
                {
                    workflow_run: {
                        conclusion: "success",
                        event: "pull_request_review",
                        head_sha: "old-head",
                        head_branch: "feature",
                        head_repository: { id: 1 },
                    },
                },
            );
            if (matchingReviews) {
                await assert.rejects(resolution, {
                    message:
                        "Expected one pull request for workflow run, found 2",
                });
            } else {
                assert.equal(await resolution, undefined);
            }
        });
    }

    test("rejects multiple open PRs matching the workflow head SHA", async () => {
        const mock = createOctokitMock(
            [],
            [
                {
                    number: 41,
                    head: { ref: "first", sha: "shared-head", repo: { id: 2 } },
                },
                {
                    number: 42,
                    head: {
                        ref: "second",
                        sha: "shared-head",
                        repo: { id: 3 },
                    },
                },
            ],
        );

        await assert.rejects(
            resolvePullNumber(mock.octokit, "owner", "repo", "workflow_run", {
                workflow_run: {
                    conclusion: "success",
                    event: "pull_request_review",
                    head_sha: "shared-head",
                },
            }),
            /Expected one pull request for workflow run, found 2/u,
        );
    });

    test("rejects ambiguous source branches", async () => {
        const mock = createOctokitMock(
            [],
            [
                { number: 41, head: { ref: "feature", repo: { id: 1 } } },
                { number: 42, head: { ref: "feature", repo: { id: 1 } } },
            ],
        );

        await assert.rejects(
            resolvePullNumber(mock.octokit, "owner", "repo", "workflow_run", {
                workflow_run: {
                    conclusion: "success",
                    event: "pull_request",
                    head_branch: "feature",
                    head_repository: { id: 1 },
                },
            }),
            /Expected one pull request for workflow run, found 2/u,
        );
    });

    test("skips a branch belonging only to a different fork", async () => {
        const mock = createOctokitMock(
            [],
            [{ number: 41, head: { ref: "feature", repo: { id: 2 } } }],
        );

        assert.equal(
            await resolvePullNumber(
                mock.octokit,
                "owner",
                "repo",
                "workflow_run",
                {
                    workflow_run: {
                        conclusion: "success",
                        event: "pull_request",
                        head_branch: "feature",
                        head_repository: { id: 1 },
                    },
                },
            ),
            undefined,
        );
    });

    test("skips a workflow run without an associated pull request", async () => {
        const mock = createOctokitMock();

        assert.equal(
            await resolvePullNumber(
                mock.octokit,
                "owner",
                "repo",
                "workflow_run",
                {
                    workflow_run: {
                        conclusion: "success",
                        event: "pull_request",
                        head_sha: "unassociated-head",
                    },
                },
            ),
            undefined,
        );
    });

    test("rejects a workflow run associated with multiple pull requests", async () => {
        const mock = createOctokitMock();

        await assert.rejects(
            resolvePullNumber(mock.octokit, "owner", "repo", "workflow_run", {
                workflow_run: {
                    conclusion: "success",
                    event: "pull_request",
                    pull_requests: [{ number: 41 }, { number: 42 }],
                },
            }),
            /Expected one pull request for workflow run, found 2/u,
        );
    });
});
