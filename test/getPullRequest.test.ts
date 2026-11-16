import assert from "node:assert/strict";
import { getPullRequest } from "../src/getPullRequest.js";
import type { Octokit } from "../src/types.js";

suite("getPullRequest", () => {
    const cases = [
        {
            name: "returns known conflicts immediately",
            states: [false],
            calls: 1,
        },
        {
            name: "returns a mergeable PR immediately",
            states: [true],
            calls: 1,
        },
        {
            name: "retries unknown mergeability",
            states: [null, null, false],
            calls: 3,
        },
        {
            name: "bounds retries when mergeability stays unknown",
            states: [null],
            calls: 4,
        },
    ] as const;

    for (const { name, states, calls } of cases) {
        test(name, async () => {
            let requests = 0;
            let waits = 0;
            const octokit = {
                rest: {
                    pulls: {
                        get: (
                            parameters: unknown,
                        ): Promise<{
                            data: { state: string; mergeable: boolean | null };
                        }> => {
                            assert.deepEqual(parameters, {
                                owner: "owner",
                                repo: "repo",
                                pull_number: 42,
                            });
                            const mergeable =
                                states[Math.min(requests, states.length - 1)];
                            requests++;
                            return Promise.resolve({
                                data: { state: "open", mergeable },
                            });
                        },
                    },
                },
            };
            const result = await getPullRequest(
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion
                octokit as unknown as Octokit,
                "owner",
                "repo",
                42,
                () => {
                    waits++;
                    return Promise.resolve();
                },
            );
            assert.equal(requests, calls);
            assert.equal(waits, calls - 1);
            assert.equal(result.mergeable, states[states.length - 1]);
        });
    }

    test("does not retry closed PRs with unknown mergeability", async () => {
        const octokit = {
            rest: {
                pulls: {
                    get: (): Promise<{
                        data: { state: string; mergeable: boolean | null };
                    }> =>
                        Promise.resolve({
                            data: { state: "closed", mergeable: null },
                        }),
                },
            },
        };
        const result = await getPullRequest(
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            octokit as unknown as Octokit,
            "owner",
            "repo",
            42,
            () => {
                assert.fail("Closed PRs should not wait");
            },
        );
        assert.equal(result.state, "closed");
    });
});
