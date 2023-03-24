/* global __ENV open */

import http from 'k6/http'
import { SharedArray } from 'k6/data'
import { Trend, Rate, Counter } from 'k6/metrics'
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.3/index.js'
import exec from 'k6/execution'
import file from 'k6/x/file'

const saturnCids = new SharedArray('saturnCids', function () {
  return [...new Set(JSON.parse(open('../latest.json')))]
})

export function setup () {
  if (__ENV.LASSIE_DISCREPENCIES_FILE) {
    file.writeString(__ENV.LASSIE_DISCREPENCIES_FILE, 'CID\n')
  }
}

const megabytesPerSecLassie = new Trend('megabytes_per_second_lassie')
const megabytesPerSecKubo = new Trend('megabytes_per_second_kubo')
const dataReceivedLassie = new Counter('data_received_lassie')
const dataReceivedKubo = new Counter('data_received_kubo')
const timeLassie = new Trend('time_lassie', true)
const timeDelta = new Trend('time_delta', true)
const timeKubo = new Trend('time_kubo', true)
const ttfbLassie = new Trend('ttfb_lassie', true)
const ttfbDelta = new Trend('ttfb_delta', true)
const ttfbKubo = new Trend('ttfb_kubo', true)
const lassieSuccess = new Rate('success_lassie')
const kuboSuccess = new Rate('success_kubo')

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
  let lassieResponse, kuboResponse
  if (findKuboFirst) {
    kuboResponse = fetchKubo(cidPath)
    lassieResponse = fetchLassie(cidPath)
  } else {
    lassieResponse = fetchLassie(cidPath)
    kuboResponse = fetchKubo(cidPath)
  }

  if (__ENV.KUBO_GATEWAY_URL) {
    timeDelta.add(lassieResponse.timings.duration - kuboResponse.timings.duration)
    ttfbDelta.add(lassieResponse.timings.waiting - kuboResponse.timings.waiting)
    if (success(kuboResponse) && !success(lassieResponse)) {
      file.appendString(__ENV.LASSIE_DISCREPENCIES_FILE, cidPath + '\n')
    }
  }
}

/**
 * Fetches a piece CID from the BOOST_FETCH_URL
 * @param {string} piece The piece CID string to fetch
 * @returns A K6 HTTP response from the BOOST_FETCH_URL (https://k6.io/docs/javascript-api/k6-http/response/)
 */
function fetchLassie (cidPath) {
  const response = http.get(`${__ENV.LASSIE_FETCH_URL}/ipfs/${cidPath}?depthType=shallow&format=car`, {
    tags: {
      name: 'LassieFetchUrl'
    }
  })
  timeLassie.add(response.timings.duration)
  ttfbLassie.add(response.timings.waiting)
  lassieSuccess.add(success(response))

  if (success(response)) {
    const contentLength = response.body.length
    if (contentLength && !Number.isNaN(contentLength)) {
      dataReceivedLassie.add(contentLength, { url: response.url })

      const megabytes = contentLength / 1048576
      const seconds = response.timings.duration / 1000
      megabytesPerSecLassie.add(megabytes / seconds)
    }
  }

  return response
}

function success (response) {
  return response.status >= 200 && response.status < 300
}

/**
 * Fetches a piece CID from the RAW_FETCH_URL
 * @param {string} piece The piece CID string to fetch
 * @returns A K6 HTTP response from the RAW_FETCH_URL (https://k6.io/docs/javascript-api/k6-http/response/)
 */
function fetchKubo (cidPath) {
  if (__ENV.KUBO_GATEWAY_URL) {
    const response = http.get(`${__ENV.KUBO_GATEWAY_URL}/ipfs/${cidPath}`, {
      tags: {
        name: 'RawFetchURL'
      }
    })
    timeKubo.add(response.timings.duration)
    ttfbKubo.add(response.timings.waiting)
    kuboSuccess.add(success(response))

    if (success(response)) {
      const contentLength = response.body.length
      if (contentLength && !Number.isNaN(contentLength)) {
        dataReceivedKubo.add(contentLength, { url: response.url })

        const megabytes = contentLength / 1048576
        const seconds = response.timings.duration / 1000
        megabytesPerSecKubo.add(megabytes / seconds)
      }
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
  const range = __ENV.RANGE_SIZE
  const rangePart = name === 'range-requests' ? `${range}B_` : ''
  const filepath = `${dir}/${name}/${concurrency}vu_${rangePart}${timeStr}.json`

  return {
    stdout: textSummary(data, { indent: '  ', enableColors: true }) + '\n',
    [filepath]: JSON.stringify(data, null, 2)
  }
}
