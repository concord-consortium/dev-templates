import "dotenv/config";
import fetch from "node-fetch";
import { extractBlurbText, jiraApiBaseUrl, jiraRequestHeaders } from "./utils.mjs";

const jiraUser = process.env.JIRA_USER;
const jiraToken = process.env.JIRA_TOKEN;

if (!jiraUser || !jiraToken) {
  console.error("Both the JIRA_USER and JIRA_TOKEN environment variables are required.");
  process.exit(1);
}

const url = `${jiraApiBaseUrl}/issue/WEB-2`
const requestHeaders = jiraRequestHeaders(jiraUser, jiraToken);
const response = await fetch(url, requestHeaders);

const json = await response.json();
console.log(json);

const blurbMatch = extractBlurbText(json.fields.description.content);
const description = blurbMatch ?? json.fields.summary.trim();
console.log(description);
