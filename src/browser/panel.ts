import { proposedChanges } from '../shared/schema.js';
import type { State } from './controller.js';
export interface PanelActions {check:()=>void;fix:()=>void;proceed:()=>void;cancel:()=>void}
const label:Record<string,string>={disconnected:'Connect to begin',ready:'Ready to review',checking:'Reviewing entry',allow:'Ready to post',warn:'Review recommended',block:'Posting paused',fixing:'Applying correction',fixed:'Correction verified',stale:'Entry changed',error:'Check unavailable'};
function node<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,cls?:string) {const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;}
export function renderPanel(container:HTMLElement,state:State,actions:PanelActions) {
  container.replaceChildren();container.dataset.phase=state.phase;
  const status=node('div',undefined,`status-card ${state.phase}`);
  status.append(node('span',state.phase==='block'?'!':state.phase==='fixed'||state.phase==='allow'?'✓':'◌','status-icon'),
    node('p',label[state.phase],'status-title'),node('p',state.message,'status-message'));
  status.setAttribute('role','status');container.append(status);
  const verdict=state.result?.verdict;
  if(verdict){
    for(const issue of verdict.issues){const card=node('article',undefined,'issue-card');card.append(node('span',issue.code.replaceAll('_',' '),'eyebrow'),node('p',issue.message));container.append(card);}
    const changes=proposedChanges(verdict);
    if(changes.length){const section=node('section',undefined,'changes');section.append(node('h3','Proposed changes'));
      for(const change of changes){const row=node('div',undefined,'change-row');row.append(node('span',`${change.lineId?change.lineId+' · ':''}${change.field}`),node('del',change.from),node('strong',change.to));section.append(row);}container.append(section);}
    if(verdict.manualAction)container.append(node('p',verdict.manualAction,'manual-action'));
    const refs=[...new Set([...verdict.evidenceIds,...verdict.issues.flatMap(i=>i.evidenceIds)])];
    if(refs.length){const section=node('section',undefined,'evidence');section.append(node('h3','Supporting evidence'));
      for(const id of refs){const record=state.pack?.evidence.find(e=>e.id===id);const detail=node('details');detail.append(node('summary',id),node('p',record?.text??(id==='ENTRY-BALANCE'?'Computed from the current journal debit and credit totals.':'Evidence unavailable')));section.append(detail);}container.append(section);}
  }
  const buttons=node('div',undefined,'panel-actions');
  const button=(text:string,callback:()=>void,cls='button secondary')=>{const b=node('button',text,cls);b.type='button';b.onclick=callback;buttons.append(b);};
  if(['checking','fixing'].includes(state.phase))button('Stop',actions.cancel);
  else {
    if(verdict&&proposedChanges(verdict).length)button('Apply proposed changes',actions.fix,'button primary');
    if(state.canContinue)button(state.phase==='error'?'Continue without check':'Continue with warning',actions.proceed);
    if(state.pack)button(state.phase==='error'?'Retry check':'Check and save',actions.check,'button secondary');
  }
  container.append(buttons);
  if(state.result)container.append(node('p',`${state.result.meta.mode==='demo'?'Rules demo · no AI call':state.result.meta.model} · ${state.result.meta.ms} ms`,'run-meta'));
}
