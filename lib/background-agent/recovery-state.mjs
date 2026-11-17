/** @param {number} stateVersion @param {number} latestMessageSequence */
export function nextBackgroundAgentSequence(stateVersion,latestMessageSequence) {
  const next=Math.max(stateVersion,latestMessageSequence)+1;
  if(!Number.isSafeInteger(next))throw new Error('Background Agent sequence is exhausted.');
  return next;
}

/** @param {import('./state-store.mjs').BackgroundAgentRow} stored @param {number} latestMessageSequence
 * @returns {import('./state-store.mjs').BackgroundAgentRow} */
export function recoverEndedBackgroundAgent(stored,latestMessageSequence) {
  const stateVersion=nextBackgroundAgentSequence(stored.stateVersion,latestMessageSequence);
  return {...stored,state:'exited',taskState:stored.providerWork?.paused===true?'working':'unknown',stateVersion};
}

/** The Effect Log `agent-task` fields shared by every recovery path; times are milliseconds or `null`.
 * @param {{runId:string,role:string,settings:Record<string,unknown>}} agent @param {string} provider @param {number|null} startedAtMs @param {number|null} finishedAtMs @param {string} outcome */
export function agentTaskFields(agent,provider,startedAtMs,finishedAtMs,outcome) {
  return {runId:agent.runId,role:agent.role,provider,model:agent.settings.model,effort:agent.settings.reasoningEffort,
    startedAt:startedAtMs===null ? null : Math.floor(startedAtMs/1000),finishedAt:finishedAtMs===null ? null : Math.floor(finishedAtMs/1000),outcome};
}
