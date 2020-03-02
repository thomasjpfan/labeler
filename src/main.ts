import * as core from "@actions/core";
import * as github from "@actions/github";
import * as yaml from "js-yaml";
import { Minimatch } from "minimatch";

async function run() {
  try {
    const token = core.getInput("repo-token", { required: true });
    const maxLabels: number = +core.getInput("max-labels", { required: true });
    const configPath = core.getInput("configuration-path", { required: true });

    const client = new github.GitHub(token);

    const options = client.pulls.list.endpoint.merge({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo
    });

    const labelGlobs: Map<string, string[]> = await getLabelGlobs(
      client,
      configPath
    );

    for await (const response of client.paginate.iterator(options)) {
      for (const singleResponse of response.data) {
        const prNumber: number = singleResponse.number;
        const currentMatchingLabels: string[] = singleResponse.labels
          .map(resp => resp.name)
          .filter(label => labelGlobs.has(label));

        // If there are more than maxLabels do not add any more labels
        if (currentMatchingLabels.length >= maxLabels) {
          continue;
        }

        core.debug(`pr #${prNumber}, fetching changed files`);
        const changedFiles: string[] = await getChangedFiles(client, prNumber);

        const labelsToAdd: string[] = [];
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
          await addLabels(client, prNumber, labelsToAdd);
        }
      }
    }
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

async function getChangedFiles(
  client: github.GitHub,
  prNumber: number
): Promise<string[]> {
  const listFilesResponse = await client.pulls.listFiles({
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
}

async function getLabelGlobs(
  client: github.GitHub,
  configurationPath: string
): Promise<Map<string, string[]>> {
  const configurationContent: string = await fetchContent(
    client,
    configurationPath
  );

  // loads (hopefully) a `{[label:string]: string | string[]}`, but is `any`:
  const configObject: any = yaml.safeLoad(configurationContent);

  // transform `any` => `Map<string,string[]>` or throw if yaml is malformed:
  return getLabelGlobMapFromObject(configObject);
}

async function fetchContent(
  client: github.GitHub,
  repoPath: string
): Promise<string> {
  const response = await client.repos.getContents({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    path: repoPath,
    ref: github.context.sha
  });

  return Buffer.from(response.data.content, "base64").toString();
}

function getLabelGlobMapFromObject(configObject: any): Map<string, string[]> {
  const labelGlobs: Map<string, string[]> = new Map();
  for (const label in configObject) {
    if (typeof configObject[label] === "string") {
      labelGlobs.set(label, [configObject[label]]);
    } else if (configObject[label] instanceof Array) {
      labelGlobs.set(label, configObject[label]);
    } else {
      throw Error(
        `found unexpected type for label ${label} (should be string or array of globs)`
      );
    }
  }

  return labelGlobs;
}

function changedFilesMatchesGlob(
  changedFiles: string[],
  globs: string[]
): boolean {
  for (const glob of globs) {
    core.debug(` checking pattern ${glob}`);
    const matcher = new Minimatch(glob);
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

async function addLabels(
  client: github.GitHub,
  prNumber: number,
  labels: string[]
) {
  await client.issues.addLabels({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: prNumber,
    labels: labels
  });
}

run();
