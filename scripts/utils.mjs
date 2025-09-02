export const jiraBaseUrl = "https://concord-consortium.atlassian.net";
export const jiraApiBaseUrl = `${jiraBaseUrl}/rest/api/3`;
export const jiraDevApiBaseUrl = `${jiraBaseUrl}/rest/dev-status/1.0`;

export function extractBlurbText(contentArray) {
  for (const paragraph of contentArray) {
    if (!paragraph.content) continue;

    if (paragraph.content[0]?.text?.trim() === "Blurb:") {
      return paragraph.content.slice(1).map(item => item.text).join("").trim();
    }
  }
  return null;
}

export function jiraRequestHeaders (jiraUser, jiraToken) {
  const authHeader = `Basic ${Buffer.from(`${jiraUser}:${jiraToken}`).toString("base64")}`;
  return {
    headers: {
    "Authorization": authHeader,
    "Accept": "application/json"
    }
  };
}
