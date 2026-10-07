#!/bin/sh
# Creates the bucket if it does not exist yet. Safe to run on every start.
set -eu
: "${S3_BUCKET:?S3_BUCKET is required}"
if echo "s3.bucket.list" | weed shell -master=storage:9333 2>/dev/null | grep -qw "$S3_BUCKET"; then
  echo "bucket $S3_BUCKET already exists"
else
  echo "s3.bucket.create -name $S3_BUCKET" | weed shell -master=storage:9333
  echo "bucket $S3_BUCKET created"
fi
