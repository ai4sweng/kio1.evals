// KIO1 Orchestrator Workflow Evaluation Script
// Mirrors the evaluation approach from eagle-llm-operator/mission_eval.js

const fs = require('fs');
const path = require('path');

const VALID_AGENTS = [
  'KIO2', 'KIO3', 'KIO4', 'KIO5', 'KIO6',
  'KIO7', 'KIO8', 'KIO9', 'KIO10', 'KIO11',
  'KIO12', 'KIO13'
];

// Allowed top-level keys in the workflow JSON (per the system prompt spec).
const ALLOWED_TOP_LEVEL_KEYS = ['workflow_id', 'execution_mode', 'steps', 'explanation'];

// Valid capability values per agent (per the system prompt capability table).
const CAPABILITY_MAP = {
  KIO2: ['bug_localization', 'diagnosis', 'fix_recommendation'],
  KIO3: ['requirements_engineering', 'user_stories', 'acceptance_criteria'],
  KIO4: ['architecture_design', 'component_design'],
  KIO5: ['synthetic_data_generation'],
  KIO6: ['data_validation', 'quality_analysis'],
  KIO7: ['code_generation', 'code_understanding'],
  KIO8: ['build', 'deployment', 'devops', 'packaging'],
  KIO9: ['responsible_ai', 'compliance_review'],
  KIO10: ['tinyml', 'energy_efficiency'],
  KIO11: ['test_automation', 'validation'],
  KIO12: ['cybersecurity_validation'],
  KIO13: ['developer_training', 'onboarding'],
};

// Domain-flag enforcement: which agent satisfies a given requirement flag.
const COMPLIANCE_AGENT = 'KIO9';
const SECURITY_AGENT = 'KIO12';

// ---------------------------------------------------------------------------
// Authoritative expected-agents lookup.
//
// promptfoo expands any TOP-LEVEL array var into a test matrix, so by the time
// `vars.expected_agents` reaches this assertion it has been flattened to a
// single string (e.g. "KIO3") and is unusable for set comparison. The clean,
// reliable source of truth is the dataset file itself, keyed by the `id` var
// (a plain string that survives intact). We parse it once and cache it.
//
// This is intentionally dependency-free (no js-yaml): the dataset is machine
// generated with single-line `expected_agents: [...]` arrays, so a small regex
// pass is robust and avoids relying on promptfoo's bundled modules.
// ---------------------------------------------------------------------------
let _expectedAgentsCache = null;

function loadExpectedAgentsById() {
  if (_expectedAgentsCache) return _expectedAgentsCache;
  const map = {};
  try {
    const file = path.join(__dirname, 'data', 'ver1.yaml');
    const text = fs.readFileSync(file, 'utf8');
    // Split into per-test blocks on the "- vars:" delimiter.
    const blocks = text.split(/^-\s+vars:/m);
    for (const block of blocks) {
      const idMatch = block.match(/\bid:\s*["']([^"']+)["']/);
      const agentsMatch = block.match(/expected_agents:\s*\[([^\]]*)\]/);
      if (idMatch && agentsMatch) {
        const agents = agentsMatch[1]
          .split(',')
          .map(s => s.replace(/["'\s]/g, ''))
          .filter(Boolean);
        map[idMatch[1]] = agents;
      }
    }
  } catch (e) {
    // If the dataset can't be read, fall back to an empty map; the precision/
    // recall checks simply become no-ops rather than crashing the run.
  }
  _expectedAgentsCache = map;
  return map;
}

/**
 * Resolve the full expected-agents array for a test case.
 * Order of preference:
 *   1. A properly-typed array (in case promptfoo ever preserves it).
 *   2. The nested expected_workflow_characteristics.expected_agents (if added).
 *   3. The dataset file, looked up by vars.id.
 * Always returns an array (possibly empty).
 */
function resolveExpectedAgents(vars, characteristics) {
  if (Array.isArray(vars.expected_agents)) return vars.expected_agents;
  if (Array.isArray(characteristics.expected_agents)) return characteristics.expected_agents;
  if (vars.id) {
    const fromFile = loadExpectedAgentsById()[vars.id];
    if (Array.isArray(fromFile)) return fromFile;
  }
  return [];
}

const ORDERING_RULES = [
  { before: 'KIO3', after: 'KIO4', label: 'Requirements before Architecture' },
  { before: 'KIO4', after: 'KIO7', label: 'Architecture before Code Generation' },
  { before: 'KIO7', after: 'KIO11', label: 'Code Generation before Testing' },
  { before: 'KIO11', after: 'KIO8', label: 'Testing before Deployment' },
  { before: 'KIO12', after: 'KIO8', label: 'Security before Deployment' },
  { before: 'KIO9', after: 'KIO8', label: 'Compliance before Deployment' },
  { before: 'KIO5', after: 'KIO6', label: 'Data Generation before Data Validation' },
];

/**
 * Check JSON schema validity of the workflow output
 */
function checkSchema(workflow) {
  const errors = [];

  if (!workflow.workflow_id || typeof workflow.workflow_id !== 'string') {
    errors.push('Missing or invalid workflow_id');
  }

  if (!workflow.execution_mode || !['sequential', 'parallel', 'mixed'].includes(workflow.execution_mode)) {
    errors.push(`Invalid execution_mode: "${workflow.execution_mode}". Must be sequential, parallel, or mixed`);
  }

  if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
    errors.push('Missing or empty steps array');
  } else {
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      if (!step.step_id) errors.push(`Step ${i}: missing step_id`);
      if (!step.agent_id) errors.push(`Step ${i}: missing agent_id`);
      if (!step.capability) errors.push(`Step ${i}: missing capability`);
      if (!step.task || typeof step.task !== 'string') errors.push(`Step ${i}: missing or invalid task`);
    }
  }

  return errors;
}

