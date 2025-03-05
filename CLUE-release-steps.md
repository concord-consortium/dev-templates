- check the status of the release in Jira: 
  - navigate to: https://concord-consortium.atlassian.net/projects/CLUE?selectedItem=com.atlassian.jira.jira-projects-plugin%3Arelease-page
  - click on the version of the release
  - all stories should be done
  - there should be no "warnings" on the right side. I believe that would indicate if an issue has a PR that is not merged.
- check for PRs that have been merged but are not associated with any Jira issues:
  `npm run unlinked-prs CLUE <new version in jira> collaborative-learning <tag of previous version in GitHub> master`
- create and checkout a new release branch usually `vA.B.x` where A and B are numbers
- run `npm version A.B.C` in release branch where C is the patch number. This does 3 things:
  - it updates package.json and package-lock.json with the new version
  - it commits these changes with a message of `A.B.C`
  - it creates a tag of `vA.B.C`
- push the `vA.B.x` branch and `vA.B.C` tag
- generate release notes:
  `npm run release-notes-jira CLUE <new version in jira>`
- add release notes to GitHub
- update learn.portal.staging.concord.org:
  - report: https://learn.portal.staging.concord.org/admin/external_reports/10/edit
  - clients: https://learn.portal.staging.concord.org/admin/clients/6/edit
- make announcement on releases channel with slack formatted notes and include link to GitHub release
- smoke test the released tag
- release staging and smoke test staging
- wait
- do the actual release using GitHub script


Streamline Tasks:
- have the CLUE build system get the version from the tag instead of package.json, then we don't need to update the package.json
- make a `prep-release` script which:
  - takes: <app-name> <previous-version> <version>
  - prints the release status using a lookup from app-name to repository
  - asks for confirmation
  - tags the version
  - runs the staging release script
- make a `do-release` script which:
  - takes: <app-name> <previous-version> <version> <time>
  - prints the release status using a lookup from app-name to repository
  - creates the GitHub release: 
    - tag: `v<version>`
    - title: Version <version> - Released <today's date>
    - body: result from release-notes script using label `<app-name>-<version>`
  - posts the announcement to #releases: computes github release url from `v<version>`, the time based on the input argument.
  - posts the announcement to the app specific channel: 
    - the channel is based on a lookup from the app-name
    - computes github release url from `v<version>`
    - the time based on the input argument.
  - schedules a github action to do the release at the specific time


So with these changes the process would be:
- run `prep-release` script
- wait for review by QA
- run `do-release` script

With our new use of Jira these scripts could be integrated into a Jira release by creating a "release" issue in each Jira version. Jira issue types can have manual triggers added to them. I think these show up as links or buttons on the issue. This "release" issue can also have a custom field for the "previous version". 

There could be a trigger which would run the unlinked-prs script and add new issues for each PR that was merged without a Jira issue. After running this script the Jira release status page would show these new issues so we can see there is something to be resolved to get complete release notes.

There could be a prep-release trigger matching the prep-release script described above. 

There could be a do-release trigger matching the do-release script described above. 

I think with this setup then a QA engineer or product manager can do the release without needing to run any local scripts.
