const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:name=>{if(name==='server-only')return {};throw Error(name);}});
  return exports;
}
const tax = load('src/lib/sales-tax.ts');
const {ensureSalesTaxRate} = load('src/lib/stripe-sales-tax.ts');
test('8.25% tax rounds to cents and keeps the food minimum separate', () => {
  assert.equal(tax.salesTaxCents(30000),2475);
  assert.equal(tax.salesTaxCents(31000),2558);
  assert.equal(tax.orderTaxCents([10500,5000,1000]),1362);
  assert.equal(tax.orderTaxCents([10500,1000]),949);
  for(const invalid of [-1,NaN,Infinity,1.5])assert.throws(()=>tax.salesTaxCents(invalid));
});
test('Stripe reuses the correct exclusive rate and keeps inclusive adjustment rates separate', async () => {
  const rates = [
    {id:'wrong',percentage:8.25,inclusive:false,country:'US',state:'SC'},
    {id:'inclusive',percentage:8.25,inclusive:true,country:'US',state:'NC'},
    {id:'exclusive',percentage:8.25,inclusive:false,country:'US',state:'NC'},
  ];
  const stripe = {taxRates:{list:()=>rates,create:()=>{throw Error('Unexpected create');}}};
  assert.equal(await ensureSalesTaxRate(stripe),'exclusive');
  assert.equal(await ensureSalesTaxRate(stripe,true),'inclusive');
});
test('Stripe rate creation is idempotent and adds tax on top of prices', async () => {
  let request, options;
  const stripe = {taxRates:{list:()=>[],create:async(r,o)=>{request=r;options=o;return {id:'new'};}}};
  assert.equal(await ensureSalesTaxRate(stripe),'new');
  assert.equal(request.percentage,8.25);
  assert.equal(request.inclusive,false);
  assert.match(options.idempotencyKey,/exclusive/);
});
