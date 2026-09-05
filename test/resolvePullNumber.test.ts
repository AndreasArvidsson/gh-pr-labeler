import assert from "node:assert/strict";
import { resolvePullNumber } from "../src/resolvePullNumber.js";
import type { Octokit } from "../src/types.js";

interface OctokitMock {
    readonly octokit: Octokit;
    readonly requestedCommitShas: readonly string[];
    readonly requestedPullLists: readonly unknown[];
}

interface OpenPullRequest {
    readonly number: number;
    readonly head: {
        readonly ref: string;
        readonly repo: { readonly id: number } | null;
    };
}

function listPullRequests(): never {
    throw new Error("The endpoint should be passed to paginate");
}

function listPullRequestsAssociatedWithCommit(): never {
    throw new Error("The endpoint should be passed to paginate");
}

function createOctokitMock(
    associatedPullRequests: readonly { readonly number: number }[] = [],
    openPullRequests: readonly OpenPullRequest[] = [],
): OctokitMock {
    const requestedCommitShas: string[] = [];
    const requestedPullLists: unknown[] = [];
    const octokit = {
        paginate: (
            endpoint: unknown,
            parameters: { readonly commit_sha: string },
        ): Promise<readonly { readonly number: number }[]> => {
            if (endpoint === listPullRequests) {
                requestedPullLists.push(parameters);
                return Promise.resolve(openPullRequests);
            }
            assert.equal(endpoint, listPullRequestsAssociatedWithCommit);
            requestedCommitShas.push(parameters.commit_sha);
            return Promise.resolve(associatedPullRequests);
        },
        rest: {
            repos: { listPullRequestsAssociatedWithCommit },
            pulls: { list: listPullRequests },
        },
    };

    return {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        octokit: octokit as unknown as Octokit,
        requestedCommitShas,
        requestedPullLists,
    };
}

suite("resolvePullNumber", () => {
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

    test("rejects a branch belonging only to a different fork", async () => {
        const mock = createOctokitMock(
            [],
            [{ number: 41, head: { ref: "feature", repo: { id: 2 } } }],
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
            /Expected one pull request for workflow run, found 0/u,
        );
    });

    test("rejects a workflow run without an associated pull request", async () => {
        const mock = createOctokitMock();

        await assert.rejects(
            resolvePullNumber(mock.octokit, "owner", "repo", "workflow_run", {
                workflow_run: {
                    conclusion: "success",
                    event: "pull_request",
                    head_sha: "unassociated-head",
                },
            }),
            /Expected one pull request for workflow run, found 0/u,
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
