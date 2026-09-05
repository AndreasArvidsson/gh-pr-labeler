import type { ActionPayload, Octokit } from "./types";

export async function resolvePullNumber(
    octokit: Octokit,
    owner: string,
    repo: string,
    eventName: string,
    payload: ActionPayload,
): Promise<number | undefined> {
    if (payload.pull_request != null) {
        return payload.pull_request.number;
    }

    const workflowRun = payload.workflow_run;

    if (
        eventName !== "workflow_run" ||
        workflowRun?.conclusion !== "success" ||
        (workflowRun.event !== "pull_request" &&
            workflowRun.event !== "pull_request_review")
    ) {
        return undefined;
    }

    // For PR-triggered source workflows, GitHub normally includes the
    // associated pull request directly in the workflow_run payload.
    const pullRequestNumbers = new Set(
        (workflowRun.pull_requests ?? []).map(
            (pullRequest) => pullRequest.number,
        ),
    );

    // pull_requests is commonly empty for workflow runs originating from fork
    // PRs. In that case, use the source run's head commit to find the PR.
    if (pullRequestNumbers.size === 0 && workflowRun.head_sha != null) {
        const associatedPullRequests = await octokit.paginate(
            octokit.rest.repos.listPullRequestsAssociatedWithCommit,
            {
                owner,
                repo,
                commit_sha: workflowRun.head_sha,
                per_page: 100,
            },
        );
        for (const pullRequest of associatedPullRequests) {
            pullRequestNumbers.add(pullRequest.number);
        }
    }

    // Commit associations can also be missing. Match the source repository
    // and branch against current open PRs, even if the branch has advanced.
    if (
        pullRequestNumbers.size === 0 &&
        workflowRun.head_branch != null &&
        workflowRun.head_repository != null
    ) {
        const openPullRequests = await octokit.paginate(
            octokit.rest.pulls.list,
            { owner, repo, state: "open", per_page: 100 },
        );
        for (const pullRequest of openPullRequests) {
            if (
                // A deleted fork can have a null repository despite the API type.
                // oxlint-disable-next-line typescript/no-unnecessary-condition
                pullRequest.head.repo?.id === workflowRun.head_repository.id &&
                pullRequest.head.ref === workflowRun.head_branch
            ) {
                pullRequestNumbers.add(pullRequest.number);
            }
        }
    }

    if (pullRequestNumbers.size !== 1) {
        throw new Error(
            `Expected one pull request for workflow run, found ${pullRequestNumbers.size}`,
        );
    }

    const [pullNumber] = [...pullRequestNumbers];

    return pullNumber;
}
