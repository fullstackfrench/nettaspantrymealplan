const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const enabled=process.env.RUN_MENU_ANNOUNCEMENT_DATABASE_TESTS==='true';
test('concurrent database reservations claim one announcement per week',{skip:!enabled},async()=>{
 const db=process.env.MENU_ANNOUNCEMENT_TEST_DATABASE;
 assert.match(db||'',/^netta_announcement_test\d+$/);
 const args=['-h','/private/tmp','-p','55443','-d',db,'-v','ON_ERROR_STOP=1','-At'];
 const menu='20000000-0000-4000-8000-000000000003';
 const reservation=`select reserve_menu_announcement('10000000-0000-4000-8000-000000000001','${menu}',menu_announcement_snapshot('${menu}'),repeat('a',64),'50000000-0000-4000-8000-000000000001',repeat('b',64),7,'Subject','HTML','Text');`;
 function run(sql,onData){const p=spawn('psql',args);let output='',error='';p.stdout.on('data',c=>{output+=c;onData?.(output)});p.stderr.on('data',c=>error+=c);p.stdin.end(sql);return new Promise((resolve,reject)=>p.on('close',code=>code===0?resolve(output):reject(Error(error))));}
 let unlock;const reserved=new Promise(r=>unlock=r);
 const first=run('begin;'+reservation+'select pg_sleep(0.5);commit;',out=>{if(out.includes('"claimed": true'))unlock()});
 await Promise.race([reserved,new Promise((_,reject)=>setTimeout(()=>reject(Error('Reservation timed out')),5000))]);
 const second=run(reservation);
 const results=await Promise.all([first,second]);
 assert(results[0].includes('"claimed": true'));
 assert(results[1].includes('"claimed": false'));
 assert.equal((await run(`select count(*) from menu_announcements where menu_id='${menu}';`)).trim(),'1');
});
