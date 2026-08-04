export const jiraBaseUrl = "https://concord-consortium.atlassian.net";
export const jiraApiBaseUrl = `${jiraBaseUrl}/rest/api/3`;
export const jiraDevApiBaseUrl = `${jiraBaseUrl}/rest/dev-status/1.0`;

export function extractBlurbText(contentArray) {
  for (const paragraph of contentArray) {
    if (!paragraph.content) continue;

    // Reconstruct the paragraph's full text before matching. Jira splits a
    // paragraph into a separate text node wherever the formatting changes, so
    // a "Blurb:" label whose word is bold and colon is not (or vice versa)
    // arrives as e.g. ["Blurb", ": the text"] — matching only content[0]
    // would miss it. Joining first makes the match independent of styling.
    const fullText = paragraph.content.map(item => item.text ?? "").join("");
    const match = fullText.match(/^\s*Blurb:\s*(.*)$/s);
    if (match) {
      return match[1].trim();
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
