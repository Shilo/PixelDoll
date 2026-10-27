# GitHub CLI authorization workflow

Reuse the user's saved `gh` authorization for authorized GitHub work. A new agent session, a signed-out browser,
or a sandbox failure does not establish that the saved CLI credential needs replacing. This document contains
public commands and general procedures, with no local account or credential records.

Task-tracking rationale, review findings and accepted tool limits: [Task management rationale and limits](task-management.md).

## Use the saved authorization

Run the requested operation with the existing credential first. For board commands, follow the Tasks section of
[AGENTS.md](../AGENTS.md). Codex must run the board CLI outside the sandbox under
[board.rules](../.codex/rules/board.rules), which requires approval because the script can use the user's credential.
Reuse approval already granted in the current session when applicable; preserve that rule. Sandbox execution approval
and GitHub login are separate steps.

If authentication or access fails, diagnose it in the same user context that can access the saved credential:

```powershell
gh auth status --active --hostname github.com
```

Read the result without saving its raw output to the repository, board, or public logs. Do not use `--show-token`
or `gh auth token` for diagnostics. Successful status confirms authentication; the requested operation still determines
whether the credential has the necessary access.

## Diagnose before requesting user action

| Evidence | Next step |
|---|---|
| Only sandboxed commands appear signed out or hit an unauthenticated rate limit | Retry through the approved execution context that can use saved authorization. Check status there before requesting login. |
| Status succeeds and the operation succeeds | Continue. No login or scope refresh is needed. |
| Status or behavior differs between execution contexts | Check whether `GH_TOKEN`, `GITHUB_TOKEN`, or `GH_CONFIG_DIR` is set, without printing values. The token variables override saved credentials; the config variable selects a different configuration location. Do not change these settings without establishing their purpose. |
| The API explicitly reports a missing scope | Request only the scope required for the authorized operation, after checking the active credential and any environment override. |
| Authentication succeeds but the API denies resource access | Check the target repository/project, account access, and any stated organization authorization requirement. A scope refresh does not grant access the user lacks. |
| An authenticated request hits a rate limit | Inspect `gh api rate_limit` and honor the reported reset or retry delay. A rate limit alone is not evidence that login is needed. |
| Saved authentication is absent or invalid in the normal user context | Ask the user to authenticate only after ruling out sandbox isolation, environment overrides, and a configuration mismatch. |

Check environment variable presence only, for example with `Test-Path Env:GH_TOKEN` in PowerShell. Never dump the
environment or read a token value to determine whether a variable exists. If multiple saved accounts are present,
identify the intended account from task context and saved status; ask only if that is ambiguous. Reuse its saved
authorization instead of creating another login to solve an account mismatch.

## Repair access only when necessary

The board's GraphQL queries need `read:project` or `project`; its mutations need `project`.
The `project` scope covers both, so an existing `project` grant does not need a separate `read:project` grant.
When a confirmed missing scope blocks approved board work, obtain approval for that access expansion and run:

```powershell
gh auth refresh --hostname github.com --scopes project
```

Refresh extends the saved authorization; it is not a prerequisite for each task. Preserve existing scopes: do not
use `--reset-scopes`, log out, revoke credentials, or replace the token as routine troubleshooting.
If login is actually required, use the standard browser flow with `gh auth login --hostname github.com --web`.
Keep credentials in the system credential store; do not choose `--insecure-storage` for convenience.

For a device flow, wait for the CLI to report authentication completion, then verify status and a read operation.
A browser success page alone does not prove the CLI saved the authorization. If completion stalls, check the process
and saved status before asking the user to repeat the flow. After restoring access, inspect the result of any earlier
mutation whose outcome is uncertain before retrying it.

## Keep private state out of the repository

Do not commit authentication output, account inventories, credential-store paths, tokens, device codes, credential
files, or environment values. Do not copy saved credentials into this repository, `.env`, scripts, or Git configuration.
Keep troubleshooting notes generic. If private local evidence is necessary, use an ignored location, verify it with
`git check-ignore -- <path>` before writing, and exclude it from staged changes. Review `git diff --cached` before committing.

## Public references

- [GitHub CLI login and credential storage](https://cli.github.com/manual/gh_auth_login)
- [GitHub CLI authentication status](https://cli.github.com/manual/gh_auth_status)
- [GitHub CLI scope refresh](https://cli.github.com/manual/gh_auth_refresh)
- [GitHub CLI environment precedence](https://cli.github.com/manual/gh_help_environment)
- [GitHub Projects API authentication](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects)
