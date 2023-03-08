/* global __ENV open */

import http from 'k6/http'
import { SharedArray } from 'k6/data'
import { Rate, Trend } from 'k6/metrics'
import exec from 'k6/execution'
import { hash } from 'k6/x/cid'
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.3/index.js'

const kuboSuccess = new Rate('success_kubo')
const kuboProviderRate = new Trend('provider_rate_kubo', false)
const indexerSuccess = new Rate('success_indexer')
const indexerProviderRate = new Trend('provider_rate_indexer', false)

const saturnCids = new SharedArray('saturnCids', function () {
  return JSON.parse(open('../latest.json'))
})

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

  if (findKuboFirst) {
    findFromKubo(cidPath)
    findFromIndexer(cidPath)
  } else {
    findFromIndexer(cidPath)
    findFromKubo(cidPath)
  }
}

/**
 * Fetches a piece CID from the BOOST_FETCH_URL
 * @param {string} piece The piece CID string to fetch
 * @returns A K6 HTTP response from the BOOST_FETCH_URL (https://k6.io/docs/javascript-api/k6-http/response/)
 */
function findFromIndexer (cidPath) {
  const cid = cidPath.split('/')[0]
  const hashResult = hash(cid)
  const response = http.get(`${__ENV.INDEXER_API_BASE}/multihash/${hashResult}?cascade=ipfs-dht`, {
    tags: {
      name: 'IndexerFetchURL',
      timeout: '1m'
    }
  })

  indexerSuccess.add(response.status >= 200 && response.status < 300)

  if (response.status >= 200 || response.status < 300) {
    const lines = response.body.split('\n')
    const providers = []
    lines.forEach((line) => {
      if (!line) {
        return
      }
      try {
        const obj = JSON.parse(line)
        obj.MultihashResults.forEach((result) => {
          result.ProviderResults.forEach((provider) => {
            providers.push(provider.Provider.ID)
          })
        })
      } catch (error) {
        console.log('error parsing results', error)
      }
    })
    const unique = [...new Set(providers)]
    indexerProviderRate.add(unique.length)
  }
  return response
}

/**
 * Finds a CID using Kubo v1 API
 * @param {string} piece The piece CID string to fetch
 * @returns A K6 HTTP response from the RAW_FETCH_URL (https://k6.io/docs/javascript-api/k6-http/response/)
 */
function findFromKubo (cidPath) {
  const cid = cidPath.split('/')[0]
  if (__ENV.KUBO_API_BASE) {
    const response = http.post(`${__ENV.KUBO_API_BASE}/api/v0/dht/findprovs/${cid}?num-providers=20`, {
      tags: {
        name: 'IPFSFetchURL'
      },
      timeout: '1m'
    })

    kuboSuccess.add(response.status >= 200 && response.status < 300)

    if (response.status >= 200 || response.status < 300) {
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
      const unique = [...new Set(providers)]
      kuboProviderRate.add(unique.length)
    }
    return response
  }
}

/**
 * Defines a custom K6 summary output configuration.
 * Configuration changes based on test name.
 */
export function handleSummary (data) {
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
