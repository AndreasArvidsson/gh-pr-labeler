import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

suite("closed pull requests", () => {
    test("skips all label and review operations after resolving a closed PR", () => {
        const compiled = transformSync(readFileSync("src/index.ts", "utf8"), {
            loader: "ts",
            format: "cjs",
        });
        const output = execFileSync(
            process.execPath,
            [
                "--require",
                "tsx/cjs",
                "-e",
                `
            const assert = require("node:assert/strict");
            const core = { info: console.log };
            core.getInput = () => "test-token";
            core.setFailed = (message) => { throw new Error(message); };
            const github = {
                context: {
                    repo: { owner: "owner", repo: "repo" },
                    eventName: "workflow_run",
                    payload: { workflow_run: {
                        conclusion: "success", event: "pull_request_review",
                        pull_requests: [{ number: 2293 }],
                    } },
                },
                getOctokit: () => ({ rest: { pulls: {
                    get: async (parameters) => {
                        assert.equal(parameters.pull_number, 2293);
                        return { data: { state: "closed" } };
                    },
                } } }),
            };
            const Module = require("node:module");
            const originalLoad = Module._load;
            Module._load = function (name, ...args) {
                if (name === "@actions/core") return core;
                if (name === "@actions/github") return github;
                if (name.startsWith("./") && args[0].filename.endsWith("[eval]")) {
                    name = name.replace(/\\.js$/, ".ts");
                }
                return originalLoad.call(this, name, ...args);
            };
            (function () { ${compiled.code} })();
        `,
            ],
            { encoding: "utf8", cwd: "src" },
        );
        assert.match(output, /Skipping closed pull request #2293/u);
    });
});
