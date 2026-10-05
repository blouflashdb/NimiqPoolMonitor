import type * as Nimiq from '@nimiq/core'

export type Tx = Nimiq.PlainTransactionDetails
type HistoryClient = Pick<Nimiq.Client, 'getTransactionsByAddress'>

const PAGE_SIZE = 100 // the client rejects limits above 256
const MAX_PAGES = 200

/**
 * All transactions of `address` from block `since` (a finalized macro block, as the client docs require) to now.
 *
 * Pages run newest to oldest, continuing after the oldest hash of the previous page. Peers sometimes return short
 * pages, so paging only stops once the start height is reached or a page is empty twice in a row.
 * `complete` is false when the page limit was hit; the caller must then scan from the same height again.
 */
export async function historySince(client: HistoryClient, address: string, since: number) {
  const byHash = new Map<string, Tx>()
  let startAt: string | null = null
  let emptyPages = 0
  for (let page = 0; page < MAX_PAGES; page++) {
    const txs = await client.getTransactionsByAddress(address, since, null, startAt, PAGE_SIZE)
    if (!txs.length) {
      if (++emptyPages >= 2)
        return { txs: [...byHash.values()], complete: true }
      continue
    }
    emptyPages = 0
    for (const tx of txs) byHash.set(tx.transactionHash, tx)
    const oldest = txs[txs.length - 1]!
    if ((oldest.blockHeight ?? Infinity) <= since)
      return { txs: [...byHash.values()], complete: true }
    startAt = oldest.transactionHash
  }
  return { txs: [...byHash.values()], complete: false }
}
