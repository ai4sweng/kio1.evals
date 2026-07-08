# KIO1 Orchestrator — LLM Evaluation Framework

## Overview

Evaluation framework for the KIO1 AI Orchestrator using [Promptfoo](https://promptfoo.dev/). The orchestrator analyzes software-development requests and produces structured workflow plans that select and sequence the appropriate KIO agents (KIO2–KIO13).

---

## Project Structure

```
orchestrator-kio1/
├── promptfooconfig.yaml   # Promptfoo configuration (providers, tests, assertions)
├── prompt.json            # Chat prompt template (system + user messages)
├── workflow_eval.js       # Custom JavaScript evaluation / scoring logic
├── README.md              # This file
├── data/
│   └── ver1.yaml          # Evaluation dataset (90 test cases)
└── prompts/
    └── kio1_ver1.txt      # System prompt for the orchestrator
```

---

## Evaluation Methodology

The framework mirrors the architecture used in `eagle-llm-operator/`:

| Component | Reference (`eagle-llm-operator`) | This Project (`orchestrator-kio1`) |
|-----------|----------------------------------|-------------------------------------|
| System prompt | `sys_pr_drone_state_ver3.txt` | `kio1_ver1.txt` |
| Prompt template | `prompt.json` | `prompt.json` |
| Eval script | `mission_eval.js` | `workflow_eval.js` |
| Dataset | `drone_state_ver4.yaml` | `ver1.yaml` |
| Config | `promptfooconfig.yaml` | `promptfooconfig.yaml` |

---

## Scoring Logic

The evaluation script (`workflow_eval.js`) computes a score between 0.0 and 1.0 by starting at 1.0 and applying weighted penalties for each violation:

| Check | Max Penalty | Description |
|-------|-------------|-------------|
| JSON Schema Validity | Critical | `workflow_id`, `execution_mode`, `steps[]` must be present and valid. Failure = score 0. |
| Output Hygiene | 0.10 | Penalizes unexpected top-level keys and a missing `explanation` (prompt requires exactly 4 keys). |
| Agent Validity | 0.30 | All agents must be KIO2–KIO13. KIO1 and unknown agents are penalized (0.15 each). |
| Required Agent Selection | 0.40 | Must include all `must_include_agents` (0.20 each missing). |
| Agent-set Recall | 0.15 | Penalizes under-selection: expected agents (beyond `must_include`) that are absent (0.05 each). |
| Agent-set Precision | 0.21 | Penalizes over-selection: agents used that are **not** in `expected_agents` (0.07 each). |
| Forbidden Agent Detection | 0.30 | Must not include `must_not_include_agents` (0.15 each). |
| Domain Requirement Flags | 0.30 | `requires_compliance` ⇒ KIO9 present; `requires_security` ⇒ KIO12 present (0.15 each). |
| Capability Validity | 0.15 | Each step's `capability` must be legal for its `agent_id` (0.05 each). |
| Step Ordering | 0.30 | Dependencies enforced, e.g. KIO3 before KIO4, KIO7 before KIO11 (0.10 each). |
| Minimum Steps | 0.10 | Workflow must meet `min_steps` threshold. |
| Step ID Uniqueness | 0.05 | All `step_id` values must be unique. |

**Pass threshold**: score > 0.69

> The scorer measures both **precision** (no over-selection) and **recall** (no
> under-selection) against the full `expected_agents` set, enforces the
> `requires_compliance` / `requires_security` flags, and validates `capability`
> values — so realistic mistakes (extra agents, missing compliance/security
> reviewers, wrong capability labels) now produce failures instead of silent passes.

> **Note on `expected_agents` resolution:** Promptfoo expands any *top-level*
> array var into a test matrix and flattens the per-case value to a string, so
> `vars.expected_agents` is unreliable inside the assertion. The scorer therefore
> resolves the authoritative full agent set from `data/ver1.yaml`, keyed by the
> `id` var (and prefers a nested `expected_workflow_characteristics.expected_agents`
> if present). All other criteria use the reliably-typed nested fields.

### Ordering Rules Enforced

- Requirements (KIO3) → Architecture (KIO4)
- Architecture (KIO4) → Code Generation (KIO7)
- Code Generation (KIO7) → Testing (KIO11)
- Testing (KIO11) → Deployment (KIO8)
- Security (KIO12) → Deployment (KIO8)
- Compliance (KIO9) → Deployment (KIO8)
- Data Generation (KIO5) → Data Validation (KIO6)

---

## Dataset Format

Each test case in `data/ver1.yaml`:

```yaml
- vars:
    id: "med-001"
    domain: "medical"
    request: "Build a clinical decision support system..."
    expected_agents: ["KIO3", "KIO4", "KIO7", "KIO9", "KIO12", "KIO11", "KIO8"]
    expected_workflow_characteristics:
      min_steps: 6
      must_include_agents: ["KIO3", "KIO4", "KIO7", "KIO9", "KIO11"]
      must_not_include_agents: ["KIO1"]
      requires_compliance: true
      requires_security: true
    difficulty: "hard"
```

### Dataset Coverage (90 test cases)

| Domain | Count | IDs |
|--------|-------|-----|
| Medical | 11 | med-001 – med-011 |
| Automotive | 11 | auto-001 – auto-011 |
| Industrial / Manufacturing | 8 | ind-001 – ind-008 |
| Robotics | 8 | rob-001 – rob-008 |
| IoT | 9 | iot-001 – iot-009 |
| General Software Engineering | 21 | gen-001 – gen-021 |
| Edge Cases (single-agent) | 16 | edge-001 – edge-016 |
| Complex Multi-domain | 6 | complex-001 – complex-006 |

### Difficulty Distribution

| Difficulty | Count |
|------------|-------|
| Easy | ~22 |
| Medium | ~30 |
| Hard | ~38 |

---

## Available KIO Agents

| Agent | Responsibility |
|-------|---------------|
| KIO2 | Bug localization, diagnosis, fix recommendation |
| KIO3 | Requirements engineering, user stories, acceptance criteria |
| KIO4 | Software architecture planning, component design |
| KIO5 | Synthetic data generation |
| KIO6 | Data validation, quality analysis |
| KIO7 | Code generation, code understanding |
| KIO8 | Build, deployment, DevOps, packaging |
| KIO9 | Responsible AI, compliance review |
| KIO10 | TinyML, energy-efficiency analysis |
| KIO11 | Test automation, validation |
| KIO12 | Cybersecurity validation |
| KIO13 | Developer training, onboarding |

---

## Target Models

| Provider | Model |
|----------|-------|
| Ollama | `qwen2.5:7b` |
| Ollama | `ministral-3:8b` |

Both configured with `temperature: 0.1` for deterministic outputs.

---

## Execution Instructions

### Prerequisites

- [Promptfoo](https://promptfoo.dev/docs/getting-started) installed
- [Ollama](https://ollama.ai/) running with target models pulled

```bash
# Pull models
ollama pull qwen2.5:7b
ollama pull ministral-3:8b
```

### Run Evaluation

```bash
cd orchestrator-kio1

# Run all tests
promptfoo eval

# View results in browser
promptfoo view
```

### Run with a specific provider

```bash
promptfoo eval --providers ollama:chat:qwen2.5:7b
```

---

## Benchmark Results

---

Date: 26.06.2026

| System Prompt | Test Dataset | Temperature |
|---------------|-------------|-------------|
| `kio1_ver1.txt` | `ver1.yaml` | 0.1 |

| Model Name | Accuracy | Avg Latency (ms) | Avg Tokens |
|------------|----------|-------------------|------------|
| `qwen2.5:7b` | 61.62% passing (305/495 cases) | 4 | 2,594 |
| `ministral-3:8b` | 92.32% passing (457/495 cases) | 4 | 2,836 |

---
