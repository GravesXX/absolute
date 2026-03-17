# Absolute

**The omniscient orchestrator who sees all threads.**

Absolute is an orchestrator agent plugin for [OpenClaw](https://github.com/openclaw) that coordinates three specialist agents — the Chosen — to handle complex, multi-domain tasks through planning, delegation, and quality-controlled synthesis.

## The Chosen

| Agent | Role | Domain |
|-------|------|--------|
| **Sophon the Sage** | Knowledge keeper | Reflections, topic exploration, personality insights, knowledge synthesis |
| **Athena the Strategist** | Career architect | Projects, decisions, todos, resumes, career tracking, job applications |
| **Hermes the Herald** | Interview conductor | Mock interviews, evaluation, practice drills |

## How It Works

Absolute follows a structured orchestration protocol:

1. **Plan** — Analyze the request, break it into tasks, assign each to the right specialist
2. **Checkpoint** — Present the plan to the user for approval before proceeding
3. **Consult** — Ask specialists for input on approach (via Discord bot mentions)
4. **Delegate** — Hand off tasks to specialists with full context
5. **Monitor** — Track progress on long-running tasks
6. **Review** — Quality-score each result (1-5), retry if below threshold
7. **Synthesize** — Combine results into a coherent response with cross-domain insights

## Project Structure

```
absolute/
├── install.sh                  # Setup script
├── workspace/                  # Agent personality and operating instructions
│   ├── SOUL.md                 # Core identity and voice
│   ├── AGENTS.md               # Orchestration protocol and tool reference
│   ├── IDENTITY.md             # Name and tagline
│   └── USER.md                 # User context (populated over time)
├── plugin/                     # OpenClaw plugin (TypeScript)
│   ├── src/
│   │   ├── index.ts            # Plugin entry point
│   │   ├── types.ts            # Shared type definitions
│   │   ├── db/
│   │   │   └── database.ts     # SQLite database (plans, tasks, metrics, logs)
│   │   ├── tools/              # MCP tool definitions
│   │   │   ├── plan-tools.ts   # Plan management tools
│   │   │   ├── task-tools.ts   # Task management tools
│   │   │   ├── consult-tools.ts# Consultation tools
│   │   │   ├── quality-tools.ts# Quality review tools
│   │   │   ├── tracking-tools.ts# Metrics and preferences
│   │   │   ├── log-tools.ts    # Coordination log tools
│   │   │   └── register.ts     # Tool registration
│   │   ├── orchestration/      # Core orchestration logic
│   │   │   ├── planner.ts      # Plan creation and management
│   │   │   ├── delegator.ts    # Task delegation
│   │   │   └── reviewer.ts     # Quality review
│   │   └── tracking/           # Performance tracking
│   │       ├── metrics.ts      # Agent performance metrics
│   │       └── preferences.ts  # User preference storage
│   ├── package.json
│   └── tsconfig.json
└── docs/
    └── superpowers/
        ├── plans/              # Implementation plans
        └── specs/              # Design specifications
```

## Tools

Absolute exposes the following MCP tools:

| Category | Tools |
|----------|-------|
| **Plan Management** | `absolute_plan_create`, `absolute_plan_status`, `absolute_plan_approve`, `absolute_plan_list` |
| **Task Management** | `absolute_task_create`, `absolute_task_update`, `absolute_task_list`, `absolute_task_delegate` |
| **Consultation** | `absolute_consult`, `absolute_consult_response` |
| **Quality** | `absolute_quality_review`, `absolute_quality_summary` |
| **Tracking** | `absolute_metrics`, `absolute_preference_set`, `absolute_preference_get` |
| **Logging** | `absolute_log` |

## Tech Stack

- **Runtime:** TypeScript on Node.js
- **Database:** SQLite via `better-sqlite3` (WAL mode)
- **Testing:** Vitest
- **Platform:** OpenClaw plugin system
- **Integration:** Discord bot mentions for inter-agent communication

## Installation

```bash
./install.sh
```

This installs npm dependencies, verifies the TypeScript build, and runs the test suite.

Then add Absolute to your OpenClaw config (`~/.openclaw/openclaw.json`):

```json
{
  "agents": {
    "list": {
      "absolute": {
        "name": "Absolute",
        "plugin": "/path/to/absolute/plugin/src/index.ts"
      }
    }
  },
  "workspaces": {
    "absolute": "/path/to/absolute/workspace"
  }
}
```

## Development

```bash
cd plugin

# Run tests
npx vitest run

# Watch mode
npx vitest

# Type-check
npx tsc --noEmit
```
