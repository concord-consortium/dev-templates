# Scripts to populate templates

## General Install

    npm install

## Release Notes

This uses Pivotal Tracker to print out markdown like what is suggested in the `new-release.md` file.
- searches the Orange, Teal, and CODAP PT boards for stories with a specific label
- ignores chores and releases
- strips the `**[label]**` off of the front of the stories

To run this script you need your PT token: https://www.pivotaltracker.com/help/articles/api_token/

Add it to a `.env` file in the scripts folder with

    PT_TOKEN=<token>

For GitHub markdown formatting, run it with:

    npm run release-notes <pt label>

For Slack markdown formatting, run it with:

    npm run release-notes <pt label> slack

### Jira Version

To run the Jira version of this script, you need a [Jira personal access token](https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html). Add the token to a `.env` file in the scripts folder with

    JIRA_TOKEN=<token>
    JIRA_USER=<your jira account email address>

For GitHub markdown formatting, run it with:

    npm run release-notes-jira <jira project key> <jira label>

For Slack markdown formatting, run it with:

    npm run release-notes-jira <jira project key> <jira label> slack

## Release Status

This uses Pivotal Tracker and GitHub to find the stories and PRs related to the release. To run it you'll need a token from Pivotal and a token from GitHub. You can make a GitHub fine grain access token so it can't be abused or a just use a regular GitHub token. If you use a fine grain token, it has to have permission to read the repository content and the pull requests.  

The two tokens have to be added `.env` file in the scripts folder:

    PT_TOKEN=<token>
    GITHUB_TOKEN=<token>

Run the script with

    npm run release-status <pt label> <github repo> <base ref> <head ref>

The base and head refs are the same that would be used here in a github compare link. Like: 
https://github.com/concord-consortium/collaborative-learning/compare/<base>...<head>

To use this to check a release you'll want to use the previous release tag as the base.

### Unsupported Workflow
When a PR's changes are merged into the main/master branch and it also merged into a version branch. In this case, the story needs to be labeled with both releases so that it doesn't show up in the release status "missing PR" list. However this means the story will then show up in the release notes for both releases. Since the release notes are supposed to just list new things, this isn't accurate. 

## Test GitHub

This is a script to download and print out information we can get from GitHub to help with releases. The script looks at the commits between two git tags or branches, and then looks for PRs with merge commits in that list of commits.
