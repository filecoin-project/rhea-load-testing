import fs from 'fs/promises'
import process from 'node:process'

// CSV header line
const fetchHeader = [
  'Service',
  'Latency Avg (ms)',
  'Latency Min (ms)',
  'Latency Med (ms)',
  'Latency Max (ms)',
  'Latency P(90) (ms)',
  'Latency P(95) (ms)',
  'Bandwidth (MB/s) Avg',
  'Bandwidth (MB/s) Min',
  'Bandwidth (MB/s) Med',
  'Bandwidth (MB/s) Max',
  'Bandwidth (MB/s) P(90)',
  'Bandwidth (MB/s) P(95)',
  'Success Rate'
]

const findProvsHeader = [
  'Service',
  'Providers Found Avg',
  'Providers Found Min',
  'Providers Found Med',
  'Providers Found Max',
  'Providers Found P(90)',
  'Providers Found P(95)',
  'Success Rate'
]
/**
 * Process a single test JSON file for fetch into a row per server. This is where the
 * bulk of the processing of the input data happens.
 *
 * @param {string} test the name of the test
 * @param {string} name the name of the test data file
 * @param {object} input the test data
 * @returns {(string|number)[][]} an array per protocol
 */
function processFetchInput (input) {
  const providers = []

  if (process.env.KUBO_GATEWAY_URL) {
    const kubo = [
      'Kubo get', // Protocol
      input.metrics.ttfb_kubo.values.avg, // TTFB Avg (ms)
      input.metrics.ttfb_kubo.values.min, // TTFB Min (ms)
      input.metrics.ttfb_kubo.values.med, // TTFB Med (ms)
      input.metrics.ttfb_kubo.values.max, // TTFB Max (ms)
      input.metrics.ttfb_kubo.values['p(90)'], // TTFB P(90) (ms)
      input.metrics.ttfb_kubo.values['p(95)'], // TTFB P(95) (ms)
      input.metrics.megabytes_per_second_kubo.values.avg, // MB/s Avg
      input.metrics.megabytes_per_second_kubo.values.min, // MB/s Min
      input.metrics.megabytes_per_second_kubo.values.med, // MB/s Med
      input.metrics.megabytes_per_second_kubo.values.max, // MB/s Max
      input.metrics.megabytes_per_second_kubo.values['p(90)'], // MB/s P(90)
      input.metrics.megabytes_per_second_kubo.values['p(95)'], // MB/s P(95)
      input.metrics.success_kubo.values.rate // Success Rate
    ]
    providers.push(kubo)
  }
  const lassie = [
    'Lassie Fetch', // Protocol
    input.metrics.ttfb_lassie.values.avg, // TTFB Avg (ms)
    input.metrics.ttfb_lassie.values.min, // TTFB Min (ms)
    input.metrics.ttfb_lassie.values.med, // TTFB Med (ms)
    input.metrics.ttfb_lassie.values.max, // TTFB Max (ms)
    input.metrics.ttfb_lassie.values['p(90)'], // TTFB P(90) (ms)
    input.metrics.ttfb_lassie.values['p(95)'], // TTFB P(95) (ms)
    input.metrics.megabytes_per_second_lassie.values.avg, // MB/s Avg
    input.metrics.megabytes_per_second_lassie.values.min, // MB/s Min
    input.metrics.megabytes_per_second_lassie.values.med, // MB/s Med
    input.metrics.megabytes_per_second_lassie.values.max, // MB/s Max
    input.metrics.megabytes_per_second_lassie.values['p(90)'], // MB/s P(90)
    input.metrics.megabytes_per_second_lassie.values['p(95)'], // MB/s P(95)
    input.metrics.success_lassie.values.rate // Success Rate
  ]
  providers.push(lassie)
  return providers
}

/**
 * Process a single test JSON file for find provs into a row per server. This is where the
 * bulk of the processing of the input data happens.
 *
 * @param {string} test the name of the test
 * @param {string} name the name of the test data file
 * @param {object} input the test data
 * @returns {(string|number)[][]} an array per protocol
 */
