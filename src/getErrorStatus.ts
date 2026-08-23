export function getErrorStatus(error: unknown): number | undefined {
    if (typeof error !== "object" || error == null || !("status" in error)) {
        return undefined;
    }

    return typeof error.status === "number" ? error.status : undefined;
}