/**
 * Check that no invalid agents are used (e.g., KIO1 or non-existent agents)
 */
function checkAgentValidity(steps) {
  const errors = [];
  for (let i = 0; i < steps.length; i++) {
    const agentId = steps[i].agent_id;
    if (agentId === 'KIO1') {
      errors.push(`Step ${i}: KIO1 (orchestrator) must not appear in workflow steps`);
    } else if (!VALID_AGENTS.includes(agentId)) {
      errors.push(`Step ${i}: Invalid agent "${agentId}"`);
    }
  }
  return errors;
}

/**
 * Check that required agents are present in the workflow
 */
function checkRequiredAgents(steps, mustInclude) {
  const errors = [];
  const usedAgents = new Set(steps.map(s => s.agent_id));

  for (const agent of mustInclude) {
    if (!usedAgents.has(agent)) {
      errors.push(`Missing required agent: ${agent}`);
    }
  }

  return errors;
}

/**
 * Check that forbidden agents are NOT present in the workflow
 */
function checkForbiddenAgents(steps, mustNotInclude) {
  const errors = [];
  const usedAgents = new Set(steps.map(s => s.agent_id));

  for (const agent of mustNotInclude) {
    if (usedAgents.has(agent)) {
      errors.push(`Forbidden agent present: ${agent}`);
    }
  }

  return errors;
}

/**
 * Check step ordering follows dependency rules
 */
function checkOrdering(steps) {
  const errors = [];
  const agentPositions = {};

  for (let i = 0; i < steps.length; i++) {
    const agentId = steps[i].agent_id;
    // Record first occurrence
    if (agentPositions[agentId] === undefined) {
      agentPositions[agentId] = i;
    }
  }

  for (const rule of ORDERING_RULES) {
    const beforePos = agentPositions[rule.before];
    const afterPos = agentPositions[rule.after];

    // Only check if both agents are present
    if (beforePos !== undefined && afterPos !== undefined) {
      if (beforePos >= afterPos) {
        errors.push(`Ordering violation: ${rule.label} (${rule.before} at step ${beforePos}, ${rule.after} at step ${afterPos})`);
      }
    }
  }

  return errors;
}

/**
 * Check minimum step count
 */
function checkMinSteps(steps, minSteps) {
  if (steps.length < minSteps) {
    return [`Insufficient steps: expected at least ${minSteps}, got ${steps.length}`];
  }
  return [];
}

/**
 * Check that step_ids are unique and sequential
 */
