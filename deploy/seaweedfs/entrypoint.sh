#!/bin/sh
# Renders the S3 identity file from environment variables, then starts SeaweedFS
# (master + volume + filer + S3 gateway) in a single process.
set -eu

: "${S3_ACCESS_KEY_ID:?S3_ACCESS_KEY_ID is required}"
: "${S3_SECRET_ACCESS_KEY:?S3_SECRET_ACCESS_KEY is required}"

cat > /tmp/s3.json <<JSON
{
  "identities": [
    {
      "name": "openlabel",
      "credentials": [{ "accessKey": "${S3_ACCESS_KEY_ID}", "secretKey": "${S3_SECRET_ACCESS_KEY}" }],
      "actions": ["Admin", "Read", "List", "Tagging", "Write"]
    }
  ]
}
JSON

exec weed server -dir=/data -s3 -s3.port=8333 -s3.config=/tmp/s3.json -volume.max=0 -master.volumeSizeLimitMB=1024