function processFindProvsInput (input) {
  const providers = []

  if (process.env.KUBO_API_BASE) {
    const kuboFindProvs = [
      'Kubo Find Provs', // Protocol
      input.metrics.provider_rate_kubo.values.avg, // TTFB Avg
      input.metrics.provider_rate_kubo.values.min, // TTFB Min
      input.metrics.provider_rate_kubo.values.med, // TTFB Med
      input.metrics.provider_rate_kubo.values.max, // TTFB Max
      input.metrics.provider_rate_kubo.values['p(90)'], // TTFB P(90)
      input.metrics.provider_rate_kubo.values['p(95)'], // TTFB P(95)
      input.metrics.success_kubo.values.rate // Success Rate
    ]
    providers.push(kuboFindProvs)
  }
  const indexerFindProvs = [
    'Indexer Query', // Protocol
    input.metrics.provider_rate_indexer.values.avg, // TTFB Avg
    input.metrics.provider_rate_indexer.values.min, // TTFB Min
    input.metrics.provider_rate_indexer.values.med, // TTFB Med
    input.metrics.provider_rate_indexer.values.max, // TTFB Max
    input.metrics.provider_rate_indexer.values['p(90)'], // TTFB P(90)
    input.metrics.provider_rate_indexer.values['p(95)'], // TTFB P(95)
    input.metrics.success_indexer.values.rate // Success Rate
  ]
  providers.push(indexerFindProvs)
  return providers
}
/**
 * Turn an array into a line of CSV data. Currently this doesn't need to do
 * anything fancy but quoting or escaping may be required as the data evolves.
 * e.g. scenarios get quotes or commas in their names or numbers start to print
 * with scientific notation or some form that isn't easily imported as a
 * spreadsheet format.
 *
 * @param {any[]} data
 * @returns {string}
 */
function toCSV (data) {
  return data.join(',')
}

/**
 * filenameSort is a custom sort function for the test data files. It sorts the
 * files by the number at the start of the filename, then optionally by the byte
 * size it's also in the name (as it is for range-requests).
 * We sort files to ensure that the rows in the CSV are in a reasonable order.
 *
 * @param {{name: string}} a
 * @param {{name: string}} b
 * @returns {number}
 */
function filenameSort (a, b) {
  // extract the VU from the start of the filename, then optionally the
  // byte size as the second element
  const valuesFromname = (name) => {
    const m = name.match(/^(\d+)vu_(?:(\d+)B)?/)
    return [parseInt(m[1], 10), parseInt(m[2], 10)]
  }
  const ai = valuesFromname(a.name)
  const bi = valuesFromname(b.name)
  // sort by VU first, then byte size if VU is the same
  if (ai[0] === bi[0]) {
    return ai[1] === bi[1] ? 0 : ai[1] < bi[1] ? -1 : 1
  }
  return ai[0] < bi[0] ? -1 : 1
}

/**
 * The main entry point for the script. This reads all the JSON files from the
 * `out` directory and transforms them into a single CSV file.
 */
async function run () {
  // ingest all the JSON data into a single array
  const outDir = new URL('../out/', import.meta.url)
  for (const dir of await fs.readdir(outDir, { withFileTypes: true })) {
    const test = dir.name
    if (!dir.isDirectory()) {
      continue
    }

    const header = test === 'find provs' ? findProvsHeader : fetchHeader
    let data = [header]
    const root = new URL(`./${test}/`, outDir)
    let files = await fs.readdir(root, { withFileTypes: true })
    // sort the files so they end up in our output in a nice order
    files = files.filter((f) => f.isFile()).sort(filenameSort)
    const processInput = test === 'find provs' ? processFindProvsInput : processFetchInput
    for (const file of files) {
      const name = file.name.replace(/\.json$/)
      const input = JSON.parse(await fs.readFile(new URL(file.name, root)))
      data = data.concat(processInput(input))
    }
    // transform the data into CSV
    const contents = data.map(toCSV).join('\n') + '\n'
    const out = test === 'find provs'
      ? process.argv[2] || new URL('../results/results_find_provs.csv', import.meta.url).pathname
      : process.argv[3] || new URL('../results/results_fetch.csv', import.meta.url).pathname
    await fs.writeFile(out, contents, 'utf8')
    console.log('Wrote stats CSV to', out)
  }
}

run().catch(console.error)
