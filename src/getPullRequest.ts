import { setTimeout } from "node:timers/promises";
import type { Octokit } from "./types.js";

export async function getPullRequest(
    octokit: Octokit,
    owner: string,
    repo: string,
    pullNumber: number,
    wait: () => Promise<unknown> = () => setTimeout(1000),
): Promise<Awaited<ReturnType<Octokit["rest"]["pulls"]["get"]>>["data"]> {
    const parameters = { owner, repo, pull_number: pullNumber };
    let { data: pullRequest } = await octokit.rest.pulls.get(parameters);

    // GitHub calculates mergeability asynchronously after a PR is requested.
    for (let attempt = 0; attempt < 3; attempt++) {
        if (pullRequest.state === "closed" || pullRequest.mergeable != null) {
            break;
        }
        await wait();
        ({ data: pullRequest } = await octokit.rest.pulls.get(parameters));
    }

    return pullRequest;
}
