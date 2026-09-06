import assert from "node:assert/strict";
import { getLabelTransition } from "../src/getLabelTransition";
import { getLatestRelevantReview } from "../src/getLatestRelevantReview";
import type { Octokit, PullRequestReview } from "../src/types";

interface Review extends PullRequestReview {
    readonly user: { readonly login: string } | null;
}

function review(state: string, login: string | null = "maintainer"): Review {
    return {
        state,
        commit_id: "head",
        submitted_at: "2026-01-01T00:00:00Z",
        user: login == null ? null : { login },
    };
}

function createMock(
    reviews: readonly Review[],
    permissions: Readonly<Record<string, string | Error | undefined>>,
): { readonly octokit: Octokit; readonly requestedUsers: readonly string[] } {
    const requestedUsers: string[] = [];
    const octokit = {
        paginate: (
            _endpoint: unknown,
            parameters: unknown,
        ): Promise<readonly Review[]> => {
            assert.deepEqual(parameters, {
                owner: "owner",
                repo: "repo",
                pull_number: 42,
                per_page: 100,
            });
            return Promise.resolve(reviews);
        },
        rest: {
            pulls: {
                listReviews: (): never => {
                    throw new Error("Use paginate");
                },
            },
            repos: {
                getCollaboratorPermissionLevel: (parameters: {
                    owner: string;
                    repo: string;
                    username: string;
                }): Promise<{ data: { permission: string } }> => {
                    assert.equal(parameters.owner, "owner");
                    assert.equal(parameters.repo, "repo");
                    requestedUsers.push(parameters.username);
                    const permission = permissions[parameters.username];
                    if (permission instanceof Error) {
                        return Promise.reject(permission);
                    }
                    assert.ok(
                        permission != null,
                        "Unexpected permission lookup",
                    );
                    return Promise.resolve({ data: { permission } });
                },
            },
        },
    };
    return {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        octokit: octokit as unknown as Octokit,
        requestedUsers,
    };
}

suite("getLatestRelevantReview", () => {
    test("returns the latest qualifying review across maintainers", async () => {
        const latest = review("APPROVED", "second");
        const mock = createMock([review("CHANGES_REQUESTED"), latest], {
            second: "write",
        });
        assert.equal(
            await getLatestRelevantReview(mock.octokit, "owner", "repo", 42),
            latest,
        );
        assert.deepEqual(mock.requestedUsers, ["second"]);
    });

    for (const permission of ["write", "admin"]) {
        test(`accepts ${permission} access`, async () => {
            const expected = review("APPROVED");
            const mock = createMock([expected], { maintainer: permission });
            assert.equal(
                await getLatestRelevantReview(
                    mock.octokit,
                    "owner",
                    "repo",
                    42,
                ),
                expected,
            );
        });
    }

    for (const permission of ["read", "none"]) {
        for (const state of ["APPROVED", "CHANGES_REQUESTED"]) {
            test(`ignores ${state} from a reviewer with ${permission} access`, async () => {
                const expected = review(
                    state === "APPROVED" ? "CHANGES_REQUESTED" : "APPROVED",
                );
                const mock = createMock([expected, review(state, "outsider")], {
                    maintainer: "write",
                    outsider: permission,
                });
                const selected = await getLatestRelevantReview(
                    mock.octokit,
                    "owner",
                    "repo",
                    42,
                );
                assert.equal(selected, expected);
                const transition = getLabelTransition(
                    { number: 42, additions: 1, deletions: 0 },
                    selected,
                    new Set(),
                    false,
                );
                assert.equal(
                    transition.add.includes("review/changes-requested"),
                    state === "APPROVED",
                );
            });
        }
    }

    test("looks up a non-maintainer only once per run", async () => {
        const mock = createMock(
            [
                review("APPROVED", "outsider"),
                review("CHANGES_REQUESTED", "outsider"),
            ],
            { outsider: "read" },
        );
        assert.equal(
            await getLatestRelevantReview(mock.octokit, "owner", "repo", 42),
            undefined,
        );
        assert.deepEqual(mock.requestedUsers, ["outsider"]);
    });

    test("ignores pending, dismissed, comment-only, unsubmitted and deleted-user reviews", async () => {
        const mock = createMock(
            [
                review("PENDING"),
                review("DISMISSED"),
                review("COMMENTED"),
                { ...review("APPROVED"), submitted_at: null },
                review("APPROVED", null),
            ],
            {},
        );
        assert.equal(
            await getLatestRelevantReview(mock.octokit, "owner", "repo", 42),
            undefined,
        );
        assert.deepEqual(mock.requestedUsers, []);
    });

    test("returns undefined when there are no reviews", async () => {
        const mock = createMock([], {});
        assert.equal(
            await getLatestRelevantReview(mock.octokit, "owner", "repo", 42),
            undefined,
        );
        assert.deepEqual(mock.requestedUsers, []);
    });

    test("propagates permission lookup failures instead of treating them as an approval", async () => {
        const error = new Error("Permission lookup failed");
        const mock = createMock(
            [review("APPROVED", "second"), review("CHANGES_REQUESTED")],
            { maintainer: error, second: "write" },
        );
        await assert.rejects(
            getLatestRelevantReview(mock.octokit, "owner", "repo", 42),
            error,
        );
        assert.deepEqual(mock.requestedUsers, ["maintainer"]);
    });
});
