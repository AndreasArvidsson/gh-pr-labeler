import type { GitHub } from "@actions/github/lib/utils";

export type Octokit = InstanceType<typeof GitHub>;

export interface PullRequestPayload {
    readonly number: number;
    readonly additions: number;
    readonly deletions: number;
}

export interface WorkflowRunPayload {
    readonly conclusion?: string | null;
    readonly event?: string;
    readonly head_sha?: string;
    // GitHub commonly omits workflow_run.pull_requests when the original PR comes from a fork.
    readonly pull_requests?: readonly {
        readonly number: number;
    }[];
}

export interface ActionPayload {
    readonly action?: string;
    readonly pull_request?: PullRequestPayload;
    readonly workflow_run?: WorkflowRunPayload;
    readonly review?: {
        readonly state?: string;
    };
}

export interface PullRequestReview {
    readonly state: string;
    readonly commit_id: string | null;
    readonly submitted_at?: string | null;
}

export interface LabelDefinition {
    readonly name: string;
    readonly color: string;
    readonly description: string;
}

export interface LinesLabel {
    readonly name: `lines/${string}`;
    readonly maxValue: number;
    readonly color: string;
    readonly description: string;
}

export interface LabelTransition {
    add: readonly string[];
    remove: readonly string[];
}
