// Execute only the reviewed calculation section of the supplied HTML in a VM.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const html=readFileSync(new URL('reference/george-assessment.html',root),'utf8');
const code=html.slice(html.indexOf('const INTERCEPT ='),html.indexOf('// DATA RECORDS'));
const context=vm.createContext({document:{getElementById:()=>({addEventListener(){},value:''})}});
vm.runInContext(code,context,{timeout:1000});
const cases=JSON.parse(readFileSync(new URL('tests/parity-inputs.json',root),'utf8'));
const results=cases.map(input=>{context.input=input;return vm.runInContext(`(()=>{const raw={...input.values,business_age_months:monthsBetween(new Date(input.values.commencement_date+'T00:00:00Z'),new Date(input.asOfDate+'T00:00:00Z'))};const model={...raw};for(const key of ['active_day_ratio','exception_rate','critical_unresolved_ratio','retry_success_rate','existing_debt_to_sales'])if(model[key]!=null)model[key]/=100;delete model.merchant_type;delete model.commencement_date;const risk=computeScore(model,raw.merchant_type);return {financial:financialProfileScore(raw).score,confidence:profileConfidence(input.values),risk,grade:gradeOf(risk.score).label};})()`,context,{timeout:1000});});
writeFileSync(new URL('tests/html-expected.json',root),JSON.stringify(results,null,2)+'\n');
console.log(`Generated ${results.length} reference cases from George's HTML.`);
