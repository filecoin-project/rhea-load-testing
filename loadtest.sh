#!/bin/bash

## This script runs the load tests for Boost retrievals
##
## To modify its behavior, run this script prefixed with:
##   * USE_DOCKER_K6=1 to use the dockerized k6 instead of the local one
##   * SKIP_FIND_PROVS=1 to skip the provider tests
##   * CONCURRENCIES='X,Y,Z' to override the default concurrency levels for the full fetch tests
##   * TEST_RANGE_SIZES=='X,Y,Z' to override the default range sizes for the range requests tests
##   * SKIP_CSV_OUT=1 to skip the CSV output generation
##   * FIND_PROVS_CSV_OUT_FILE='path/to/file.csv' to override the default CSV output file for find providers test
##   * FETCH_CSV_OUT_FILE='path/to/file.csv' to override the default CSV output file for fetch test
CUSTOM_K6='./k6'
DEFAULT_CONCURRENCIES=(100)
FILE_TIME_STR=$(date -u +'%Y-%m-%dT%H:%M')
FIND_PROVS_CSV_OUT_FILE=${FIND_PROVS_CSV_OUT_FILE:-results/results_find_provs_${FILE_TIME_STR}.csv}
FETCH_CSV_OUT_FILE=${FETCH_CSV_OUT_FILE:-results/results_fetch_${FILE_TIME_STR}.csv}
MISSING_CIDS_FILE=${MISSING_CIDS_FILE:-results/missing_cids_${FILE_TIME_STR}.csv}
LASSIE_DISCREPENCIES_FILE=${LASSIE_DISCREPENCIES_FILE:-results/lassie-discrepencies-${FILE_TIME_STR}.csv}

# Check that we have Node.js installed
node -v 2>/dev/null || {
    echo "'node' not found, CSV output will not be generated"
    SKIP_CSV_OUT=1
}

function run_find_provs() {
  TEST_NAME="find provs"
  mkdir -p out/"${TEST_NAME}"

  if [ -z "$CONCURRENCIES" ]; then
    CONCURRENCIES=(${DEFAULT_CONCURRENCIES[@]})
  else
    # turn provided comma-separated list into an array
    CONCURRENCIES=(`echo $CONCURRENCIES | tr ',' ' '`)
  fi

  echo "Running find provs with concurrencies: ${CONCURRENCIES[@]}"

  for CONCURRENCY in "${CONCURRENCIES[@]}"; do
      source .env
      K6_OUT=influxdb=http://127.0.0.1:8086/k6 \
        KUBO_API_BASE=${KUBO_API_BASE} \
        INDEXER_API_BASE=${INDEXER_API_BASE} \
        TEST_NAME=$TEST_NAME \
        SIMULTANEOUS_DOWNLOADS=$CONCURRENCY \
        OUT_DIR="./out" \
        MISSING_CIDS_FILE=$MISSING_CIDS_FILE \
        FILE_TIME_STR=$FILE_TIME_STR \
        ${CUSTOM_K6} run ./scripts/findprovs.js
  done
}

function run_fetch() {
  TEST_NAME="fetch"
  mkdir -p out/"${TEST_NAME}"

  if [ -z "$CONCURRENCIES" ]; then
    CONCURRENCIES=(${DEFAULT_CONCURRENCIES[@]})
  else
    # turn provided comma-separated list into an array
    CONCURRENCIES=(`echo $CONCURRENCIES | tr ',' ' '`)
  fi

  echo "Running fetch with concurrencies: ${CONCURRENCIES[@]}"

  for CONCURRENCY in "${CONCURRENCIES[@]}"; do
      source .env
      K6_OUT=influxdb=http://127.0.0.1:8086/k6 \
        KUBO_GATEWAY_URL=${KUBO_GATEWAY_URL} \
        LASSIE_FETCH_URL=${LASSIE_FETCH_URL} \
        TEST_NAME=$TEST_NAME \
        SIMULTANEOUS_DOWNLOADS=$CONCURRENCY \
        OUT_DIR="./out" \
        LASSIE_DISCREPENCIES_FILE=$LASSIE_DISCREPENCIES_FILE \
        FILE_TIME_STR=$FILE_TIME_STR \
        ${CUSTOM_K6} run ./scripts/script.js
  done
}

rm -rf out
mkdir -p out
mkdir -p results

if [ -f "$CUSTOM_K6" ]; then
    echo "$CUSTOM_K6 already built."
else
  go install go.k6.io/xk6/cmd/xk6@latest
  xk6 build --with xk6-cid=$(pwd)/cid --with github.com/avitalique/xk6-file
fi

[[ -z "${SKIP_SERVICES_START}" ]] && docker compose up -d influxdb grafana

[[ -z "${SKIP_FIND_PROVS}" ]] && run_find_provs
[[ -z "${SKIP_FETCH}" ]] && run_fetch

# Generate CSV output from the JSON files
source .env
[[ -z "${SKIP_CSV_OUT}" ]] && KUBO_GATEWAY_URL=${KUBO_GATEWAY_URL} \
        LASSIE_FETCH_URL=${LASSIE_FETCH_URL} \
        KUBO_API_BASE=${KUBO_API_BASE} \
        INDEXER_API_BASE=${INDEXER_API_BASE} \
        node scripts/json2csv.mjs $FIND_PROVS_CSV_OUT_FILE $FETCH_CSV_OUT_FILE