function checkStepIds(steps) {
  const errors = [];
  const ids = new Set();

  for (let i = 0; i < steps.length; i++) {
    if (ids.has(steps[i].step_id)) {
      errors.push(`Duplicate step_id: ${steps[i].step_id}`);
    }
    ids.add(steps[i].step_id);
  }

  return errors;
}

/**
 * Score agent selection against the full expected_agents set using
 * precision (no over-selection) and recall (no under-selection).
 * Returns { missing, extra } agent lists.
 */
function checkAgentSet(steps, expectedAgents) {
  const used = new Set(steps.map(s => s.agent_id));
  const expected = new Set(expectedAgents);

  const missing = [...expected].filter(a => !used.has(a));
  // Extra = used agents that are valid (KIO2-KIO13) but not in the expected set.
  // Invalid agents / KIO1 are handled separately by checkAgentValidity.
  const extra = [...used].filter(
    a => VALID_AGENTS.includes(a) && !expected.has(a)
  );

  return { missing, extra };
}

/**
 * Enforce domain requirement flags: requires_compliance -> KIO9,
 * requires_security -> KIO12.
 */
function checkDomainFlags(steps, characteristics) {
  const errors = [];
  const used = new Set(steps.map(s => s.agent_id));

  if (characteristics.requires_compliance && !used.has(COMPLIANCE_AGENT)) {
    errors.push(`Compliance required but ${COMPLIANCE_AGENT} (compliance review) is missing`);
  }
  if (characteristics.requires_security && !used.has(SECURITY_AGENT)) {
    errors.push(`Security required but ${SECURITY_AGENT} (cybersecurity validation) is missing`);
  }

  return errors;
}

/**
 * Validate that each step's capability is a legal value for its agent.
 */
function checkCapabilities(steps) {
  const errors = [];
  for (let i = 0; i < steps.length; i++) {
    const { agent_id, capability } = steps[i];
    const allowed = CAPABILITY_MAP[agent_id];
    // Unknown agents are reported by checkAgentValidity; skip here.
    if (!allowed) continue;
    if (!allowed.includes(capability)) {
      errors.push(`Step ${i}: invalid capability "${capability}" for ${agent_id}`);
    }
  }
  return errors;
}

/**
 * Check that only the allowed top-level keys are present.
 */
function checkTopLevelKeys(workflow) {
  return Object.keys(workflow).filter(k => !ALLOWED_TOP_LEVEL_KEYS.includes(k));
}

/**
 * Main evaluation function
 */
module.exports = (output, context) => {
  const vars = (context && context.vars) || {};

  // Parse the LLM output
  let workflow;
  try {
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    workflow = JSON.parse(jsonMatch ? jsonMatch[0] : output);
  } catch (e) {
    return { pass: false, score: 0, reason: 'Output is not valid JSON' };
  }

  // Guard the entire scoring body so a single unexpected input can never throw
  // (a flood of thrown assertions is what previously crashed the logger).
  try {
    return scoreWorkflow(workflow, vars);
  } catch (e) {
    return {
      pass: false,
      score: 0,
      reason: `Evaluator error: ${e && e.message ? e.message : String(e)}`
    };
  }
};

/**
 * Core scoring logic. Returns { pass, score, reason }.
 */
