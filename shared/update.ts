// Codinger keeps itself up to date with origin/main (server/update.ts): a push to
// main is a release. The page shows a banner that offers an update, or while one
// waits, runs or stops. Settings.autoUpdate: ask first (the default), always or never.
//
// behind: commits on origin/main that this checkout does not have; head: origin/main's
// short hash (a banner you close stays closed until the next one); subject: its message;
// asked: the issues this desk filed that the new commits name (server/loop.ts issuesOf).
// managed: something else installs updates here (CODINGER_UPDATE_STATUS): the server only
// shows them and asks for them, so no agent can do one by hand.
export type UpdateMode = 'ask' | 'always' | 'never'

export type IssueRef = { n: number; title: string; url: string; here: boolean }

// One commit of origin/main for What's new: a push to main is a release, and its
// message says what changed for the user. installed: this checkout has it.
export type Change = { hash: string; at: number; subject: string; installed: boolean; issues: IssueRef[] }

export type UpdateInfo = { behind: number; head: string; subject: string; asked?: IssueRef[]; managed?: true }

export type UpdateStatus =
  | { state: 'current' }
  | ({ state: 'offer' } & UpdateInfo)     // ask: install it?
  | ({ state: 'waiting' } & UpdateInfo)   // until no session is working
  | ({ state: 'updating' } & UpdateInfo)
  | ({ state: 'blocked'; why: string } & UpdateInfo) // the checkout stops it; an agent can do it
  | ({ state: 'failed'; why: string } & UpdateInfo)
