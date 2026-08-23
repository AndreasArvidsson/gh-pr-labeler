import assert from "node:assert/strict";
import { getSizeLabel } from "../src/size-labels.js";

suite("getSizeLabel", () => {
    const cases: readonly (readonly [number, string])[] = [
        [0, "size/<50"],
        [49, "size/<50"],
        [50, "size/50-199"],
        [199, "size/50-199"],
        [200, "size/200-499"],
        [499, "size/200-499"],
        [500, "size/500-999"],
        [999, "size/500-999"],
        [1000, "size/1000+"],
    ];

    for (const [changedLines, expected] of cases) {
        test(`maps ${changedLines} to ${expected}`, () => {
            assert.equal(getSizeLabel(changedLines), expected);
        });
    }

    test("rejects invalid line counts", () => {
        assert.throws(() => getSizeLabel(-1), RangeError);
        assert.throws(() => getSizeLabel(Number.NaN), RangeError);
    });
});