function scoreWorkflow(workflow, vars) {
  let score = 1.0;
  const allReasons = [];

  // --- CHECK 1: JSON Schema Validity (CRITICAL) ---
  const schemaErrors = checkSchema(workflow);
  if (schemaErrors.length > 0) {
    // Schema failure is critical
    return {
      pass: false,
      score: 0,
      reason: `Schema validation failed: ${schemaErrors.join('; ')}`
    };
  }

  const steps = workflow.steps;
  const characteristics = vars.expected_workflow_characteristics || {};
  // NOTE: vars.expected_agents is unreliable (promptfoo flattens top-level
  // array vars). Always resolve via the dataset file keyed by vars.id.
  const expectedAgents = resolveExpectedAgents(vars, characteristics);

  // --- CHECK 1b: Output hygiene (soft) ---
  // The prompt requires exactly { workflow_id, execution_mode, steps, explanation }.
  const extraKeys = checkTopLevelKeys(workflow);
  if (extraKeys.length > 0) {
    score -= 0.05;
    allReasons.push(`Unexpected top-level keys: ${extraKeys.join(', ')}`);
  }
  if (!workflow.explanation || typeof workflow.explanation !== 'string') {
    score -= 0.05;
    allReasons.push('Missing or invalid explanation');
  }

  // --- CHECK 2: Agent Validity (invalid agents / KIO1) ---
  const validityErrors = checkAgentValidity(steps);
  if (validityErrors.length > 0) {
    const penalty = Math.min(0.30, validityErrors.length * 0.15);
    score -= penalty;
    allReasons.push(...validityErrors);
  }

  // --- CHECK 3: Required Agent Selection (must_include, heavy) ---
  const mustInclude = characteristics.must_include_agents || expectedAgents;
  if (mustInclude.length > 0) {
    const requiredErrors = checkRequiredAgents(steps, mustInclude);
    if (requiredErrors.length > 0) {
      const penalty = Math.min(0.40, requiredErrors.length * 0.20);
      score -= penalty;
      allReasons.push(...requiredErrors);
    }
  }

  // --- CHECK 4: Agent-set Precision & Recall (full expected_agents) ---
  if (expectedAgents.length > 0) {
    const { missing, extra } = checkAgentSet(steps, expectedAgents);
    // Recall: expected agents that were not selected (beyond must_include,
    // which is already penalized above — keep these lighter to avoid double-counting).
    const recallMissing = missing.filter(a => !mustInclude.includes(a));
    if (recallMissing.length > 0) {
      const penalty = Math.min(0.15, recallMissing.length * 0.05);
      score -= penalty;
      allReasons.push(`Under-selection (missing expected agents): ${recallMissing.join(', ')}`);
    }
    // Precision: over-selection of agents not in the expected set.
    if (extra.length > 0) {
      const penalty = Math.min(0.21, extra.length * 0.07);
      score -= penalty;
      allReasons.push(`Over-selection (unexpected agents): ${extra.join(', ')}`);
    }
  }

  // --- CHECK 5: Forbidden Agent Detection (must_not_include, heavy) ---
  const mustNotInclude = characteristics.must_not_include_agents || [];
  if (mustNotInclude.length > 0) {
    const forbiddenErrors = checkForbiddenAgents(steps, mustNotInclude);
    if (forbiddenErrors.length > 0) {
      const penalty = Math.min(0.30, forbiddenErrors.length * 0.15);
      score -= penalty;
      allReasons.push(...forbiddenErrors);
    }
  }

  // --- CHECK 6: Domain Requirement Flags (compliance / security) ---
  const domainFlagErrors = checkDomainFlags(steps, characteristics);
  if (domainFlagErrors.length > 0) {
    score -= domainFlagErrors.length * 0.15;
    allReasons.push(...domainFlagErrors);
  }

  // --- CHECK 7: Capability Validity (per-agent capability values) ---
  const capabilityErrors = checkCapabilities(steps);
  if (capabilityErrors.length > 0) {
    const penalty = Math.min(0.15, capabilityErrors.length * 0.05);
    score -= penalty;
    allReasons.push(...capabilityErrors);
  }

  // --- CHECK 8: Step Ordering (dependency rules, heavy) ---
  const orderingErrors = checkOrdering(steps);
  if (orderingErrors.length > 0) {
    const penalty = Math.min(0.30, orderingErrors.length * 0.10);
    score -= penalty;
    allReasons.push(...orderingErrors);
  }

  // --- CHECK 9: Minimum Steps ---
  const minSteps = characteristics.min_steps || 1;
  const minStepErrors = checkMinSteps(steps, minSteps);
  if (minStepErrors.length > 0) {
    score -= 0.10;
    allReasons.push(...minStepErrors);
  }

  // --- CHECK 10: Step ID Uniqueness ---
  const stepIdErrors = checkStepIds(steps);
  if (stepIdErrors.length > 0) {
    score -= 0.05;
    allReasons.push(...stepIdErrors);
  }

  // Clamp score
  score = Math.max(0, Math.min(1, score));

  return {
    pass: score > 0.69,
    score: score,
    reason: allReasons.length > 0 ? allReasons.join('; ') : 'Perfect workflow'
  };
}
