# Dashboard Plan Generation Specification

## Purpose

Turn a `TableProfile` and a user's natural-language comment into a validated `DashboardPlan` (4-8 widgets, each with SQL) via `POST /api/plan`, without ever sending data rows to the model.

## Requirements

### Requirement: Metadata-Only Plan Request

The system MUST accept `{ profile: TableProfile, comment: string }` as the only request body shape for `POST /api/plan`. The handler MUST NOT accept, read, or forward raw data rows to the model under any circumstance.

#### Scenario: Valid metadata-only request

- GIVEN a client holds a validated `TableProfile` and a user comment
- WHEN it POSTs `{ profile, comment }` to `/api/plan`
- THEN the server builds the model payload using only `tableName`, `rowCount`, and per-column `name`, `rawType`, `semanticType`, summarized `stats`, and `sampleValues`
- AND no field resembling a full data row is included in the payload sent to the model

#### Scenario: Request body includes row-shaped data

- GIVEN a client sends a payload containing an additional `rows` or `data` field alongside `profile` and `comment`
- WHEN the server constructs the model request
- THEN the server ignores any field outside `{ profile, comment }` and never forwards it to the model

### Requirement: Schema-Conformant Plan Output

The system MUST return a `DashboardPlan` that validates against `dashboardPlanSchema` (1-8 widgets, target 4-8) for every successful `POST /api/plan` response.

#### Scenario: Model returns a valid plan on first attempt

- GIVEN a valid `{ profile, comment }` request
- WHEN `claude-haiku-4-5` is called via `client.messages.parse()` with `zodOutputFormat(dashboardPlanSchema)`
- THEN the response is parsed into a `DashboardPlan` satisfying `dashboardPlanSchema`
- AND the plan is returned to the client with HTTP 200

#### Scenario: Plan fails validation, re-ask succeeds

- GIVEN the model's first response fails `dashboardPlanSchema` validation via `safeParse`
- WHEN the server re-asks the model exactly once, explicitly requesting valid JSON matching the schema
- THEN if the second response validates, it is returned to the client as the `DashboardPlan`
- AND no further re-ask attempts are made regardless of outcome

#### Scenario: Plan fails validation twice

- GIVEN the first response fails validation and the single re-ask also fails `dashboardPlanSchema` validation
- WHEN the server has exhausted its one allowed re-ask
- THEN the server MUST NOT throw an unhandled exception or crash the request
- AND the server returns a structured error response indicating the dashboard could not be generated
- AND the client surfaces this as a clear, non-blank error state to the user

### Requirement: Bounded Plan Retry Budget

The system MUST cap plan-generation retries at exactly one re-ask per request, independent of any client-side SQL retry budget.

#### Scenario: Retry budget is not exceeded

- GIVEN a `/api/plan` request that fails validation on the first model call
- WHEN the server performs the re-ask
- THEN the server makes at most 2 total model calls for that request (1 initial + 1 re-ask)
- AND this budget is tracked and enforced independently of the client-side per-widget SQL correction loop (see widget-sql-execution capability)

### Requirement: Server-Side Key Isolation

The system MUST read `ANTHROPIC_API_KEY` only from server-side environment configuration and MUST NOT expose it to the client.

#### Scenario: API key never reaches the client bundle

- GIVEN the application is built and served
- WHEN any client-side code or network response is inspected
- THEN `ANTHROPIC_API_KEY` does not appear in client bundles, `NEXT_PUBLIC_*` variables, or any `/api/plan` response body

### Requirement: Rate-Limited Plan Endpoint

The system MUST rate-limit `POST /api/plan` per client IP address to bound abuse and runaway model cost.

#### Scenario: Requests within budget succeed

- GIVEN a client IP has made fewer requests than the configured per-minute budget
- WHEN it POSTs to `/api/plan`
- THEN the request is processed normally

#### Scenario: Requests exceeding budget are rejected

- GIVEN a client IP has reached the configured per-minute request budget
- WHEN it POSTs another request to `/api/plan` within the same window
- THEN the server returns HTTP 429 with a structured error body
- AND the server does NOT call the model for the rejected request
- AND the rejection does not crash the server process

#### Scenario: Session-based limiting as documented alternative

- GIVEN per-IP limiting is the default granularity
- WHEN a deployment environment cannot reliably derive client IP (e.g. behind an opaque proxy)
- THEN the system MAY substitute a session-token-based limiter with an equivalent per-minute budget
- AND this substitution MUST preserve the same request-rejection behavior (HTTP 429, structured error, no model call)
