"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
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
    var e_1, _a;
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const token = core.getInput("repo-token", { required: true });
            const maxLabels = +core.getInput("max-labels", { required: true });
            const configPath = core.getInput("configuration-path", { required: true });
            const client = new github.GitHub(token);
            const options = client.pulls.list.endpoint.merge({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo
            });
            const labelGlobs = yield getLabelGlobs(client, configPath);
            try {
                for (var _b = __asyncValues(client.paginate.iterator(options)), _c; _c = yield _b.next(), !_c.done;) {
                    const response = _c.value;
                    for (const singleResponse of response.data) {
                        const prNumber = singleResponse.number;
                        const currentMatchingLabels = singleResponse.labels
                            .map(resp => resp.name)
                            .filter(label => labelGlobs.has(label));
                        // If there are more than maxLabels do not add any more labels
                        if (currentMatchingLabels.length >= maxLabels) {
                            continue;
                        }
                        core.debug(`pr #${prNumber}, fetching changed files`);
                        const changedFiles = yield getChangedFiles(client, prNumber);
                        const labelsToAdd = [];
                        for (const [label, globs] of labelGlobs.entries()) {
                            core.debug(`processing ${label}`);
                            if (!changedFilesMatchesGlob(changedFiles, globs)) {
                                continue;
                            }
                            if (currentMatchingLabels.indexOf(label) !== -1) {
                                continue;
                            }
                            // label matched and not in current matching labels
                            labelsToAdd.push(label);
                        }
                        // The maximum number of labels must not exceed maxLabels in total
                        const allowedLabelCnt = maxLabels - currentMatchingLabels.length;
                        if (labelsToAdd.length > 0 && labelsToAdd.length <= allowedLabelCnt) {
                            core.info(`#${prNumber}, adding labels: ${labelsToAdd}`);
                            yield addLabels(client, prNumber, labelsToAdd);
                        }
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (_c && !_c.done && (_a = _b.return)) yield _a.call(_b);
                }
                finally { if (e_1) throw e_1.error; }
            }
        }
        catch (error) {
            core.error(error.message);
            core.setFailed(error.message);
        }
    });
}
function getChangedFiles(client, prNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        const listFilesResponse = yield client.pulls.listFiles({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: prNumber
        });
        const changedFiles = listFilesResponse.data.map(f => f.filename);
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
run();
