import assert from "node:assert/strict";
import { getLinesLabel } from "../src/linesLabels.js";

suite("getLinesLabel", () => {
    const cases: readonly (readonly [number, string])[] = [
        [0, "lines/<10"],
        [9, "lines/<10"],
        [10, "lines/10-49"],
        [49, "lines/10-49"],
        [50, "lines/50-199"],
        [199, "lines/50-199"],
        [200, "lines/200-499"],
        [499, "lines/200-499"],
        [500, "lines/500-999"],
        [999, "lines/500-999"],
        [1000, "lines/1000+"],
    ];

    for (const [changedLines, expected] of cases) {
        test(`maps ${changedLines} to ${expected}`, () => {
            assert.equal(getLinesLabel(changedLines), expected);
        });
    }

    test("rejects invalid line counts", () => {
        assert.throws(() => getLinesLabel(-1), RangeError);
        assert.throws(() => getLinesLabel(Number.NaN), RangeError);
    });
});
