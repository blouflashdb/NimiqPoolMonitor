/** nimiq.watch routes via the URL hash: addresses (spaces as '+'), transaction hashes and block numbers. */
export function watchUrl(value: string | number, network?: string | null) {
  const base = network?.toLowerCase() === 'testalbatross' ? 'https://test.nimiq.watch/' : 'https://nimiq.watch/'
  return `${base}#${String(value).replace(/ /g, '+')}`
}

export const isTxHash = (id: string) => /^[0-9a-f]{64}$/i.test(id)
