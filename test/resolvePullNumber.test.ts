import assert from "node:assert/strict";
import { resolvePullNumber } from "../src/resolvePullNumber.js";
import type { Octokit } from "../src/types.js";

interface OctokitMock {
    readonly octokit: Octokit;
    readonly requestedCommitShas: readonly string[];
}

function listPullRequestsAssociatedWithCommit(): never {
    throw new Error("The endpoint should be passed to paginate");
}

function createOctokitMock(
    associatedPullRequests: readonly { readonly number: number }[] = [],
): OctokitMock {
    const requestedCommitShas: string[] = [];
    const octokit = {
        paginate: (
            _endpoint: unknown,
            parameters: { readonly commit_sha: string },
        ): Promise<readonly { readonly number: number }[]> => {
            requestedCommitShas.push(parameters.commit_sha);
            return Promise.resolve(associatedPullRequests);
        },
        rest: {
            repos: { listPullRequestsAssociatedWithCommit },
        },
    };

    return {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        octokit: octokit as unknown as Octokit,
        requestedCommitShas,
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
