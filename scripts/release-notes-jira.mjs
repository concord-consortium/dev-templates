/**
 * Generates release notes from completed Jira stories and bugs.
 *
 * Required command-line parameters:
 * - Jira project key (e.g., "LARA")
 * - Jira fix version for filtering issues (e.g., "LARA v5.0.0")
 *
 * Optional command-line parameters:
 * - "slack" to format output for Slack
 *
 * Example usage:
 * node release-notes-jira.mjs LARA "LARA v5.0.0" slack
 */

import "dotenv/config"
import fetch from "node-fetch";
import querystring from "querystring";
import { extractBlurbText, jiraBaseUrl, jiraApiBaseUrl, jiraRequestHeaders } from "./utils.mjs";

const jiraUser = process.env.JIRA_USER;
const jiraToken = process.env.JIRA_TOKEN;

if (!jiraUser || !jiraToken) {
  console.error("Both the JIRA_USER and JIRA_TOKEN environment variables are required.");
  process.exit(1);
}

const jiraProjectKey = process.argv[2];
const jiraFixVersion = process.argv[3];
const slack = process.argv?.[4];

if (!jiraProjectKey || !jiraFixVersion) {
  console.error("Both a Jira project key and a Jira fix version value are required.\n\nUsage:\n\n`npm run release-notes-jira LARA \"LARA v5.0.0\"` or\n`node release-notes-jira.mjs LARA \"LARA v5.0.0\"`\n");
  process.exit(1);
}

const features = [];
const bugs = [];
const underTheHood = [];

function isUnderTheHood(story) {
  return story.fields.labels.find(label => label === "under-the-hood");
}

async function collectStories(projectKey, jiraFixVersion) {
  const fields = ["id", "summary", "issuetype", "description", "labels"].join(",");
  const jql = `project=${projectKey} AND fixVersion in ("${jiraFixVersion}") AND issuetype in (Story, Bug) AND status in (Done, Closed)`;
  const urlQuery = querystring.stringify({
    jql,
    fields,
    maxResults: 100
  });
  const url = `${jiraApiBaseUrl}/search?${urlQuery}`;
  const requestHeaders = jiraRequestHeaders(jiraUser, jiraToken);
  const response = await fetch(url, requestHeaders);
  const json = await response.json();
  const stories = json.issues;

  if (!stories || stories.length === 0) {
    console.error(`No stories found for project ${projectKey} with fix version ${jiraFixVersion}`);
    process.exit(1);
  }

  for (const story of stories) {
    if (isUnderTheHood(story)) {
      underTheHood.push(story);
    } else {
      if (story.fields.issuetype.name === "Story") {
        features.push(story);
      }
      if (story.fields.issuetype.name === "Bug") {
        bugs.push(story);
      }
    }
  }
}

await collectStories(jiraProjectKey, jiraFixVersion);

function storyText(story) {
  const blurbText = extractBlurbText(story.fields.description?.content ?? []);
  if (blurbText) {
    return blurbText;
  }
  return story.fields.summary.trim();
}

function storyItem(story) {
  const text = storyText(story);
  return slack
    ? `*[${story.key}](${jiraBaseUrl}/browse/${story.key}):* ${text}`
    : `**${story.key}:** ${text}`;
}

const prefix = slack ? '> ' : '';
function print(msg) {
  console.log(`${prefix}${msg}`);
}
function printHeader(msg) {
  if (slack) {
    print(`*${msg}*`);
  } else {
    print(`### ${msg}`);
  }
}

function printSection(msg, stories) {
  if (stories.length > 0) {
    printHeader(msg);
    for (const story of stories) {
      print(`- ${storyItem(story)}`);
    }
    print("");
  }
}

printSection("✨ Features & Improvements:", features);
printSection("🐞 Bug Fixes:", bugs);
printSection("🛠 Under the Hood:", underTheHood);
