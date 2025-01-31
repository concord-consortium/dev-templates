- check the status of the release with release-status:
  `npm run release-status clue-[new_version] collaborative-learning v[old_version] master`
- make and checkout release branch
- run `npm version x.y.z` in release branch
- push branch and tag
- generate release notes:
  `npm run release-notes clue-[new_version]`
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
- have tag building get the version from the tag instead of package.json, then we don't need to update the package.json
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

This could be further streamlined if the `prep-release` was able to start a GitHub workflow which required approval. And then it requires a date/time param. This would eleminate the "wait" step, and QA just has to approve the release, at which point it would automatically go out.


