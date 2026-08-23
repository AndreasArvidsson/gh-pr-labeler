export interface PullRequestPayload {
    readonly number: number;
    readonly additions: number;
    readonly deletions: number;
}

export interface ActionPayload {
    readonly action?: string;
    readonly pull_request?: PullRequestPayload;
    readonly review?: {
        readonly state?: string;
    };
}

export interface LabelDefinition {
    readonly name: string;
    readonly color: string;
    readonly description: string;
}

export interface SizeLabel {
    readonly name: `size/${string}`;
    readonly maxValue: number;
    readonly color: string;
    readonly description: string;
}

export type ReviewEvent =
    | { kind: "review-submitted"; state: string }
    | { kind: "pull-request-synchronized" };

export interface LabelTransition {
    add: readonly string[];
    remove: readonly string[];
}
