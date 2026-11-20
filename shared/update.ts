// Codinger keeps itself up to date with origin/main (server/update.ts): a push to
// main is a release. The page shows a banner that offers an update, or while one
// waits, runs or stops. Settings.autoUpdate: ask first (the default), always or never.
//
// behind: commits on origin/main that this checkout does not have; head: origin/main's
// short hash (a banner you close stays closed until the next one); subject: its message.
// managed: something else installs updates here (CODINGER_UPDATE_STATUS): the server only
// shows them and asks for them, so no agent can do one by hand.
export type UpdateMode = 'ask' | 'always' | 'never'

type Info = { behind: number; head: string; subject: string; managed?: true }

export type UpdateStatus =
  | { state: 'current' }
  | ({ state: 'offer' } & Info)    // ask: install it?
  | ({ state: 'waiting' } & Info)  // until no session is working
  | ({ state: 'updating' } & Info)
  | ({ state: 'blocked'; why: string } & Info) // the checkout stops it; an agent can do it
  | ({ state: 'failed'; why: string } & Info)
