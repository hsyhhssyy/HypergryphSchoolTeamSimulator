# Agent instructions

## Port usage

- Agents must not start, bind, or otherwise take ownership of ports `5173` or `8080`. These ports are reserved for the user's own development servers. Read-only inspection of port state is allowed.
- Automated tests and agent-run preview servers must use other ports. The repository's Playwright defaults are frontend `4173` and Worker API `8787`.
- Before starting a test server, verify that its selected port is free. Agents may terminate processes they started themselves or processes whose termination is within the task scope, but must never terminate the process group serving ports `5173` or `8080`. If another selected test port is occupied by an unrelated process, choose another free port instead.
- Any new test configuration, script, or documentation intended for agent execution must preserve this reservation.
