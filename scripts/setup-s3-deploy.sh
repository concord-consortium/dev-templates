#!/bin/bash
#
# Sets up S3 deployment for a Concord Consortium repo:
#
# 1. Creates an IAM user matching the repo name
# 2. Adds the user to the S3-deploy group
# 3. Creates an access key
# 4. Sets AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY as GitHub repo secrets
#
# Prerequisites: aws cli (configured), gh cli (authenticated), jq
#
# Usage: ./setup-s3-deploy.sh [--dry-run] <repo-name>

set -euo pipefail

DRY_RUN=false
REPO_NAME=""
ORG="concord-consortium"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    *) REPO_NAME="$1"; shift ;;
  esac
done

if [ -z "$REPO_NAME" ]; then
  echo "Usage: $0 [--dry-run] <repo-name>"
  exit 1
fi

run() {
  if [ "$DRY_RUN" = true ]; then
    echo "  [dry-run] $*"
  else
    "$@"
  fi
}

# Check prerequisites
for cmd in aws gh jq; do
  if ! command -v "$cmd" &> /dev/null; then
    echo "Error: $cmd is required but not installed."
    exit 1
  fi
done

if [ "$DRY_RUN" = true ]; then
  echo "DRY RUN - no changes will be made"
  echo ""
fi

echo "Setting up S3 deployment for $ORG/$REPO_NAME"
echo ""

# 1. Create IAM user
echo "Creating IAM user: $REPO_NAME"
if aws iam get-user --user-name "$REPO_NAME" &> /dev/null; then
  echo "  User already exists, skipping creation."
else
  run aws iam create-user --user-name "$REPO_NAME"
  echo "  User created."
fi

# 2. Add to S3-deploy group
echo "Adding user to S3-deploy group..."
run aws iam add-user-to-group --user-name "$REPO_NAME" --group-name S3-deploy
echo "  Done."

# 3. Create access key
echo "Creating access key..."
if [ "$DRY_RUN" = true ]; then
  echo "  [dry-run] aws iam create-access-key --user-name $REPO_NAME"
  ACCESS_KEY="AKIAIOSFODNN7EXAMPLE"
  SECRET_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
else
  KEYS=$(aws iam create-access-key --user-name "$REPO_NAME" --output json)
  ACCESS_KEY=$(echo "$KEYS" | jq -r '.AccessKey.AccessKeyId')
  SECRET_KEY=$(echo "$KEYS" | jq -r '.AccessKey.SecretAccessKey')
fi
echo "  Access key created: $ACCESS_KEY"

# 4. Set GitHub secrets
echo "Setting GitHub repo secrets for $ORG/$REPO_NAME..."
run gh secret set AWS_ACCESS_KEY_ID --body "$ACCESS_KEY" --repo "$ORG/$REPO_NAME"
run gh secret set AWS_SECRET_ACCESS_KEY --body "$SECRET_KEY" --repo "$ORG/$REPO_NAME"
echo "  Secrets set."

echo ""
echo "S3 deployment setup complete for $ORG/$REPO_NAME"
echo ""
echo "IMPORTANT: Store these credentials for $REPO_NAME in 1Password at https://1password.com/:"
echo ""
echo "AWS_ACCESS_KEY_ID: $ACCESS_KEY"
echo "AWS_SECRET_ACCESS_KEY: $SECRET_KEY"
