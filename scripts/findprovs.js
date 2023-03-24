/* global __ENV open */

import http from 'k6/http'
import { SharedArray } from 'k6/data'
import { Rate, Trend } from 'k6/metrics'
import exec from 'k6/execution'
import { hash } from 'k6/x/cid'
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.3/index.js'
import file from 'k6/x/file'

const kuboSuccess = new Rate('success_kubo')
const kuboProviderRate = new Trend('provider_rate_kubo', false)
const indexerSuccess = new Rate('success_indexer')
const indexerProviderRate = new Trend('provider_rate_indexer', false)

const saturnCids = new SharedArray('saturnCids', function () {
  return JSON.parse(open('../latest.json'))
})

export function setup() {
  if (__ENV.MISSING_CIDS_FILE) {
    file.writeString(__ENV.MISSING_CIDS_FILE, 'CID,PeerIDs\n')
  }
}

export const options = {
  scenarios: {
    contacts: {
      executor: 'shared-iterations',
      vus: __ENV.SIMULTANEOUS_DOWNLOADS,
      iterations: saturnCids.length,
      maxDuration: '60m'
    }
  }
}

export default function () {
  // get a random piece from the list
  const cidPath = saturnCids[exec.scenario.iterationInTest]
  // randomly fetch first from either a raw url or boost
  const findKuboFirst = Math.random() >= 0.5

  let kuboResponse, indexerResponse
  if (findKuboFirst) {
    kuboResponse = findFromKubo(cidPath)
    indexerResponse = findFromIndexer(cidPath)
  } else {
    indexerResponse = findFromIndexer(cidPath)
    kuboResponse = findFromKubo(cidPath)
  }
  if (__ENV.KUBO_API_BASE && __ENV.MISSING_CIDS_FILE) {
    if (success(kuboResponse.response) && !success(indexerResponse.response) && kuboResponse.unique && kuboResponse.unique.length > 0) {
      let outputString = cidPath.split('/')[0] + ',"'
      kuboResponse.unique.forEach((peerID) => {
        outputString += peerID + ','
      })
      outputString += '"\n'
      file.appendString(__ENV.MISSING_CIDS_FILE, outputString)
    }
  }
}

function success(response) {
  return response.status >= 200 && response.status < 300
}

/**
 * Fetches a piece CID from the BOOST_FETCH_URL
 * @param {string} piece The piece CID string to fetch
 * @returns A K6 HTTP response from the BOOST_FETCH_URL (https://k6.io/docs/javascript-api/k6-http/response/)
 */
function findFromIndexer(cidPath) {
  const cid = cidPath.split('/')[0]
  const hashResult = hash(cid)
  const response = http.get(`${__ENV.INDEXER_API_BASE}/multihash/${hashResult}?cascade=ipfs-dht&cascade=legacy`, {
    tags: {
      name: 'IndexerFetchURL',
      timeout: '1m'
    },
    headers: {
      Accept: 'application/x-ndjson'
    }
  })
  indexerSuccess.add(success(response))
  let unique
  if (success(response)) {
    const lines = response.body.split('\n')
    const providers = []
    lines.forEach((line) => {
      if (!line) {
        return
      }
      try {
        const obj = JSON.parse(line)
        providers.push(obj.Provider.ID)
      } catch (error) {
        console.log('error parsing results', error)
      }
    })
    unique = [...new Set(providers)]
    indexerProviderRate.add(unique.length)
  }
  return { response, unique }
}

/**
 * Finds a CID using Kubo v1 API
 * @param {string} piece The piece CID string to fetch
 * @returns A K6 HTTP response from the RAW_FETCH_URL (https://k6.io/docs/javascript-api/k6-http/response/)
 */
function findFromKubo(cidPath) {
  const cid = cidPath.split('/')[0]
  if (__ENV.KUBO_API_BASE) {
    const response = http.post(`${__ENV.KUBO_API_BASE}/api/v0/dht/findprovs/${cid}?num-providers=20`, {
      tags: {
        name: 'IPFSFetchURL'
      },
      timeout: '1m'
    })

    let unique
    if (success(response)) {
      const lines = response.body.split('\n')
      const providers = []
      lines.forEach((line) => {
        if (!line) {
          return
        }
        try {
          const obj = JSON.parse(line)
          if (obj && obj.Type === 4) {
            obj.Responses.forEach((response) => {
              providers.push(response.ID)
            })
          }
        } catch (error) {
          console.log('error parsing results', error)
        }
      })
      unique = [...new Set(providers)]
      kuboProviderRate.add(unique.length)
    }

    kuboSuccess.add(success(response) && unique && unique.length > 0)

    return { response, unique }
  }
}

/**
 * Defines a custom K6 summary output configuration.
 * Configuration changes based on test name.
 */
export function handleSummary(data) {
  const timeStr = __ENV.FILE_TIME_STR || new Date().toISOString()
  const dir = __ENV.OUT_DIR
  const name = __ENV.TEST_NAME
  const concurrency = __ENV.SIMULTANEOUS_DOWNLOADS
  const filepath = `${dir}/${name}/${concurrency}vu_${timeStr}.json`

  return {
    stdout: textSummary(data, { indent: '  ', enableColors: true }) + '\n',
    [filepath]: JSON.stringify(data, null, 2)
  }
}
