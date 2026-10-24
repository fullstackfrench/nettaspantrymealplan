const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,imports,globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{if(!(name in imports))throw new Error(name);return imports[name]},...globals});return exports;}
test('fresh server reads bypass cached responses while preserving request headers',async()=>{
 let options,request;
 const server=load('src/lib/supabase/server.ts',{'@supabase/supabase-js':{createClient:(_url,_key,opts)=>{options=opts;return {}}},'@supabase/ssr':{},'next/headers':{}},{process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://project.example.test',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-key'}},fetch:async(url,init)=>{request={url,init};return {}}});
 server.createServerClient('no-store');
 await options.global.fetch('https://project.example.test/rest/v1/holiday_settings',{headers:{apikey:'public-key'},cache:'force-cache'});
 assert.equal(request.init.cache,'no-store');assert.equal(request.init.headers.apikey,'public-key');
 server.createServerClient();assert.equal(options.global,undefined);
});
function settingsHarness(){let row={version:1,minimum_people:15,extra_dessert_cents:500},error=null;const modes=[];
 const query={select(){return query},eq(){return query},maybeSingle:async()=>({data:row,error})};
 const module=load('src/lib/holiday-settings.ts',{'server-only':{},'@/lib/supabase/server':{createServerClient:mode=>{modes.push(mode);return {from:()=>query}}},'./holiday-menu':{HOLIDAY_DRAFT_SETTINGS:{orders_open:false}}});
 return {module,modes,setRow:value=>row=value,setError:value=>error=value};}
test('holiday settings reflect updated prices and availability on subsequent reads',async()=>{
 const h=settingsHarness();assert.equal((await h.module.getHolidaySettings()).settings.minimum_people,15);
 h.setRow({version:2,minimum_people:18,extra_dessert_cents:4500,orders_open:false});
 const current=await h.module.getHolidaySettings();assert.equal(current.settings.minimum_people,18);assert.equal(current.settings.extra_dessert_cents,4500);assert.equal(current.installed,true);assert.ok(h.modes.every(mode=>mode==='no-store'));
});
test('missing holiday tables leave ordering closed, while unexpected errors are surfaced',async()=>{
 const h=settingsHarness();h.setRow(null);h.setError({code:'PGRST205'});const r=await h.module.getHolidaySettings();assert.equal(r.installed,false);assert.equal(r.settings.orders_open,false);
 h.setError({code:'unexpected'});await assert.rejects(h.module.getHolidaySettings(),/pricing could not be loaded/);
});
