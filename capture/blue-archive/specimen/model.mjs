// All simulation quantities come from game-config.json; this model is a proposal.
export function unpack(value) {
  if (Array.isArray(value)) return value.map(unpack);
  if (value && typeof value === 'object') {
    if ('value' in value && 'unit' in value) return value.value;
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,unpack(v)]));
  }
  return value;
}
export function makeCafe(c) {return {time:0,placed:[],stock:Object.fromEntries(c.furniture.map(f=>[f.id,f.stock])),gifts:c.cafe.initialGifts,bank:c.cafe.initialBank,wallet:0,relationships:Object.fromEntries(c.visitors.map(v=>[v.id,0])),lastTap:Object.fromEntries(c.visitors.map(v=>[v.id,-Infinity]))};}
export function comfort(s,c) {return Math.min(c.cafe.comfortCap,s.placed.reduce((n,p)=>n+c.furniture.find(f=>f.id===p.id).comfort,0));}
export function place(s,c,id,x,z,rotated=false) {
  const f=c.furniture.find(f=>f.id===id); if(!f)return 'Unknown item';
  const w=rotated?f.depth:f.width,d=rotated?f.width:f.depth;
  if(!Number.isInteger(x)||!Number.isInteger(z)||x<0||z<0||x+w>c.cafe.gridSize||z+d>c.cafe.gridSize)return 'Outside room bounds';
  if(!s.stock[id])return 'No inventory remaining';
  if(s.placed.some(p=>x<p.x+p.w&&x+w>p.x&&z<p.z+p.d&&z+d>p.z))return 'Furniture overlaps';
  s.placed.push({id,x,z,w,d,rotated});s.stock[id]--;return null;
}
export function storeAll(s,c) {s.placed=[];s.stock=Object.fromEntries(c.furniture.map(f=>[f.id,f.stock]));}
export function tickCafe(s,c,dt) {s.time+=dt;s.bank=Math.min(c.cafe.storage,s.bank+(c.cafe.baseRate+comfort(s,c)*c.cafe.comfortRate)*dt);}
export function claim(s) {const n=Math.floor(s.bank);s.bank-=n;s.wallet+=n;return n;}
export function interact(s,c,id,gift=false) {
  const v=c.visitors.find(v=>v.id===id);if(!v)return 'Unknown visitor';
  if(gift){if(s.gifts<1)return 'No gifts remaining';s.gifts--;s.relationships[id]+=v.favorite?c.cafe.favoriteGiftReward:c.cafe.giftReward;return null;}
  if(s.time-s.lastTap[id]<c.cafe.tapCooldown)return 'Visitor tap is cooling down';
  s.lastTap[id]=s.time;s.relationships[id]+=c.cafe.tapReward;return null;
}
export function makeBattle(c) {return {time:0,cost:c.battle.initialCost,hp:c.battle.teamHp,enemyHp:c.waves[0].hp,wave:0,nextTeam:c.battle.teamInterval,nextEnemy:c.battle.enemyInterval,shieldUntil:0,status:'running',auto:false,paused:false};}
export function resolveBattle(s,c) {
  if(s.hp<=0){s.hp=0;s.status='defeat';return;}
  if(s.enemyHp<=0){s.wave++;if(s.wave===c.waves.length){s.status='victory';s.enemyHp=0;return;}s.enemyHp=c.waves[s.wave].hp;}
  if(s.time>=c.battle.timer)s.status='defeat';
}
export function useSkill(s,c,id,target) {
  const skill=c.skills.find(k=>k.id===id);
  if(!skill||s.status!=='running'||s.paused)return 'Battle is not accepting commands';
  if(skill.target!==target)return 'Choose the indicated target';
  if(s.cost<skill.cost)return 'Insufficient cost';
  s.cost-=skill.cost;
  if(id==='burst')s.enemyHp-=skill.amount;
  if(id==='heal')s.hp=Math.min(c.battle.teamHp,s.hp+skill.amount);
  if(id==='shield')s.shieldUntil=s.time+c.battle.shieldSeconds;
  resolveBattle(s,c);return null;
}
export function tickBattle(s,c,dt) {
  if(s.paused||s.status!=='running')return;
  s.time=Math.min(c.battle.timer,s.time+dt);s.cost=Math.min(c.battle.costCap,s.cost+c.battle.costRate*dt);
  if(s.time>=s.nextTeam){s.enemyHp-=c.battle.teamDamage;s.nextTeam+=c.battle.teamInterval;}
  if(s.time>=s.nextEnemy){s.hp-=c.waves[s.wave].damage*(s.time<s.shieldUntil?c.battle.shieldMultiplier:1);s.nextEnemy+=c.battle.enemyInterval;}
  resolveBattle(s,c);
  if(s.auto&&s.status==='running')useSkill(s,c,s.hp<c.battle.teamHp*c.battle.autoHealThreshold?'heal':'burst',s.hp<c.battle.teamHp*c.battle.autoHealThreshold?'team':'enemy');
}
