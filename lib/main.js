"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const yaml = __importStar(require("js-yaml"));
const minimatch_1 = require("minimatch");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const token = core.getInput("repo-token", { required: true });
            const maxLabels = +core.getInput("max-labels", { required: true });
            const configPath = core.getInput("configuration-path", { required: true });
            const prNumber = getPrNumber();
            if (!prNumber) {
                console.log("Could not get pull request number from context, exiting");
                return;
            }
            const client = new github.GitHub(token);
            const labelGlobs = yield getLabelGlobs(client, configPath);
            const labelsFromPR = yield getLabelsFromPR(client, prNumber);
            const currentMatchingLabels = labelsFromPR.filter(label => labelGlobs.has(label));
            // If the PR has already been labeled, then skip labeling the PR
            // This is to reduce the number of API calls
            if (currentMatchingLabels.length > 0) {
                return;
            }
            core.debug(`pr #${prNumber}, fetching changed files`);
            const changedFiles = yield getChangedFiles(client, prNumber);
            const labelsToAdd = [];
            for (const [label, globs] of labelGlobs.entries()) {
                core.debug(`processing ${label}`);
                if (!changedFilesMatchesGlob(changedFiles, globs)) {
                    continue;
                }
                // label matched and not in current matching labels
                labelsToAdd.push(label);
            }
            // The maximum number of labels must not exceed maxLabels in total
            if (labelsToAdd.length > 0 && labelsToAdd.length <= maxLabels) {
                core.info(`#${prNumber}, adding labels: ${labelsToAdd}`);
                yield addLabels(client, prNumber, labelsToAdd);
            }
        }
        catch (error) {
            core.error(error.message);
            core.setFailed(error.message);
        }
    });
}
function getLabelsFromPR(client, prNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        const { data: pullRequest } = yield client.pulls.get({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: prNumber
        });
        return pullRequest.labels.map(item => item.name);
    });
}
function getChangedFiles(client, prNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        const listFilesOptions = client.pulls.listFiles.endpoint.merge({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: prNumber
        });
        const listFilesResponse = yield client.paginate(listFilesOptions);
        const changedFiles = listFilesResponse.map(f => f.filename);
        core.debug("found changed files:");
        for (const file of changedFiles) {
            core.debug("  " + file);
        }
        return changedFiles;
    });
}
function getLabelGlobs(client, configurationPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const configurationContent = yield fetchContent(client, configurationPath);
        // loads (hopefully) a `{[label:string]: string | string[]}`, but is `any`:
        const configObject = yaml.safeLoad(configurationContent);
        // transform `any` => `Map<string,string[]>` or throw if yaml is malformed:
        return getLabelGlobMapFromObject(configObject);
    });
}
function fetchContent(client, repoPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield client.repos.getContents({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            path: repoPath,
            ref: github.context.sha
        });
        return Buffer.from(response.data.content, "base64").toString();
    });
}
function getLabelGlobMapFromObject(configObject) {
    const labelGlobs = new Map();
    for (const label in configObject) {
        if (typeof configObject[label] === "string") {
            labelGlobs.set(label, [configObject[label]]);
        }
        else if (configObject[label] instanceof Array) {
            labelGlobs.set(label, configObject[label]);
        }
        else {
            throw Error(`found unexpected type for label ${label} (should be string or array of globs)`);
        }
    }
    return labelGlobs;
}
function changedFilesMatchesGlob(changedFiles, globs) {
    for (const glob of globs) {
        core.debug(` checking pattern ${glob}`);
        const matcher = new minimatch_1.Minimatch(glob);
        for (const changedFile of changedFiles) {
            core.debug(` - ${changedFile}`);
            if (matcher.match(changedFile)) {
                core.debug(` ${changedFile} matches`);
                return true;
            }
        }
    }
    return false;
}
function addLabels(client, prNumber, labels) {
    return __awaiter(this, void 0, void 0, function* () {
        yield client.issues.addLabels({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            issue_number: prNumber,
            labels: labels
        });
    });
}
function getPrNumber() {
    const pullRequest = github.context.payload.pull_request;
    if (!pullRequest) {
        return undefined;
    }
    return pullRequest.number;
}
run();
