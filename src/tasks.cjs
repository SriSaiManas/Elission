const {randomUUID} = require('node:crypto');

const actions = {
  search_web:{argument:'query',limit:500},
  inspect_tab:{},
  read_table:{},
  calculate:{argument:'expression',limit:200},
  inspect_project:{}
};

function parsePlan(raw) {
  let plan;
  try { plan = JSON.parse(raw.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/gi,'')); }
  catch { throw Error('The model did not return a valid task plan. Try a more specific request.'); }
  if (!Array.isArray(plan) || plan.length < 1 || plan.length > 5) throw Error('A task must have between one and five steps.');
  return plan.map(step => {
    if (!step || typeof step !== 'object' || !Object.hasOwn(actions,step.action)) throw Error('The plan contains an unsupported action.');
    const {argument,limit} = actions[step.action];
    if (Object.keys(step).some(key => key !== 'action' && key !== argument) ||
      (argument && (typeof step[argument] !== 'string' || !step[argument].trim() || step[argument].length > limit))) {
      throw Error('The plan contains invalid action arguments.');
    }
    return argument ? {action:step.action,[argument]:step[argument].trim()} : {action:step.action};
  });
}

async function runPlan(plan,{signal,handlers,onProgress,checkpoint}) {
  const id = randomUUID();
  const results = [];
  for (const [index,step] of plan.entries()) {
    signal.throwIfAborted();
    const number = index + 1;
    onProgress('Step ' + number + ' of ' + plan.length + ': ' + step.action.replaceAll('_',' '));
    checkpoint(id,number,step.action,'running');
    try {
      const timeout = AbortSignal.timeout(90000);
      const output = await handlers[step.action](step,AbortSignal.any([signal,timeout]));
      signal.throwIfAborted();
      results.push({action:step.action,output});
      checkpoint(id,number,step.action,'completed');
    } catch (error) {
      checkpoint(id,number,step.action,signal.aborted ? 'cancelled' : 'blocked');
      signal.throwIfAborted();
      return {results,blocker:error.message};
    }
  }
  return {results};
}

module.exports = {parsePlan, runPlan};
