#!/usr/bin/env node
// Task board CLI for people and agents: one small GraphQL read per command, no node IDs or shell quoting to handle.
// Usage: node scripts/board.mjs list [status|archived] | show <card> | add <title> [--body <b>] [--status <s>] | move <card> <status>
//        | edit <card> [--title <t>] [--body <b>] | archive <card>
// <card> is an item ID (PVTI_…), an exact title or a unique, case-insensitive part of one. Needs `gh auth refresh -s project`.
import { execFileSync } from 'node:child_process'

const OWNER = 'Shilo'
const NUMBER = 7
const URL = `https://github.com/users/${OWNER}/projects/${NUMBER}`
const USAGE = `Usage: node scripts/board.mjs list [status|archived] | show <card> | add <title> [--body b] [--status s] | move <card> <status> | edit <card> [--title t] [--body b] | archive <card>\nBoard: ${URL}`

const fail = (msg) => { console.error(msg); process.exit(1) }
const text = (s) => s?.replace(/\\n/g, '\n') // a typed \n is a newline in every shell
const flag = (args, name) => { const k = args.indexOf(name); return k < 0 ? undefined : args.splice(k, 2)[1] }
const mark = (i) => i.content?.body?.match(/^(Blocked|Paid|Needs decision):/)?.[1]
const line = (i) => `${i.id}\t${i.status}\t${i.title}${mark(i) ? `\t(${mark(i)})` : ''}`

function gql(query, vars = {}) {
  const args = ['api', 'graphql', '-f', `query=${query}`]
  for (const [k, v] of Object.entries(vars)) args.push(typeof v === 'number' ? '-F' : '-f', `${k}=${v}`)
  try {
    return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 })).data
  } catch (e) {
    const err = String(e.stderr || e.stdout || e.message)
    if (/HTTP 401|Requires authentication|gh auth login/i.test(err)) fail('gh is not signed in: run `gh auth login`; in a sandbox such as Codex, rerun this command outside it.')
    if (/rate limit/i.test(err)) fail(`${err.trim()}\nGitHub rate limit: wait a minute (burst limit) or check \`gh api rate_limit\` (hourly) and retry.`)
    fail(err.trim())
  }
}

function board() {
  const items = []
  let project, after
  do {
    project = gql(`query($owner: String!, $number: Int!, $after: String) { user(login: $owner) { projectV2(number: $number) {
      id
      field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } }
      items(first: 100, after: $after, archivedStates: [ARCHIVED, NOT_ARCHIVED]) { pageInfo { hasNextPage endCursor } nodes {
        id isArchived
        status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
        content { __typename ... on DraftIssue { id title body } ... on Issue { title body url } ... on PullRequest { title body url } }
      } } } } }`, { owner: OWNER, number: NUMBER, ...(after && { after }) }).user?.projectV2
    if (!project) fail(`${URL} is not readable with this gh login.`)
    for (const n of project.items.nodes) items.push({ id: n.id, status: n.status?.name ?? 'No status', archived: n.isArchived, title: n.content?.title ?? '', content: n.content })
    after = project.items.pageInfo.endCursor
  } while (project.items.pageInfo.hasNextPage)
  return { id: project.id, field: project.field, items: items.filter((i) => !i.archived), archived: items.filter((i) => i.archived) }
}

function find(b, query) {
  if (!query) fail(USAGE)
  const q = query.toLowerCase()
  const same = b.items.filter((i) => i.id === query || i.title.toLowerCase() === q)
  if (same.length === 1) return same[0]
  const hits = same.length ? same : b.items.filter((i) => i.title.toLowerCase().includes(q))
  if (hits.length === 1) return hits[0]
  fail(hits.length ? `"${query}" matches ${hits.length} cards:\n${hits.map(line).join('\n')}` : `No card matches "${query}".`)
}

function option(b, name) {
  return b.field.options.find((o) => o.name.toLowerCase() === name.toLowerCase())
    ?? fail(`Unknown status "${name}". Use: ${b.field.options.map((o) => o.name).join(', ')}`)
}

function setStatus(b, itemId, o) {
  gql(`mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) { updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f, value: { singleSelectOptionId: $o } }) { clientMutationId } }`,
    { p: b.id, i: itemId, f: b.field.id, o: o.id })
  return o.name
}

const [cmd, ...args] = process.argv.slice(2)
switch (cmd) {
  case 'list': {
    const want = args.join(' ').toLowerCase(), b = board()
    if (want && want !== 'archived') option(b, want) // a typo fails instead of printing an empty column
    if (want === 'archived') for (const i of b.archived) console.log(`${line(i)}	(archived)`)
    else for (const i of b.items) if (!want || i.status.toLowerCase() === want) console.log(line(i))
    break
  }
  case 'show': {
    const i = find(board(), args.join(' '))
    console.log(`${i.title}\nStatus: ${i.status}\nID: ${i.id}\n${i.content?.url ?? `Board: ${URL}`}\n\n${i.content?.body ?? ''}`)
    break
  }
  case 'add': {
    const body = flag(args, '--body') ?? '', status = flag(args, '--status') ?? 'Ready', title = args.join(' ')
    if (!title) fail(USAGE)
    const b = board()
    const o = option(b, status) // checked before anything is created on the public board
    const dup = [...b.items, ...b.archived].find((i) => i.title.toLowerCase() === title.toLowerCase())
    if (dup) fail(`A card with this title exists${dup.archived ? ' (archived; restore it from the board\'s Archived items)' : ''}: ${line(dup)}`)
    const id = gql(`mutation($p: ID!, $t: String!, $b: String) { addProjectV2DraftIssue(input: { projectId: $p, title: $t, body: $b }) { projectItem { id } } }`,
      { p: b.id, t: title, b: text(body) }).addProjectV2DraftIssue.projectItem.id
    console.log(`${id}\t${setStatus(b, id, o)}\t${title}`)
    break
  }
  case 'move': {
    const status = args.pop()
    const b = board()
    const o = option(b, status)
    const i = find(b, args.join(' '))
    console.log(`${i.id}\t${setStatus(b, i.id, o)}\t${i.title}`)
    break
  }
  case 'edit': {
    const title = flag(args, '--title'), body = flag(args, '--body')
    if (title === undefined && body === undefined) fail(USAGE)
    const i = find(board(), args.join(' '))
    if (i.content?.__typename !== 'DraftIssue') fail('Only draft cards are edited here; edit issues on GitHub.')
    gql(`mutation($d: ID!, $t: String, $b: String) { updateProjectV2DraftIssue(input: { draftIssueId: $d, title: $t, body: $b }) { clientMutationId } }`,
      { d: i.content.id, ...(title !== undefined && { t: title }), ...(body !== undefined && { b: text(body) }) })
    console.log(`${i.id}\tedited\t${title ?? i.title}`)
    break
  }
  case 'archive': {
    const b = board()
    const i = find(b, args.join(' '))
    gql(`mutation($p: ID!, $i: ID!) { archiveProjectV2Item(input: { projectId: $p, itemId: $i }) { clientMutationId } }`, { p: b.id, i: i.id })
    console.log(`${i.id}\tarchived\t${i.title}`)
    break
  }
  default:
    fail(USAGE)
}
