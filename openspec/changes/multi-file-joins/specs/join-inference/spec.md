# Join Inference Specification

## Purpose

Turn detected candidate keys into an interpreted, ranked join proposal via `POST /api/joins`, sending the model only schemas and candidate-key metadata (never rows), validating the response with Zod, and requiring explicit user confirmation before any join is applied.

## Requirements

### Requirement: Metadata-Only Join Inference Request

The system MUST accept only `{ profiles: TableProfile[], candidates: JoinCandidate[], comment?: string }` as the request body shape for `POST /api/joins`, and MUST NOT forward raw data rows to the model.

#### Scenario: Valid metadata-only request

- GIVEN two `TableProfile`s and a non-empty candidate-key list from detection
- WHEN the client POSTs `{ profiles, candidates }` to `/api/joins`
- THEN the server builds the model payload using only schema fields, stats, and candidate metadata
- AND no data row from either table is included in the payload

#### Scenario: No candidates, no model call

- GIVEN candidate-key detection produced zero candidates for a table pair
- WHEN the client considers requesting a join
- THEN the system MUST NOT call `POST /api/joins` for that pair
- AND the per-table experience continues

### Requirement: Model May Only Choose Among Candidates

The system MUST restrict the model's join proposal to column pairs present in the supplied candidate list and MUST reject any proposal referencing a non-candidate column.

#### Scenario: Model proposes a valid candidate

- GIVEN the candidate list includes `orders.customer_id` / `customers.id`
- WHEN the model proposes this pair as the join
- THEN the proposal is accepted for Zod validation

#### Scenario: Model invents a non-candidate column

- GIVEN the candidate list does not include `orders.email` / `customers.email`
- WHEN the model's response references that pair as the join key
- THEN the response fails validation and is treated as invalid output
- AND the system re-asks once per the standard retry budget, then degrades if still invalid

### Requirement: Schema-Conformant Join Plan Output

The system MUST return a join proposal that validates against a `joinPlanSchema` (left table, right table, key column pair, join type, confidence) for every successful `POST /api/joins` response, and MUST re-ask at most once on validation failure before degrading.

#### Scenario: Valid proposal on first attempt

- GIVEN a valid `{ profiles, candidates }` request
- WHEN the model returns a proposal
- THEN it is parsed and validated against `joinPlanSchema`
- AND returned to the client with HTTP 200 on success

#### Scenario: Validation fails twice

- GIVEN the model's first response and its single re-ask both fail `joinPlanSchema` validation
- THEN the server MUST NOT throw an unhandled exception
- AND the server returns a structured response indicating no reliable join could be inferred
- AND the client falls back to the per-table experience

#### Scenario: Low-confidence proposal degrades

- GIVEN the model returns a validly-shaped proposal with confidence below the configured threshold
- WHEN the server evaluates the response
- THEN the system treats it as no actionable join and offers the per-table experience instead

### Requirement: Mandatory User Confirmation Before Any Join

The system MUST present every inferred join proposal to the user with its key columns, join type, and confidence/overlap evidence, and MUST NOT create a joined view until the user explicitly confirms.

#### Scenario: User confirms the inferred join

- GIVEN an inferred join proposal is displayed with its evidence
- WHEN the user confirms it
- THEN the system proceeds to build the joined view using the confirmed key columns and join type

#### Scenario: User corrects the proposal

- GIVEN an inferred join proposal
- WHEN the user swaps the key columns or changes the join type before confirming
- THEN the system uses the user's corrected values, not the model's original proposal, when building the view

#### Scenario: User rejects the proposal

- GIVEN an inferred join proposal
- WHEN the user rejects it
- THEN no view is created
- AND both tables remain usable independently in the per-table flow

### Requirement: Rate-Limited Join Inference Endpoint

The system MUST rate-limit `POST /api/joins` per client IP, following the same pattern as `/api/plan`.

#### Scenario: Requests exceeding budget are rejected

- GIVEN a client IP has reached the configured per-minute budget for `/api/joins`
- WHEN it POSTs another request within the same window
- THEN the server returns HTTP 429 with a structured error body and does not call the model
