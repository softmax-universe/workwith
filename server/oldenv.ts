// Codinger was called Codiner until October 2026. A desk that still sets CODINER_<key>
// gets it for one more release, with a warning in the log; after that only CODINGER_<key>.
const warned = new Set<string>()

export function codingerEnv(key: string): string | undefined {
  const v = process.env[`CODINGER_${key}`]
  if (v != null) return v
  const old = process.env[`CODINER_${key}`]
  if (old != null && !warned.has(key)) {
    warned.add(key)
    console.warn(`CODINER_${key} is the old name: set CODINGER_${key} instead. The next release reads only CODINGER_${key}.`)
  }
  return old
}
