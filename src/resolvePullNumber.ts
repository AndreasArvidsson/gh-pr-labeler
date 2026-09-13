import type { ActionPayload, Octokit, WorkflowRunPayload } from "./types";

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

    // Commit associations can also be missing. Review runs can report the base
    // repository as head_repository for fork PRs, so also match the head SHA.
    // Repository and branch matching still works when the branch has advanced.
    if (pullRequestNumbers.size === 0) {
        const openPullNumbers = await resolveOpenPullNumbers(
            octokit,
            owner,
            repo,
            workflowRun,
        );
        for (const pullNumber of openPullNumbers) {
            pullRequestNumbers.add(pullNumber);
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

async function resolveOpenPullNumbers(
    octokit: Octokit,
    owner: string,
    repo: string,
    workflowRun: WorkflowRunPayload,
): Promise<number[]> {
    const openPullRequests = await octokit.paginate(octokit.rest.pulls.list, {
        owner,
        repo,
        state: "open",
        per_page: 100,
    });
    const matches = openPullRequests.filter(
        (pullRequest) =>
            (workflowRun.head_sha != null &&
                pullRequest.head.sha === workflowRun.head_sha) ||
            (workflowRun.head_repository != null &&
                // A deleted fork can have a null repository despite the API type.
                // oxlint-disable-next-line typescript/no-unnecessary-condition
                pullRequest.head.repo?.id === workflowRun.head_repository.id &&
                pullRequest.head.ref === workflowRun.head_branch),
    );
    if (
        matches.length > 0 ||
        workflowRun.event !== "pull_request_review" ||
        workflowRun.head_sha == null ||
        workflowRun.head_branch == null
    ) {
        return matches.map((pullRequest) => pullRequest.number);
    }

    // A review can refer to an old commit after a push or force-push. GitHub
    // may omit its commit association and report the base repository for the
    // run. Require a review of that commit, not just a matching branch name.
    const pullNumbers: number[] = [];
    for (const pullRequest of openPullRequests) {
        if (pullRequest.head.ref !== workflowRun.head_branch) {
            continue;
        }
        const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
            owner,
            repo,
            pull_number: pullRequest.number,
            per_page: 100,
        });
        if (
            reviews.some((review) => review.commit_id === workflowRun.head_sha)
        ) {
            pullNumbers.push(pullRequest.number);
        }
    }
    return pullNumbers;
}
