const Web3 = require('web3');

/* eslint-disable max-len */

const MIN_BLOCK_DIFF_SYNC = 10;

/**
 * Fetches multiple ethereum chain states at once via HTTP
 *
 * @param {Array} chain =
 *    { name: 'Mainnet',
 *      api: 'http://my.ethchain.dnp.dappnode.eth:8545' },
 * @return {Array} chainData =
 *     { name: 'Mainnet',
 *       syncing: true,
 *       msg: 'Syncing snapshot: 235/1432' },
 *
 *      <or>
 *
 *     { name: 'Kovan',
 *       syncing: false,
 *       msg: 'Synced #8946123' },
 *
 *      <or>
 *
 *     { name: 'Ropstep',
 *       error: 'Could not connect' },
 */
async function ethereum(chain) {
    const res = {name: chain.name};
    try {
        const web3 = new Web3(chain.api);
        const [syncing, blockNumber] = await Promise.all([web3.eth.isSyncing(), web3.eth.getBlockNumber()]);
        if (syncing && syncing.highestBlock - syncing.currentBlock > MIN_BLOCK_DIFF_SYNC) {
            res.syncing = true;
            res.msg = (syncing.warpChunksAmount > 0 && syncing.warpChunksProcessed > 0)
                ? `Syncing snapshot: ${parseSyncing(syncing.warpChunksProcessed, syncing.warpChunksAmount)}`
                : `Blocks synced: ${parseSyncing(syncing.currentBlock, syncing.highestBlock)}`;
        } else {
            res.syncing = false;
            res.msg = 'Synced #' + blockNumber;
        }
    } catch (e) {
        res.error = e.message;
    }
    return res;
}

function parseSyncing(current, total) {
    return `${parseHexOrDecimal(current)} / ${parseHexOrDecimal(total)}`;
}

// Current versions of parseInt are able to recognize hex numbers
// and automatically use a radix parameter of 16.
function parseHexOrDecimal(hexOrDecimal) {
    return parseInt(hexOrDecimal);
}

module.exports = ethereum;
