# Pull Request Labeler

Pull request labeler triages PRs based on the paths that are modified in the PR.

Note that only pull requests being opened from the same repository can be labeled.  This action will not currently work for pull requests from forks -- like is common in open source projects -- because the token for forked pull request workflows does not have write permissions.

## Change in this fork

- Adds `max-labels`. If the number of matched labels is greater than `max-labels` then no labels are added (default=100)

## Usage

### Create `.github/labeler.yml`

Create a `.github/labeler.yml` file with a list of labels and [minimatch](https://github.com/isaacs/minimatch) globs to match to apply the label.

The key is the name of the label in your repository that you want to add (eg: "merge conflict", "needs-updating") and the value is the path (glob) of the changed files (eg: `src/**/*`, `tests/*.spec.js`)

#### Basic Examples

```yml
# Add 'label1' to any changes within 'example' folder or any subfolders
label1:
  - example/**/*

# Add 'label2' to any file changes within 'example2' folder
label2: example2/*
```

#### Common Examples

```yml
# Add 'repo' label to any root file changes
repo:
  - ./*

# Add '@domain/core' label to any change within the 'core' package
@domain/core:
  - package/core/*
  - package/core/**/*

# Add 'test' label to any change to *.spec.js files within the source dir
test:
  - src/**/*.spec.js
```

### Create Workflow

Create a workflow (eg: `.github/workflows/labeler.yml` see [Creating a Workflow file](https://help.github.com/en/articles/configuring-a-workflow#creating-a-workflow-file)) to utilize the labeler action with content:

```
name: "Pull Request Labeler"
on:
- pull_request

jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/labeler@v2
      with:
        repo-token: "${{ secrets.GITHUB_TOKEN }}"
        max-labels: 4
```

_Note: This grants access to the `GITHUB_TOKEN` so the action can make calls to GitHub's rest API_
