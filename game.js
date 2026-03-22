var _raf=requestAnimationFrame,_ca// ═══════════════════════════════════════════════════════

function _showRetiredToast(name){
  var t=document.createElement('div');
  t.style.cssText='position:fixed;top:80px;left:50%;transform:translateX(-50%);background:rgba(40,30,60,0.97);border:1.5px solid rgba(160,140,200,0.4);color:#c8b8f0;font-size:12px;font-weight:900;padding:8px 18px;border-radius:10px;z-index:9999999;white-space:nowrap;font-family:Nunito,sans-serif;pointer-events:none;';
  t.textContent='⚰️ '+name+' has been retired — check The Game Graveyard';
  document.body.appendChild(t);setTimeout(function(){t.remove();},3000);
}
// GAMEPAD SUPPORT — Universal controller input
// Works with PS4/PS5, Xbox, Switch Pro, generic BT pads
// ═══════════════════════════════════════════════════════
(()=>{
// ── Button indices (Standard Gamepad API layout) ──────
const BTN={
  A:0, B:1, X:2, Y:3,
  LB:4, RB:5, LT:6, RT:7,
  SELECT:8, START:9,
  L3:10, R3:11,
  UP:12, DOWN:13, LEFT:14, RIGHT:15,
  HOME:16,
};
// Aliases by brand
// PS:    Cross=A, Circle=B, Square=X, Triangle=Y, Options=START, Share=SELECT
// Xbox:  A=A, B=B, X=X, Y=Y, Menu=START, View=SELECT
// Switch: A=A(right), B=B(bottom), X=X(top), Y=Y(left), +=START, -=SELECT

const REPEAT_DELAY=400, REPEAT_RATE=120;

let pads={};
let _menuCursor=0;
let _menuItems=[];
let _connected=false;
let _hintEl=null;
let _toastEl=null;
let _btnState={}; // track held buttons for repeat
let _lastRepeat={};
let _rafId=null;

// ── Toast ─────────────────────────────────────────────
function showToast(msg){
  if(_toastEl)_toastEl.remove();
  _toastEl=document.createElement('div');
  _toastEl.style.cssText='position:fixed;top:60px;left:50%;transform:translateX(-50%);background:rgba(14,15,28,0.97);border:1.5px solid rgba(100,160,255,0.4);color:#a0c8ff;font-size:12px;font-weight:900;padding:7px 18px;border-radius:10px;z-index:2000000;white-space:nowrap;font-family:Nunito,sans-serif;pointer-events:none;transition:opacity .4s;';
  _toastEl.textContent=msg;
  document.body.appendChild(_toastEl);
  setTimeout(()=>{if(_toastEl){_toastEl.style.opacity='0';setTimeout(()=>{if(_toastEl)_toastEl.remove();_toastEl=null;},400);}},2500);
}

// ── On-screen hint ────────────────────────────────────
function showHint(){
  if(_hintEl)return;
  _hintEl=document.createElement('div');
  _hintEl.id='gp-hint';
  _hintEl.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(14,15,28,0.95);border:1px solid rgba(100,160,255,0.25);border-radius:12px;padding:8px 16px;font-size:10px;font-weight:900;color:rgba(140,180,255,0.7);z-index:1999999;display:flex;gap:14px;align-items:center;font-family:Nunito,sans-serif;pointer-events:none;white-space:nowrap;';
  _hintEl.innerHTML='<span>🕹 D-pad: navigate</span><span>🔵 A/Cross: select</span><span>🔴 B/Circle: back</span><span>▶ Start: pause</span>';
  document.body.appendChild(_hintEl);
}
function hideHint(){
  if(_hintEl){_hintEl.remove();_hintEl=null;}
}
function updateHintForGame(game){
  if(!_hintEl)return;
  const maps={
    leap:'<span>🕹 D-pad: move</span><span>🔵 A: hop forward</span><span>▶ Start: menu</span>',
    miner:'<span>🕹 D-pad: move</span><span>🔵 A: dig/move</span><span>🔴 B: surface</span><span>▶ Start: menu</span>',
    survival:'<span>🕹 D-pad: scroll</span><span>🔵 A: place/select</span><span>🔴 B: cancel</span><span>🟡 Y: destroy</span><span>▶ Start: menu</span>',
    clicker:'<span>🔵 A: click duck</span><span>🕹 D-pad: shop</span><span>▶ Start: menu</span>',
    dash:'<span>🔵 A: jump</span><span>▶ Start: pause</span>',
    menu:'<span>🕹 D-pad: navigate</span><span>🔵 A: play</span><span>▶ Start: select</span>',
  };
  _hintEl.innerHTML=maps[game]||maps.menu;
}

// ── Build menu item list ───────────────────────────────
function buildMenuItems(){
  _menuItems=[];
  const cards=document.querySelectorAll('.ck-card:not([style*="cursor:default"])');
  cards.forEach(c=>_menuItems.push(c));
}

function highlightMenuItem(idx){
  _menuItems.forEach((el,i)=>{
    el.style.outline=i===idx?'3px solid rgba(100,160,255,0.8)':'';
    el.style.transform=i===idx?'scale(1.04)':'';
  });
  const el=_menuItems[idx];
  if(el)el.scrollIntoView({block:'nearest',behavior:'smooth'});
}

function activateMenuItem(){
  const el=_menuItems[_menuCursor];
  if(!el)return;
  const btn=el.querySelector('.ck-card-btn');
  if(btn&&!btn.disabled)btn.click();
  else el.click();
}

// ── Button press handler ───────────────────────────────
function onPress(btn){
  const menuOpen=window._menuEl&&window._menuEl.style.display!=='none';

  // ── Menu navigation ───────────────────────────────────
  if(menuOpen){
    buildMenuItems();
    if(btn===BTN.DOWN||btn===BTN.RIGHT){
      _menuCursor=Math.min(_menuCursor+1,_menuItems.length-1);
      highlightMenuItem(_menuCursor);
    } else if(btn===BTN.UP||btn===BTN.LEFT){
      _menuCursor=Math.max(_menuCursor-1,0);
      highlightMenuItem(_menuCursor);
    } else if(btn===BTN.A||btn===BTN.START){
      activateMenuItem();
    }
    return;
  }

  // ── Duck Leap ─────────────────────────────────────────
  if(window._leapActive){
    if(btn===BTN.UP)    simulateKey('ArrowUp');
    if(btn===BTN.DOWN)  simulateKey('ArrowDown');
    if(btn===BTN.LEFT)  simulateKey('ArrowLeft');
    if(btn===BTN.RIGHT) simulateKey('ArrowRight');
    if(btn===BTN.A)     simulateKey('ArrowUp');
    if(btn===BTN.START||btn===BTN.SELECT) window._exitLeap&&window._exitLeap();
    return;
  }

  // ── Duck Miner ────────────────────────────────────────
  if(window._minerActive){
    if(window._minerEl){
      const cvs=window._minerEl.querySelector('#mn-canvas');
      if(cvs&&window._minerDuckPos){
        // Convert D-pad to a canvas tap at duck's adjacent tile
        const {x,y,ts}=window._minerDuckPos;
        let dx=0,dy=0;
        if(btn===BTN.UP)dy=-1;
        else if(btn===BTN.DOWN)dy=1;
        else if(btn===BTN.LEFT)dx=-1;
        else if(btn===BTN.RIGHT)dx=1;
        if(dx||dy){
          const rect=cvs.getBoundingClientRect();
          const tx=rect.left+(x+dx+0.5)*ts;
          const ty=rect.top+(y+dy+0.5)*ts;
          cvs.dispatchEvent(new PointerEvent('pointerdown',{clientX:tx,clientY:ty,bubbles:true}));
        }
      }
    }
    if(btn===BTN.START||btn===BTN.SELECT) window._exitMiner&&window._exitMiner();
    return;
  }

  // ── Duck Survival ─────────────────────────────────────
  if(window._dsEl&&window._dsEl.style.display!=='none'){
    if(btn===BTN.Y){
      // Toggle destroy mode
      const destroyBtn=window._dsEl&&window._dsEl.querySelector('.ds-bld:last-of-type');
      if(destroyBtn)destroyBtn.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    }
    if(btn===BTN.B)window._backToMenu&&window._backToMenu();
    if(btn===BTN.START)window._backToMenu&&window._backToMenu();
    return;
  }

  // ── Duck Clicker ──────────────────────────────────────
  if(window._clickerActive){
    if(btn===BTN.A){
      const duck=document.getElementById('dck-duck');
      if(duck)duck.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    }
    if(btn===BTN.START||btn===BTN.SELECT){
      window._exitClicker&&window._exitClicker();
    }
    return;
  }

  // ── Duck Dash ─────────────────────────────────────────
  if(window._dashActive){
    if(btn===BTN.A||btn===BTN.UP||btn===BTN.B){
      // Dispatch a tap on the canvas
      const cvs=document.querySelector('#dash-canvas,#dc-canvas,[id*="dash"]');
      if(cvs)cvs.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:innerWidth/2,clientY:innerHeight/2}));
    }
    if(btn===BTN.START)window._exitDash&&window._exitDash();
    return;
  }

  // ── Generic back / pause ──────────────────────────────
  if(btn===BTN.START||btn===BTN.SELECT||btn===BTN.B){
    window._backToMenu&&window._backToMenu();
  }
}

function simulateKey(key){
  document.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));
}

// ── Axis to D-pad conversion ──────────────────────────
const AXIS_THRESHOLD=0.5;
let _axisState={};
function checkAxes(pad){
  // Left stick: axes 0 (horiz) and 1 (vert)
  const lx=pad.axes[0]||0, ly=pad.axes[1]||0;
  const rx=pad.axes[2]||0, ry=pad.axes[3]||0;
  const now=performance.now();

  function axisBtn(axisId,pressed,virtualBtn){
    const key=pad.index+'_'+axisId;
    if(pressed&&!_axisState[key]){
      _axisState[key]=now;
      onPress(virtualBtn);
    } else if(pressed&&_axisState[key]){
      const held=now-_axisState[key];
      const lastRep=_lastRepeat[key]||0;
      if(held>REPEAT_DELAY&&now-lastRep>REPEAT_RATE){
        _lastRepeat[key]=now;
        onPress(virtualBtn);
      }
    } else {
      _axisState[key]=0;
      _lastRepeat[key]=0;
    }
  }

  axisBtn('lx_r', lx>AXIS_THRESHOLD,  BTN.RIGHT);
  axisBtn('lx_l', lx<-AXIS_THRESHOLD, BTN.LEFT);
  axisBtn('ly_d', ly>AXIS_THRESHOLD,  BTN.DOWN);
  axisBtn('ly_u', ly<-AXIS_THRESHOLD, BTN.UP);
  axisBtn('rx_r', rx>AXIS_THRESHOLD,  BTN.RIGHT);
  axisBtn('rx_l', rx<-AXIS_THRESHOLD, BTN.LEFT);
  axisBtn('ry_d', ry>AXIS_THRESHOLD,  BTN.DOWN);
  axisBtn('ry_u', ry<-AXIS_THRESHOLD, BTN.UP);
}

// ── Poll loop ─────────────────────────────────────────
function poll(){
  const gamepads=navigator.getGamepads?navigator.getGamepads():[];
  const now=performance.now();

  for(const pad of gamepads){
    if(!pad)continue;
    const prev=pads[pad.index]||{buttons:[],axes:[]};

    // Button press detection with repeat
    pad.buttons.forEach((b,i)=>{
      const wasPressed=prev.buttons[i]?.pressed||false;
      const isPressed=b.pressed;
      const key=pad.index+'_'+i;

      if(isPressed&&!wasPressed){
        // Fresh press
        _btnState[key]=now;
        _lastRepeat[key]=0;
        onPress(i);
      } else if(isPressed&&wasPressed){
        // Held — repeat for directional buttons
        if(i>=12&&i<=15){// D-pad only
          const held=now-(_btnState[key]||now);
          const lastRep=_lastRepeat[key]||0;
          if(held>REPEAT_DELAY&&now-lastRep>REPEAT_RATE){
            _lastRepeat[key]=now;
            onPress(i);
          }
        }
      } else if(!isPressed&&wasPressed){
        _btnState[key]=0;
      }
    });

    checkAxes(pad);
    pads[pad.index]={
      buttons:pad.buttons.map(b=>({pressed:b.pressed,value:b.value})),
      axes:[...pad.axes],
    };
  }
  _rafId=requestAnimationFrame(poll);
}

// ── Connect / disconnect ───────────────────────────────
window.addEventListener('gamepadconnected',e=>{
  _connected=true;
  const pad=e.gamepad;
  pads[pad.index]={buttons:[],axes:[]};
  showToast('🎮 Controller connected! '+pad.id.slice(0,30));
  showHint();
  updateHintForGame('menu');
  if(!_rafId)_rafId=requestAnimationFrame(poll);
});

window.addEventListener('gamepaddisconnected',e=>{
  delete pads[e.gamepad.index];
  if(Object.keys(pads).length===0){
    _connected=false;
    hideHint();
    if(_rafId){cancelAnimationFrame(_rafId);_rafId=null;}
    showToast('🎮 Controller disconnected');
  }
});

// ── Update hint when game changes ─────────────────────
const _origLaunchLeap=window._launchLeap;
window._launchLeap=function(){_origLaunchLeap&&_origLaunchLeap();if(_connected)updateHintForGame('leap');};
const _origLaunchMiner=window._launchMiner;
window._launchMiner=function(){_origLaunchMiner&&_origLaunchMiner();if(_connected)updateHintForGame('miner');};
const _origLaunchSandbox=window._launchSandbox;
window._launchSandbox=function(){_showRetiredToast('Duck Sandbox');};
const _origLaunchClicker=window._launchClicker;
window._launchClicker=function(){_origLaunchClicker&&_origLaunchClicker();if(_connected)updateHintForGame('clicker');};
const _origLaunchDash=window._launchDash;
window._launchDash=function(){_origLaunchDash&&_origLaunchDash();if(_connected)updateHintForGame('dash');};
const _origBackToMenu=window._backToMenu;
window._backToMenu=function(){_origBackToMenu&&_origBackToMenu();if(_connected)updateHintForGame('menu');};

// Expose cursor position for miner
window._gpSetMinerDuck=function(x,y,ts){window._minerDuckPos={x,y,ts};};
})();

f=cancelAnimationFrame,_mf=Math.floor,_mc=Math.ceil,_mn=Math.min,_mx=Math.max,_ms=Math.sqrt,_ma=Math.abs,_mr=Math.random.bind(Math),_pi=Math.PI,_rnd=Math.round,_ce=function(t){return document.createElement(t)},_ba=function(e){return document.body.appendChild(e)},_gi=function(id){return document.getElementById(id)},_qsa=function(sel){return Array.from(document.querySelectorAll(sel))}; document.addEventListener('keydown', function _royaleKeys(e){
if(!_gi('roy-field'))return document.removeEventListener('keydown',_royaleKeys);
if(e.key==='Escape'){if(window._exitRoyale)window._exitRoyale();return;}
const idx=parseInt(e.key)-1;
if(idx>=0&&idx<=6){
const btns=_qsa('.roy-buy-btn:not(.disabled)');
if(btns[idx]){e.preventDefault();btns[idx].dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));}
}
});(()=>{if(window.duckLifeRunning)return;window.duckLifeRunning=true;window.paused=false;window.speed=1;document.body.style.background="radial-gradient(ellipse at 40% 60%, #0e1820 0%, #0a0d18 60%, #080b14 100%)";document.body.style.margin="0";document.body.style.overflow="hidden";let weather='clear',weatherEnd=0,weatherEl=null,rainDrops=[];const WEATHERS={ clear:{emoji:'☀️',label:'Clear',breedMult:1,hatchMult:1,speedMult:1,eggSurvive:1,bg:''}, rain:{emoji:'🌧️',label:'Rain',breedMult:0.6,hatchMult:0.65,speedMult:1.15,eggSurvive:1,bg:'linear-gradient(180deg,rgba(60,90,160,0.22) 0%,rgba(30,50,110,0.12) 100%)'}, storm:{emoji:'⛈️',label:'Storm',breedMult:0.8,hatchMult:0.9,speedMult:1.8,eggSurvive:0.994,bg:'linear-gradient(180deg,rgba(20,20,60,0.45) 0%,rgba(10,10,40,0.28) 100%)'}, drought:{emoji:'☀️🔥',label:'Drought',breedMult:1.7,hatchMult:1.6,speedMult:0.7,eggSurvive:0.997,bg:'linear-gradient(180deg,rgba(200,100,0,0.18) 0%,rgba(160,60,0,0.08) 100%)'}, fog:{emoji:'🌫️',label:'Fog',breedMult:0.9,hatchMult:1.0,speedMult:0.55,eggSurvive:1,bg:'radial-gradient(ellipse at 50% 30%,rgba(200,210,230,0.32) 0%,rgba(180,190,220,0.18) 60%,transparent 100%)'}, heatwave:{emoji:'🥵',label:'Heatwave',breedMult:2.2,hatchMult:2.0,speedMult:0.6,eggSurvive:0.995,bg:'linear-gradient(180deg,rgba(240,80,0,0.18) 0%,rgba(200,40,0,0.08) 100%)'},blizzard:{emoji:'❄️',label:'Blizzard',breedMult:0.3,hatchMult:0.2,speedMult:0.45,eggSurvive:0.985,bg:'linear-gradient(180deg,rgba(180,220,255,0.28) 0%,rgba(140,190,255,0.14) 100%)'},rainbow:{emoji:'🌈',label:'Rainbow',breedMult:2.5,hatchMult:1.8,speedMult:1.1,eggSurvive:1,bg:'linear-gradient(180deg,rgba(255,80,80,0.1),rgba(255,160,40,0.1),rgba(80,220,80,0.1),rgba(40,140,255,0.1),rgba(160,60,255,0.1))'} };function weatherSpeedMult(){return WEATHERS[weather].speedMult}function weatherBreedMult(){return WEATHERS[weather].breedMult*(window._overgrowthActive?5.0:1.0)}function weatherHatchMult(){return WEATHERS[weather].hatchMult}function setWeather(w){ weather=w; let wdata=WEATHERS[w];
if(w==='fog')_unlockAch('foggymorning');
if(w==='heatwave')_unlockAch('feelslikefire');if(w==='blizzard'){_unlockAch('blizzardborn');if(Yetis.length>0)_unlockAch('snowblind');}
if(w==='rainbow'){_unlockAch('overtherainbow');if(window._rainbowArc)window._rainbowArc.remove();let arc=_ce('div');arc.textContent='🌈';arc.style.cssText='position:fixed;top:8%;left:50%;transform:translateX(-50%);font-size:90px;z-index:999993;pointer-events:none;filter:drop-shadow(0 0 24px rgba(255,180,100,0.8));transition:opacity 2s ease;';_ba(arc);window._rainbowArc=arc;}
else{if(window._rainbowArc){window._rainbowArc.style.opacity='0';setTimeout(()=>{if(window._rainbowArc){window._rainbowArc.remove();window._rainbowArc=null;}},2000);}}
if(!window._weatherBg){ window._weatherBg=_ce('div'); window._weatherBg.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999990;transition:background 1.8s ease,opacity 1.8s ease;'; _ba(window._weatherBg);
} window._weatherBg.style.background=wdata.bg; if(window._rainCanvas){window._rainCanvas.remove();window._rainCanvas=null;} if(window._rainRAF){_caf(window._rainRAF);window._rainRAF=null;} rainDrops=[]; if(w==='rain'||w==='storm'){ let cvs=_ce('canvas'); cvs.style.cssText='position:fixed;top:0;left:0;pointer-events:none;z-index:999991;'; cvs.width=innerWidth;cvs.height=innerHeight; _ba(cvs); window._rainCanvas=cvs; let ctx=cvs.getContext('2d'); let isStorm=w==='storm'; let drops=[]; let dropCount=isStorm?120:60; for(let i=0;i<dropCount;i++)drops.push({x:_mr()*innerWidth,y:_mr()*innerHeight,speed:isStorm?9+_mr()*5:4+_mr()*3,len:isStorm?20+_mr()*8:10+_mr()*6}); let drawRain=()=>{ ctx.clearRect(0,0,cvs.width,cvs.height); ctx.strokeStyle=isStorm?'rgba(140,180,255,0.55)':'rgba(140,180,255,0.38)'; ctx.lineWidth=isStorm?1.5:1; for(let d of drops){ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(d.x+d.len*0.12,d.y+d.len);ctx.stroke();d.y+=d.speed*(window.speed||1);if(d.y>innerHeight+20){d.y=-20;d.x=_mr()*innerWidth;}} window._rainRAF=_raf(drawRain); }; drawRain(); } if(weatherEl)weatherEl.remove(); weatherEl=_ce('div'); weatherEl.textContent=wdata.emoji+' '+wdata.label+'!'; weatherEl.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:36px;font-weight:bold;color:white;text-shadow:0 0 20px rgba(0,0,0,.8);z-index:1000010;pointer-events:none;transition:opacity 1s ease;'; _ba(weatherEl); setTimeout(()=>{weatherEl.style.opacity='0';},1800); setTimeout(()=>{if(weatherEl)weatherEl.remove();},2800);}function tickWeather(now){ if(now>weatherEnd){ let opts=['clear','clear','clear','rain','rain','storm','drought','fog','heatwave','rainbow','blizzard']; let next=opts[_mf(_mr()*opts.length)]; let dur=(20000+_mr()*20000); weatherEnd=now+dur; if(next!==weather)setWeather(next); } }
let dayPhase='day',dayStart=Date.now(),DAY_DUR=30000;
const PHASES=['dawn','day','dusk','night'];
const PHASE_DATA={
dawn:{emoji:'🌅',label:'Dawn',bg:'rgba(255,140,60,0.18)',duckSpeed:1.1,predSpeed:0.9},
day:{emoji:'☀️',label:'Day',bg:'rgba(40,80,160,0.08)',duckSpeed:1,predSpeed:1},
dusk:{emoji:'🌆',label:'Dusk',bg:'rgba(180,80,20,0.22)',duckSpeed:0.95,predSpeed:1.1},
night:{emoji:'🌙',label:'Night',bg:'rgba(5,10,40,0.55)',duckSpeed:0.7,predSpeed:1.4}
};
function tickDayNight(now){
let elapsed=now-dayStart;
if(elapsed>DAY_DUR){
dayStart=now;
let idx=(PHASES.indexOf(dayPhase)+1)%PHASES.length;
dayPhase=PHASES[idx];if(dayPhase==='dawn'){_dayCount++;if(_dayCount>=10)_unlockAch('tendays');}
let pd=PHASE_DATA[dayPhase];
if(!window._dayBg){window._dayBg=_ce('div');window._dayBg.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999989;transition:background 2s ease;';_ba(window._dayBg);}
window._dayBg.style.background=pd.bg;
let banner=_ce('div');banner.textContent=pd.emoji+' '+pd.label;banner.style.cssText='position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);font-size:32px;color:white;text-shadow:0 0 20px rgba(0,0,0,.9);z-index:1000011;pointer-events:none;transition:opacity 1s ease;';_ba(banner);setTimeout(()=>banner.style.opacity='0',1800);setTimeout(()=>banner.remove(),2800);
}
}
function dayDuckMult(){return PHASE_DATA[dayPhase].duckSpeed;}function daySpawnMult(){return dayPhase==="night"?1.82:1;}
function dayPredMult(){return PHASE_DATA[dayPhase].predSpeed;}
let Ducks=[],Babies=[],BabySwans=[],Swans=[],DragonEggs=[],BabyDragons=[],Dragons=[],Eggs=[],Snakes=[],Foxes=[],Wolves=[],Aliens=[],Bears=[],Lions=[],Eagles=[],Bats=[],Zombies=[],BabyZombies=[],Yetis=[],_frostTrails=[],mode=null,BEACON=null,BOMB=false,BOMB_TIMER=null,BOMB_EL=null,BLACKHOLE=null,start=Date.now(),nextFox=Date.now()+50000,nextSnake=Date.now()+60000,nextWolf=Date.now()+75000,nextDragon=Date.now()+20000,nextBear=Date.now()+70000,nextLion=Date.now()+90000,nextEagle=Date.now()+80000,nextBat=Date.now()+65000,nextYetiCheck=Date.now()+15000,highestPop=0,_totalKills=0,_dayCount=0,nextOutbreak=Date.now()+10000,nextLightning=Date.now()+15000,nextUFO=Date.now()+20000,_ufoCount=0;const PAD=30,HIT=26,DR=40,DT=15000,DS=1700;
const _ACH_DEFS=[{id:'humble',emoji:'🌱',title:'Humble Beginnings',desc:'The pond awakens.',diff:'easy'},{id:'firstlife',emoji:'🐥',title:'First Life',desc:'A duckling grew up!',diff:'easy'},{id:'kaboom',emoji:'💥',title:'KABOOM!',desc:'Blew up 10+ entities at once.',diff:'medium'},{id:'zombie_apoc',emoji:'🧟',title:'Zombie Apocalypse',desc:'10 zombies alive at once.',diff:'hard'},{id:'extinction',emoji:'☠️',title:'Extinction',desc:'Every last entity is gone.',diff:'hard'},{id:'alpha',emoji:'😡',title:"I'm the Alpha",desc:'Triggered wolf rage.',diff:'medium'},{id:'needforspeed',emoji:'⚡',title:'Need for Speed',desc:'Activated 4× speed.',diff:'easy'},{id:'shhh',emoji:'🤫',title:'Shhh',desc:'Paused the game.',diff:'easy'},{id:'doctorduck',emoji:'💉',title:'Doctor Duck',desc:'Cured 5 infected entities.',diff:'medium'},{id:'pazero',emoji:'🦠',title:'Patient Zero',desc:'Manually infected the first entity.',diff:'easy'},{id:'leader',emoji:'🗡️',title:"I'm the Leader",desc:'Killed an enraged wolf.',diff:'medium'},{id:'dud',emoji:'💣',title:'Dud',desc:'Bombed with nothing to kill.',diff:'medium'},{id:'overkill',emoji:'☠️',title:'Overkill',desc:'Bombed when only 1 entity existed.',diff:'medium'},{id:'outbreak',emoji:'🫧',title:'Outbreak',desc:'A natural outbreak occurred.',diff:'easy'},{id:'twobirds',emoji:'🪨',title:'2 Birds 1 Stone',desc:'Killed exactly 2 ducks with a meteor.',diff:'hard'},{id:'lastresort',emoji:'☣️',title:'Last Resort',desc:'Bombed 50+ infected entities at once.',diff:'crazy'},{id:'singularity',emoji:'🕳️',title:'Singularity',desc:'Sucked in 10 entities with one black hole.',diff:'hard'},{id:'vaccinated',emoji:'💉',title:'Vaccinated',desc:'Used the vaccine.',diff:'easy'},{id:'ecosystem',emoji:'🌍',title:'Ecosystem',desc:'2+ ducks, ducklings, swans, foxes, wolves & snakes alive.',diff:'hard'},{id:'ducklife',emoji:'🌊',title:'Duck Life',desc:'500+ entities alive at once.',diff:'hard'},{id:'howdidwegethere',emoji:'🤯',title:'How Did We Get Here',desc:'1000+ entities alive at once.',diff:'crazy'},{id:'d8ck',emoji:'🦆',title:'D8ck',desc:'Exactly 8 adult ducks alive.',diff:'medium'},{id:'ducky',emoji:'🐣',title:'DUCKY',desc:'25+ entities alive at once.',diff:'easy'},{id:'chickenstars',emoji:'🌟',title:'Chicken Stars',desc:'Infected duckling drowned in a flood.',diff:'crazy'},{id:'thatsmyboy',emoji:'🦢',title:"That's My Boy",desc:'Swan killed a zombie.',diff:'medium'},{id:'tempertantrum',emoji:'😤',title:'Temper Tantrum',desc:'Gave a duckling rage.',diff:'medium'},{id:'eyeofdragon',emoji:'🐉',title:'Eye of the Dragon',desc:'Unlock every dragon achievement.',diff:'dragon'},{id:'blackdeath',emoji:'🖤',title:'The Black Death',desc:'1000+ entities infected at once.',diff:'impossible'},{id:'sixtyseven',emoji:'6️⃣7️⃣',title:'67',desc:'Exactly 67 adult ducks alive.',diff:'hard'},{id:'doyuknow',emoji:'🦆',title:'Do Yu Knoe Da Wey',desc:'10+ entities following a beacon.',diff:'medium'},{id:'survived',emoji:'🛡️',title:'Survived',desc:'Survived a natural outbreak.',diff:'hard'},{id:'babyboo',emoji:'🍼',title:'Baby Boo',desc:'At least 1 duckling and 1 baby swan alive.',diff:'easy'},{id:'endofbeginning',emoji:'🐉',title:'End of the Beginning',desc:'A dragon egg has appeared.',diff:'dragon'},{id:'theend',emoji:'🔥',title:'The End?',desc:'A dragon has fully grown.',diff:'dragon'},{id:'fahhhh',emoji:'🐲',title:'FAHHHH',desc:'Raged a dragon into breathing fire.',diff:'dragon'},{id:'dragonslayer',emoji:'⚔️',title:'Dragon Slayer',desc:'Killed a dragon with a knife.',diff:'dragon'},{id:'hyperpigmentation',emoji:'🌪️⚡',title:'Hyperpigmentation',desc:'Strike a tornado-tossed entity with Zeus.',diff:'crazy'},{id:'tendays',emoji:'📅',title:'10 Days',desc:'Survived 10 full day cycles.',diff:'medium'},{id:'thisfun',emoji:'😄',title:'This is Fun',desc:'Played for 5 minutes.',diff:'easy'},{id:'addicted',emoji:'🎮',title:'Addicted',desc:'Played for 10+ minutes.',diff:'medium'},{id:'achmaster',emoji:'🎖️',title:'Achievement Master',desc:'Unlocked every achievement.',diff:'celestial'},{id:'notaduck',emoji:'🥚',title:"That's Not a Duck",desc:'Used a non-duck egg.',diff:'easy'},{id:'flash',emoji:'⚡',title:'Flash',desc:'Raged a swan during a storm at 4× speed.',diff:'crazy'},{id:'firstcontact',emoji:'🛸',title:'First Contact',desc:'A UFO appeared for the first time.',diff:'alien'},{id:'theytookone',emoji:'🦆',title:'They Took One',desc:'A duck was abducted.',diff:'alien'},{id:'wecomeinpeace',emoji:'🤝',title:'We Come in Peace',desc:'Let an alien live for 30 seconds.',diff:'alien'},{id:'closencounter',emoji:'👁️',title:'Close Encounter',desc:'An alien killed 3 entities.',diff:'alien'},{id:'alienslayer',emoji:'🔪',title:'Alien Slayer',desc:'Killed an alien with the knife.',diff:'alien'},{id:'drownedout',emoji:'🌊',title:'Drowned Out',desc:'Killed an alien with a flood.',diff:'alien'},{id:'wearenotalone',emoji:'👽',title:'We Are Not Alone',desc:'Unlock every alien achievement.',diff:'alien'},
{id:'bearattack',emoji:'🐻',title:'Bear Necessities',desc:'A bear caught its first prey.',diff:'easy'},
{id:'sharkbite',emoji:'🦈',title:'Jaws',desc:'A shark took a duck.',diff:'easy'},
{id:'lionking',emoji:'🦁',title:'The Lion King',desc:'A lion made a kill.',diff:'easy'},
{id:'crocattack',emoji:'🐊',title:'See You Later',desc:'A croc snapped something up.',diff:'easy'},
{id:'magnetmaster',emoji:'🧲',title:'Magnetic Personality',desc:'Used the magnet tool.',diff:'easy'},
{id:'bedtime',emoji:'💤',title:'Shhh, Sleeping',desc:'Put an animal to sleep.',diff:'easy'},
{id:'cosmicrain',emoji:'🌌',title:'Cosmic Rain',desc:'Triggered a meteor shower.',diff:'medium'},
{id:'overtherainbow',emoji:'🌈',title:'Over The Rainbow',desc:'Survived a rainbow boost.',diff:'easy'},
{id:'menagerie',emoji:'🦁',title:'Menagerie',desc:'Have ducks, bears, AND lions alive at once.',diff:'medium'},
{id:'foggymorning',emoji:'🌫️',title:'Pea Souper',desc:'Triggered fog weather.',diff:'easy'},
{id:'feelslikefire',emoji:'🥵',title:'Feels Like Fire',desc:'Triggered a heatwave.',diff:'easy'},
{id:'apexpredator',emoji:'🏆',title:'Apex Predator',desc:'Have 3 bears, 3 lions, and 3 sharks alive at once.',diff:'hard'},
{id:'eaglestrike',emoji:'🦅',title:'Talons Out',desc:'An eagle snatched a duckling.',diff:'easy'},
{id:'batbite',emoji:'🦇',title:'Batty',desc:'A bat infected something.',diff:'easy'},
{id:'duckdefense',emoji:'🦆',title:'Duck Defense',desc:'A duck killed a bat.',diff:'easy'},
{id:'nightflock',emoji:'🌙',title:'Night Flock',desc:'Have 3+ bats alive during night.',diff:'medium'},
{id:'apexbird',emoji:'🦅',title:'Sky Ruler',desc:'Have 3 eagles alive at once.',diff:'medium'},
{id:'plaguedoctor',emoji:'💀',title:'Plague Doctor',desc:'Used the plague bomb.',diff:'easy'},
{id:'eclipse',emoji:'🌑',title:'Totality',desc:'Triggered an eclipse.',diff:'medium'},
{id:'overgrowth',emoji:'🌿',title:'Overgrown',desc:'Triggered overgrowth.',diff:'easy'},
{id:'blizzardborn',emoji:'❄️',title:'Blizzard Born',desc:'Triggered a blizzard.',diff:'easy'},
{id:'winterkill',emoji:'🧊',title:'Winter is Coming',desc:'A blizzard killed 10+ ducklings.',diff:'hard'},
{id:'shockwaved',emoji:'💥',title:'Get Back!',desc:'Used the shockwave.',diff:'easy'},
{id:'shockwavemaster',emoji:'💥',title:'Untouchable',desc:'Shockwaved 15+ entities at once.',diff:'medium'},
{id:'thunderstruck',emoji:'⚡',title:'Thunderstruck',desc:'A thunderstorm killed its first entity.',diff:'easy'},
{id:'thundergod',emoji:'⛈️',title:'Thunder God',desc:'Triggered a thunderstorm.',diff:'easy'},
{id:'stormsurvivor',emoji:'🛡️',title:'Storm Survivor',desc:'Had 50+ ducks survive a full thunderstorm.',diff:'hard'},
{id:'yetisighting',emoji:'🧊',title:'Did You See That?',desc:'A Yeti appeared.',diff:'yeti'},
{id:'yetistomp',emoji:'💥',title:'The Ground Shook',desc:'A Yeti stomped for the first time.',diff:'yeti'},
{id:'yetirampage',emoji:'🌨️',title:'Blizzard Feet',desc:'A Yeti stomped 5+ entities at once.',diff:'yeti'},
{id:'deepfreeze',emoji:'🥶',title:'Deep Freeze',desc:'A Yeti\'s stomps killed 10 entities total.',diff:'yeti'},
{id:'snowblind',emoji:'🌨️',title:'Snow Blind',desc:'A Yeti appeared during a blizzard.',diff:'yeti'},
{id:'yetichaser',emoji:'🗡️',title:'Yeti Hunter',desc:'Knife-killed a Yeti.',diff:'yeti'},
{id:'frostbitten',emoji:'🧊',title:'Frostbitten',desc:'10 entities were slowed by Yeti frost trails.',diff:'yeti'},
{id:'yetimaster',emoji:'❄️',title:'Snow Legend',desc:'Unlock all other Yeti achievements.',diff:'yeti'},
{id:"alieninvasion",emoji:"🛸",title:"They're Here",desc:'Triggered the alien invasion.',diff:'alien'}
];
let _achUnlocked=new Set();window._achUnlocked=_achUnlocked;
let _achPanel=null,_achPanelOpen=false;
let _achToasts=[];
window._unlockAch=function _unlockAch(id){
if(window.paused&&id!=='shhh')return;
if(_achUnlocked.has(id))return;
_achUnlocked.add(id);
let def=_ACH_DEFS.find(a=>a.id===id);
if(!def)return;
if(_achPanelOpen)_renderAchPanel();
if(id!=='achmaster'&&_ACH_DEFS.every(a=>a.id==='achmaster'||_achUnlocked.has(a.id)))_unlockAch('achmaster');
const _dragonAchs=['endofbeginning','theend','dragonslayer','fahhhh'];
if(_dragonAchs.includes(id)&&_dragonAchs.every(d=>_achUnlocked.has(d)))_unlockAch('eyeofdragon');
const _alienAchs=['firstcontact','theytookone','wecomeinpeace','closencounter','alienslayer','drownedout','alieninvasion'];
if(_alienAchs.includes(id)&&_alienAchs.every(a=>_achUnlocked.has(a)))_unlockAch('wearenotalone');
if(id==='eyeofdragon'){
if(!_gi('ck-shake-style')){
let ss=_ce('style');ss.id='ck-shake-style';
ss.textContent=`@keyframes ckQuake{0%{transform:translate(0,0)}10%{transform:translate(-6px,-4px)}20%{transform:translate(6px,4px)}30%{transform:translate(-8px,2px)}40%{transform:translate(8px,-2px)}50%{transform:translate(-4px,6px)}60%{transform:translate(4px,-6px)}70%{transform:translate(-6px,4px)}80%{transform:translate(6px,-4px)}90%{transform:translate(-4px,2px)}100%{transform:translate(0,0)}}`;
document.head.appendChild(ss);
}
let shakeEl=_ce('div');
shakeEl.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000098;pointer-events:none;animation:ckQuake 0.8s ease-in-out;';
_ba(shakeEl);
setTimeout(()=>shakeEl.remove(),900);
setTimeout(()=>{if(window._confettiBurst)_confettiBurst(['#ff2200','#ff6600','#ffaa00','#ffdd00','#ff4400','#ff8800']);},200);
setTimeout(()=>{
let fd=_ce('div');fd.textContent='🐉';
fd.style.cssText='position:fixed;top:'+(20+_mr()*40)+'%;left:-80px;font-size:64px;z-index:1000099;pointer-events:none;transition:left 2.2s cubic-bezier(.4,0,.6,1),top 2.2s ease-in-out;filter:drop-shadow(0 0 12px #ff6600) drop-shadow(0 0 24px #ff2200);';
_ba(fd);
_raf(()=>{
fd.style.left=(innerWidth+100)+'px';
fd.style.top=(10+_mr()*50)+'%';
});
setTimeout(()=>fd.remove(),2400);
},400);
}
_achToasts.push(def);
if(_achToasts.length===1)_showNextToast();
}
window._confettiBurst=function _confettiBurst(palette){
const isCelestial=palette&&palette.includes('#ff0080')&&palette.includes('#a855f7')&&palette.length===6;
const isSecret=palette&&palette.includes('#111')&&palette.includes('#fff')&&palette.length===7;
const colors=palette||['#ff0080','#ff8c00','#ffe600','#00ff80','#00cfff','#a855f7','#fff'];
const rainbowCols=['#ff0080','#ff8c00','#ffe600','#00ff80','#00cfff','#a855f7'];
const secretCols=['#ffffff','#aaaaaa','#333333'];
const frag=document.createDocumentFragment();
const pieces=[];
for(let i=0;i<50;i++){
let c=_ce('div');
let sz=6+_mr()*7;
let dur=0.7+_mr()*0.7;
let col=isCelestial?rainbowCols[i%rainbowCols.length]:isSecret?secretCols[i%3]:colors[_mf(_mr()*colors.length)];
let glow=isCelestial?`box-shadow:0 0 4px 1px ${col};`:isSecret&&i%3===0?'box-shadow:0 0 6px 2px rgba(255,255,255,0.8);':'';
c.style.cssText=`position:fixed;left:50%;top:40%;width:${sz}px;height:${sz}px;background:${col};${glow}border-radius:${Math.random()<0.5?'50%':'2px'};z-index:1000060;pointer-events:none;will-change:left,top,opacity;transform:translate(-50%,-50%);transition:left ${dur}s ease-out,top ${dur}s ease-out,opacity 0.4s ease ${(0.5+Math.random()*0.4).toFixed(2)}s;opacity:1;`;
frag.appendChild(c);
pieces.push({el:c,dur});
}
_ba(frag);
_raf(()=>{
pieces.forEach(({el,dur})=>{
el.style.left=(15+_mr()*70)+'%';
el.style.top=(5+_mr()*80)+'%';
});
setTimeout(()=>pieces.forEach(p=>{p.el.style.opacity='0';}),700);
setTimeout(()=>pieces.forEach(p=>p.el.remove()),1400);
});
}
function _showNextToast(){
if(!_achToasts.length)return;
let def=_achToasts[0];
let TOAST_H=72,GAP=8,BASE_TOP=20;
let active=_qsa('.ck-ach-toast');
let topPos=BASE_TOP+active.length*(TOAST_H+GAP);
let toast=_ce('div');
toast.className='ck-ach-toast';
toast.style.cssText=`position:fixed;top:${topPos}px;left:20px;background:rgba(22,24,42,0.97);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:10px 16px;box-shadow:0 4px 24px rgba(0,0,0,0.5);z-index:1000060;pointer-events:none;opacity:0;transform:translateX(-20px);transition:transform .35s cubic-bezier(.34,1.56,.64,1),opacity .25s ease;display:flex;align-items:center;gap:10px;font-family:Nunito,sans-serif;max-width:240px;`;
let _dm=_DIFF_META[def.diff||'easy']||_DIFF_META.easy;
let _dbadge;
if(def.diff==='celestial')_dbadge=`<span style="font-size:9px;font-weight:900;background:linear-gradient(90deg,#ff0080,#ff8c00,#ffe600,#00ff80,#00cfff,#a855f7);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">${_dm.label}</span>`;
else if(def.diff==='dragon')_dbadge=`<span style="font-size:9px;font-weight:900;color:#ff6600;text-shadow:0 0 6px #ff4400;">🐉 Dragon</span>`;
else if(def.diff==='alien')_dbadge=`<span style="font-size:9px;font-weight:900;color:#00ff88;text-shadow:0 0 4px #00aa55;">👽 Alien</span>`;
else if(def.diff==='yeti')_dbadge=`<span style="font-size:9px;font-weight:900;color:#44aacc;text-shadow:0 0 4px #88ccee;">🧊 Yeti</span>`;
else _dbadge=`<span style="font-size:9px;font-weight:900;color:${_dm.color};">${_dm.label}</span>`;
toast.innerHTML=`<div style="font-size:26px;flex-shrink:0">${def.emoji}</div><div><div style="font-size:9px;font-weight:900;color:rgba(255,255,255,0.35);letter-spacing:.1em;text-transform:uppercase;display:flex;align-items:center;gap:4px;">Achievement ${_dbadge}</div><div style="font-size:13px;font-weight:900;color:#fff">${def.title}</div><div style="font-size:10px;color:rgba(255,255,255,0.5)">${def.desc}</div></div>`;
_ba(toast);
if(def.diff==='celestial')setTimeout(()=>_confettiBurst(['#ff0080','#ff8c00','#ffe600','#00ff80','#00cfff','#a855f7']),100);else if(def.diff==='secret')setTimeout(()=>_confettiBurst(['#111','#333','#555','#888','#aaa','#ccc','#fff']),100);else if(def.diff==='alien')setTimeout(()=>_confettiBurst(['#00ff88','#00ffcc','#00ccff','#88ff00','#00ff44','#aaffcc']),100);
_raf(()=>{toast.style.opacity='1';toast.style.transform='translateX(0)';});
setTimeout(()=>{toast.style.opacity='0';toast.style.transform='translateX(-20px)';},3200);
setTimeout(()=>{toast.remove();_achToasts.shift();_showNextToast();},3600);
}
const _DIFF_META={easy:{label:'Easy',color:'#4caf50'},medium:{label:'Medium',color:'#ff9800'},hard:{label:'Hard',color:'#f44336'},crazy:{label:'Crazy',color:'#9c27b0'},impossible:{label:'Impossible',color:'#111'},celestial:{label:'Celestial',color:'rainbow'},secret:{label:'Secret',color:'secret'},dragon:{label:'Dragon',color:'dragon'},alien:{label:'Alien',color:'alien'},yeti:{label:'Yeti',color:'yeti'}};
const _ACH_TABS=[{id:'all',emoji:'🌐',label:'All',ids:null},{id:'starters',emoji:'🌱',label:'Starters',ids:['humble','firstlife','shhh','needforspeed','ducky','notaduck','vaccinated','outbreak','pazero']},{id:'combat',emoji:'⚔️',label:'Combat',ids:['kaboom','dud','overkill','twobirds','lastresort','singularity','leader','alpha']},{id:'infection',emoji:'🦠',label:'Infection',ids:['pazero','outbreak','vaccinated','doctorduck','zombie_apoc','blackdeath','chickenstars','thatsmyboy']},{id:'population',emoji:'🦆',label:'Population',ids:['ecosystem','ducklife','howdidwegethere','d8ck','ducky','extinction']},{id:'disasters',emoji:'🌋',label:'Disasters',ids:['kaboom','twobirds','flash','chickenstars','lastresort','howdidwegethere','cosmicrain','overtherainbow','foggymorning','feelslikefire']},{id:'memes',emoji:'😂',label:'Memes',ids:['chickenstars','alpha','leader','doyuknow','babyboo','sixtyseven','fahhhh','hyperpigmentation']},{id:'animals',emoji:'🦁',label:'Animals',ids:['bearattack','lionking','menagerie','apexpredator','bedtime','magnetmaster','cosmicrain','overtherainbow','foggymorning','feelslikefire','eaglestrike','batbite','duckdefense','nightflock','apexbird','plaguedoctor','eclipse','overgrowth','blizzardborn','winterkill','shockwaved','shockwavemaster','thunderstruck','thundergod','stormsurvivor']},{id:'special',emoji:'✨',label:'Special',ids:['achmaster','flash','tempertantrum','blackdeath']},{id:'dragon',emoji:'🐉',label:'Dragon',ids:['endofbeginning','theend','dragonslayer','fahhhh','eyeofdragon']},{id:'yeti',emoji:'🧊',label:'Yeti',ids:['yetisighting','yetistomp','yetirampage','deepfreeze','snowblind','yetichaser','frostbitten','yetimaster']},{id:'alien',emoji:'👽',label:'Alien',ids:['firstcontact','theytookone','wecomeinpeace','closencounter','alienslayer','drownedout','wearenotalone','alieninvasion']},{id:'unlocked',emoji:'🔓',label:'Unlocked',ids:'unlocked'}];
const _DIFF_ORDER={easy:0,medium:1,hard:2,crazy:3,impossible:4,celestial:5,secret:6,dragon:7,alien:8,yeti:9};
let _achActiveTab='all';
function _diffBadge(diff,unlocked){
if(diff==='yeti'){
if(!unlocked)return `<span style="font-size:10px;font-weight:900;padding:1px 7px;border-radius:8px;background:#b8e8ff22;color:#336688;border:1.5px solid #88ccee55;">???</span>`;
return `<span style="background:linear-gradient(90deg,#b8e8ff,#88ccee);color:#003344;padding:1px 7px;border-radius:8px;font-size:10px;font-weight:700;border:1.5px solid #44aacc;">🧊 Yeti</span>`;
}
if(diff==='alien'){
if(!unlocked)return `<span style="font-size:11px;font-weight:900;padding:1px 7px;border-radius:8px;background:#001a0d;color:#1a4a2a;border:1px solid #0a2a1a;">???</span>`;
return `<span style="font-size:11px;font-weight:900;padding:1px 7px;border-radius:8px;background:linear-gradient(90deg,#001a0d,#003322,#001a0d);color:#00ff88;text-shadow:0 0 6px #00ff44;border:1px solid #00aa55;animation:alienGlow 1.5s ease-in-out infinite;">👽 Alien</span>`;
}
if(diff==='dragon'){
if(!unlocked)return `<span style="font-size:11px;font-weight:900;padding:1px 7px;border-radius:8px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.3);border:1px solid rgba(255,255,255,0.1);">???</span>`;
return `<span style="font-size:11px;font-weight:900;padding:1px 7px;border-radius:8px;background:linear-gradient(90deg,#1a4a1a,#2d7a2d,#1a4a1a);color:#ff4400;text-shadow:0 0 6px #ff6600,0 0 12px #ff4400;border:1px solid #2d7a2d;animation:dragonBadgeFire 1s ease-in-out infinite;">🐉 Dragon</span>`;
}
let dm=_DIFF_META[diff]||_DIFF_META.easy;
if(diff==='secret'&&unlocked){return `<span style="font-size:9px;font-weight:900;padding:1px 6px;border-radius:8px;background:linear-gradient(90deg,#111,#555,#111,#888,#111);background-size:400% auto;animation:secretShine 2s linear infinite;color:#ccc;border:1px solid #444;">Secret</span>`;}
if(diff==='secret'&&!unlocked){return `<span style="font-size:9px;font-weight:900;padding:1px 6px;border-radius:8px;background:#111;color:#fff;border:1px solid #222;">???</span>`;}
if(diff==='celestial'&&unlocked){
return `<span style="font-size:9px;font-weight:900;padding:1px 6px;border-radius:8px;background:linear-gradient(90deg,#ff0080,#ff8c00,#ffe600,#00ff80,#00cfff,#a855f7);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;border:1px solid #ddd;">${dm.label}</span>`;
}
let opacity=unlocked?1:0.45;
return `<span style="font-size:9px;font-weight:900;padding:1px 6px;border-radius:8px;background:${dm.color}22;color:${dm.color};border:1px solid ${dm.color}55;opacity:${opacity};">${dm.label}</span>`;
}
function _renderAchPanel(){
if(!_achPanel)return;
_achPanel.innerHTML='';
let head=_ce('div');
head.style.cssText='font-size:13px;font-weight:900;color:#fff;padding:4px 2px 8px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;font-family:Nunito,sans-serif;';
head.innerHTML=`<span>🏆 Achievements</span><span style="font-size:11px;color:rgba(255,255,255,0.35)">${_achUnlocked.size}/${_ACH_DEFS.length}</span>`;
_achPanel.appendChild(head);
let tabRow=_ce('div');
tabRow.style.cssText='display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;';
_ACH_TABS.forEach(tab=>{
let tb=_ce('div');
let active=_achActiveTab===tab.id;
tb.style.cssText=`font-size:10px;font-weight:900;font-family:Nunito,sans-serif;padding:3px 8px;border-radius:20px;cursor:pointer;user-select:none;background:${active?'rgba(245,230,66,0.15)':'rgba(255,255,255,0.06)'};color:${active?'#f5e642':'rgba(255,255,255,0.4)'};border:1px solid ${active?'rgba(245,230,66,0.3)':'transparent'};transition:all .15s;white-space:nowrap;`;
tb.textContent=tab.emoji+' '+tab.label;
tb.addEventListener('click',e=>{e.stopPropagation();_achActiveTab=tab.id;_renderAchPanel();});
tb.addEventListener('touchend',e=>{e.preventDefault();e.stopPropagation();_achActiveTab=tab.id;_renderAchPanel();});
tabRow.appendChild(tb);
});
_achPanel.appendChild(tabRow);
let activeTab=_ACH_TABS.find(t=>t.id===_achActiveTab)||_ACH_TABS[0];
let defs=activeTab.ids==='unlocked'?_ACH_DEFS.filter(d=>_achUnlocked.has(d.id)):activeTab.ids?_ACH_DEFS.filter(d=>activeTab.ids.includes(d.id)):_ACH_DEFS;
defs=[...defs].sort((a,b)=>(_DIFF_ORDER[a.diff||'easy']||0)-(_DIFF_ORDER[b.diff||'easy']||0));
defs.forEach(def=>{
let unlocked=_achUnlocked.has(def.id);
let row=_ce('div');
let isCelestial=def.diff==='celestial'&&unlocked;let isSecret=def.diff==='secret'&&unlocked;
const isDragon=def.diff==='dragon';
const isAlien=def.diff==='alien';
const isYeti=def.diff==='yeti';
const alienUnlocked=isAlien&&unlocked;
const dragonUnlocked=isDragon&&unlocked;
const yetiUnlocked=isYeti&&unlocked;
row.style.cssText=`display:flex;align-items:center;gap:10px;padding:7px 6px;border-radius:12px;margin-bottom:4px;opacity:${(isDragon&&!unlocked)||(isAlien&&!unlocked)||(isYeti&&!unlocked)?0.35:1};background:${isSecret?'linear-gradient(90deg,#111,#2a2a2a,#111)':isCelestial?'linear-gradient(90deg,rgba(255,100,100,0.15),rgba(255,200,50,0.15),rgba(100,255,100,0.15),rgba(50,150,255,0.15),rgba(180,50,255,0.15))':dragonUnlocked?'linear-gradient(90deg,#0d2b0d,#1a4a1a,#0d2b0d)':alienUnlocked?'linear-gradient(90deg,#001a0d,#002a1a,#001a0d)':yetiUnlocked?'linear-gradient(90deg,#0a1a2a,#1a3a5a,#0a1a2a)':unlocked?'rgba(245,230,66,0.08)':'rgba(255,255,255,0.04)'};animation:${isSecret?'secretShine 3s linear infinite':''};transition:background .2s;`;
const _dispTitle=(isDragon&&!unlocked)||(isAlien&&!unlocked)||(isYeti&&!unlocked)?'??? ???':((def.emoji?def.emoji+' ':'')+def.title);
const _dispDesc=(isDragon&&!unlocked)||(isAlien&&!unlocked)||(isYeti&&!unlocked)?'':def.desc||'';
const _titleColor=isSecret&&unlocked?'#fff':dragonUnlocked?'#ff6600':alienUnlocked?'#00ff88':yetiUnlocked?'#44aacc':unlocked?'#fff':'rgba(255,255,255,0.35)';
const _titleGlow=isSecret&&unlocked?'text-shadow:0 0 8px #ff0080,0 0 16px #a855f7,0 0 24px #00cfff;':dragonUnlocked?'text-shadow:0 0 6px #ff4400,0 0 12px #ff6600;':alienUnlocked?'text-shadow:0 0 6px #00ff44,0 0 12px #00ff88;':yetiUnlocked?'text-shadow:0 0 6px #44aacc,0 0 12px #88ccee;':'';
row.innerHTML=`<div style="font-size:22px;opacity:${unlocked?1:0.2};filter:${unlocked?'none':'grayscale(1)'};">${(isDragon||isAlien||isYeti)&&!unlocked?'❓':def.emoji}</div><div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;"><span style="font-size:12px;font-weight:900;color:${_titleColor};${_titleGlow}font-family:Nunito,sans-serif">${_dispTitle}</span>${_diffBadge(def.diff||'easy',unlocked)}</div><div style="font-size:10px;color:${unlocked?'rgba(255,255,255,0.45)':'rgba(255,255,255,0.2)'};font-family:Nunito,sans-serif;margin-top:1px;">${unlocked?_dispDesc:'???'}</div></div>`;
_achPanel.appendChild(row);
});
}
function _toggleAchPanel(){
_achPanelOpen=!_achPanelOpen;
if(_achPanelOpen){
_achPanel.style.display='block';
_renderAchPanel();
_raf(()=>{_achPanel.style.opacity='1';_achPanel.style.transform='translateY(0) scale(1)';});
} else {
_achPanel.style.opacity='0';_achPanel.style.transform='translateY(-8px) scale(0.97)';
setTimeout(()=>{if(!_achPanelOpen)_achPanel.style.display='none';},200);
}
}
const make=(x,y,e,s)=>{let d=_ce("div");d.textContent=e;d.style.cssText=`position:fixed;left:${x}px;top:${y}px;font-size:${s||22}px;z-index:999999;user-select:none;cursor:pointer;touch-action:none;`;_ba(d);return d};const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);function explosion(x,y){let boom=_ce("div");boom.textContent="💥";boom.style.cssText=`position:fixed;left:${x}px;top:${y}px;font-size:50px;z-index:1000006;pointer-events:none;transform:translate(-50%,-50%);transition:transform .7s ease-out,opacity .7s ease-out;`;_ba(boom);_raf(()=>{boom.style.transform="translate(-50%,-50%) scale(4)";boom.style.opacity="0"});let ring=_ce("div");ring.style.cssText=`position:fixed;left:${x}px;top:${y}px;width:30px;height:30px;border-radius:50%;border:6px solid red;z-index:1000005;pointer-events:none;transform:translate(-50%,-50%);transition:all .7s ease-out;`;_ba(ring);_raf(()=>{ring.style.width="800px";ring.style.height="800px";ring.style.opacity="0"});setTimeout(()=>{boom.remove();ring.remove()},700)}function rem(o){if(o._dead)return;o._dead=true;if(o._fireInterval){clearInterval(o._fireInterval);o._fireInterval=null;}if(o.type!=="Egg"&&o.type!=="DragonEgg"){_totalKills++;}if(o.type!=="Egg"){let skull=_ce("div");skull.textContent="💀";skull.style.cssText=`position:fixed;left:${o.x}px;top:${o.y}px;font-size:20px;z-index:1000007;pointer-events:none;transform:translate(-50%,-50%);transition:transform .6s ease-out,opacity .6s ease-out;`;_ba(skull);_raf(()=>{skull.style.transform="translate(-50%,-50%) translateY(-30px) scale(1.4)";skull.style.opacity="0"});setTimeout(()=>skull.remove(),600);}o.el.remove();[Ducks,Babies,BabySwans,Swans,DragonEggs,BabyDragons,Dragons,Eggs,Snakes,Foxes,Wolves,Aliens,Bears,Lions,Zombies,BabyZombies,Yetis,Eagles,Bats].forEach(a=>{let i=a.indexOf(o);if(i>-1)a.splice(i,1)})}let _vaccineCures=0;
function wipe(){let _wc=[...Ducks,...Babies,...BabySwans,...Swans,...Eggs,...Snakes,...Foxes,...Wolves,...Dragons,...BabyDragons,...DragonEggs,...Aliens,...Bears,...Lions,...Eagles,...Bats,...Zombies,...BabyZombies,...Yetis];if(!window.paused){if(_wc.length>=10)_unlockAch('kaboom');if(_wc.length===0)_unlockAch('dud');if(_wc.length===1)_unlockAch('overkill');if(_wc.filter(o=>o.infected||o._zombie).length>=50)_unlockAch('lastresort');}_wc.forEach(o=>o.el.remove());Ducks=[];Babies=[];BabySwans=[];Swans=[];Eggs=[];Snakes=[];Foxes=[];Wolves=[];Dragons=[];BabyDragons=[];DragonEggs=[];Aliens=[];Bears=[];Lions=[];Eagles=[];Bats=[];Zombies=[];BabyZombies=[];Yetis=[];}function spawn(arr,e,x,y,s,sz,t){let o={x,y,a:_mr()*6.28,s:s||1+_mr(),born:Date.now(),type:t,infected:false,inf:0,last:0,el:make(x,y,e,sz)};o.el.onclick=ev=>{if(mode==="knife"){
if(!_gi('dl-knife-style')){
let ks=_ce('style');ks.id='dl-knife-style';
ks.textContent=`
@keyframes dragonBadgeFire{0%,100%{text-shadow:0 0 4px #ff6600,0 0 8px #ff4400;}50%{text-shadow:0 0 10px #ffaa00,0 0 20px #ff6600,0 0 30px #ff2200;}}
@keyframes secretShine{0%{background-position:200% center}100%{background-position:-200% center}}@keyframes knifeSlash{0%{transform:translate(-50%,-50%) rotate(-40deg) scale(0.6);opacity:1}60%{transform:translate(-50%,-50%) rotate(15deg) scale(1.2);opacity:1}100%{transform:translate(-50%,-50%) rotate(30deg) scale(0.8);opacity:0}}
@keyframes knifeSplat{0%{transform:translate(-50%,-50%) scale(0);opacity:1}60%{transform:translate(-50%,-50%) scale(1.3);opacity:0.9}100%{transform:translate(-50%,-50%) scale(1.8);opacity:0}}
@keyframes knifeFeather{0%{opacity:1;transform:translate(var(--fx),var(--fy)) rotate(var(--fr)) scale(1)}100%{opacity:0;transform:translate(var(--fx2),var(--fy2)) rotate(var(--fr2)) scale(0.3)}}
@keyframes knifeText{0%{opacity:1;transform:translate(-50%,-120%) scale(1)}100%{opacity:0;transform:translate(-50%,-220%) scale(0.8)}}@keyframes alienGlow{0%,100%{text-shadow:0 0 4px #00ff44,0 0 8px #00cc33;}50%{text-shadow:0 0 10px #00ff88,0 0 20px #00ff44,0 0 30px #00cc22;}}
`;
document.head.appendChild(ks);
}
let kx=o.x+12,ky=o.y+12;
let slash=_ce('div');
slash.textContent='🔪';
slash.style.cssText=`position:fixed;left:${kx}px;top:${ky}px;font-size:32px;z-index:1000020;pointer-events:none;animation:knifeSlash 0.35s ease-out forwards;filter:drop-shadow(0 0 6px rgba(255,50,50,0.8));`;
_ba(slash);
setTimeout(()=>slash.remove(),350);
let splat=_ce('div');
splat.textContent='💥';
splat.style.cssText=`position:fixed;left:${kx}px;top:${ky}px;font-size:28px;z-index:1000019;pointer-events:none;animation:knifeSplat 0.4s ease-out forwards;`;
_ba(splat);
setTimeout(()=>splat.remove(),400);
let feathers=['🪶','🪶','🪶','⭐','✨'];
feathers.forEach((f,i)=>{
let fe=_ce('div');
fe.textContent=f;
let angle=_mr()*_pi*2;
let dist=30+_mr()*50;
let fx=Math.cos(angle)*dist,fy=Math.sin(angle)*dist;
let fr=(_mr()-0.5)*180;
fe.style.cssText=`position:fixed;left:${kx}px;top:${ky}px;font-size:${12+Math.random()*10}px;z-index:1000018;pointer-events:none;--fx:0px;--fy:0px;--fx2:${fx}px;--fy2:${fy}px;--fr:0deg;--fr2:${fr}deg;animation:knifeFeather 0.6s ease-out ${i*0.05}s forwards;`;
_ba(fe);
setTimeout(()=>fe.remove(),700);
});
let words=['✂️','snip!','bye!','poof!','gone!'];
let word=_ce('div');
word.textContent=words[_mf(_mr()*words.length)];
word.style.cssText=`position:fixed;left:${kx}px;top:${ky}px;font-size:14px;font-family:'Nunito',sans-serif;font-weight:900;color:#FF6B6B;z-index:1000021;pointer-events:none;animation:knifeText 0.7s ease-out forwards;white-space:nowrap;`;
_ba(word);
setTimeout(()=>word.remove(),700);
if(o.type==='Wolf'&&o.rage)_unlockAch('leader');if(o.type==='Dragon')_unlockAch('dragonslayer');if(o.type==='Yeti')_unlockAch('yetichaser');rem(o);ev.stopPropagation();
}if(mode==="vaccine"){if(o.type==="BabyZombie"){rem(o);return;}
_unlockAch('vaccinated');
if(o.infected||o._zombie){_vaccineCures++;if(_vaccineCures>=5)_unlockAch('doctorduck');}
o.immune=true;o.infected=false;o.inf=0;
if(o._zombie){
let zi=Zombies.indexOf(o);if(zi>-1)Zombies.splice(zi,1);
if(o._origArray)o._origArray.push(o);
o._zombie=false;
o.el.textContent=o._origEmoji||o.el.textContent;
o.el.style.filter=o._origFilter||'drop-shadow(0 0 6px cyan)';
if(o._origOnclick)o.el.onclick=o._origOnclick;
} else {
o._zombie=false;
o.el.textContent=o._origEmoji||o.el.textContent;
o.el.style.filter='drop-shadow(0 0 6px cyan)';
}
o.el.style.animation='';
let sh=_ce('div');sh.textContent='💉';sh.style.cssText=`position:fixed;left:${o.x}px;top:${o.y}px;font-size:20px;z-index:1000021;pointer-events:none;transition:transform .5s,opacity .5s;`;_ba(sh);_raf(()=>{sh.style.transform='translateY(-28px)';sh.style.opacity='0';});setTimeout(()=>sh.remove(),500);
ev.stopPropagation();
}
if(mode==="disease"&&!o.infected&&!o.immune){
infect(o,window.virusType);_unlockAch('pazero');
let bh=_ce('div');bh.textContent='☣️';
bh.style.cssText=`position:fixed;left:${ev.clientX}px;top:${ev.clientY}px;font-size:28px;z-index:1000021;pointer-events:none;transform:translate(-50%,-50%);transition:transform .4s ease,opacity .4s ease;`;
_ba(bh);
_raf(()=>{bh.style.transform='translate(-50%,-50%) scale(1.8) rotate(30deg)';bh.style.opacity='0';});
setTimeout(()=>bh.remove(),400);
ev.stopPropagation()
}};arr.push(o);return o}function move(o,extraMult){
if(paused||o._sleeping)return;
let ws=weatherSpeedMult()*(extraMult||1);
if(BEACON&&o.type!=="Egg"){
let dx=BEACON.x-o.x,dy=BEACON.y-o.y,bd=Math.hypot(dx,dy);
if(bd<38){
let orbitAngle=Math.atan2(dy,dx)+_pi/2;
o.a=orbitAngle+Math.sin(now*0.004+o.born*0.001)*0.8;
} else {
o.a=Math.atan2(dy,dx);
}
}
const WALL=60,W=innerWidth,H=innerHeight;
if(!BEACON){
let ax=0,ay=0;
if(o.x<WALL)ax+=(WALL-o.x)/WALL;
if(o.x>W-WALL)ax-=(WALL-(W-o.x))/WALL;
if(o.y<WALL)ay+=(WALL-o.y)/WALL;
if(o.y>H-WALL)ay-=(WALL-(H-o.y))/WALL;
if(ax!==0||ay!==0){
let ta=Math.atan2(Math.sin(o.a)+ay*0.6,Math.cos(o.a)+ax*0.6);
o.a=ta;
}
}
o.x+=Math.cos(o.a)*o.s*speed*ws;
o.y+=Math.sin(o.a)*o.s*speed*ws;
if(o.x<PAD){o.x=PAD;o.a=_pi-o.a;}
else if(o.x>W-PAD){o.x=W-PAD;o.a=_pi-o.a;}
if(o.y<PAD){o.y=PAD;o.a=-o.a;}
else if(o.y>H-PAD){o.y=H-PAD;o.a=-o.a;}
o.el.style.left=o.x+"px";o.el.style.top=o.y+"px";
}let _totalInfected=0;
function infect(o,vtype){
if(o._zombie&&vtype!=='zombie')return;if(o.type==='BabyZombie')return;
if(o.immune||o.type==='Dragon'||o.type==='BabyDragon'||o.type==='DragonEgg')return;
if(o.virusType==='zombie')return;
_totalInfected++;
o.infected=true;o.inf=Date.now();o.last=0;o.virusType=vtype||window.virusType||'normal';
if(!_gi('dl-disease-style')){
let ds=_ce('style');ds.id='dl-disease-style';
ds.textContent=`
@keyframes infectPop{0%{transform:translate(-50%,-50%) scale(0);opacity:1}60%{transform:translate(-50%,-50%) scale(1.4)}100%{transform:translate(-50%,-50%) scale(1.1);opacity:0}}
@keyframes infectFloat{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-5px)}}
@keyframes infectPulse{0%,100%{filter:drop-shadow(0 0 6px #39ff14) drop-shadow(0 0 2px #00ff88)}50%{filter:drop-shadow(0 0 14px #39ff14) drop-shadow(0 0 6px #00ff88) brightness(1.15)}}
@keyframes infectSpore{0%{opacity:1;transform:translate(var(--sx),var(--sy)) scale(1)}100%{opacity:0;transform:translate(var(--sx2),var(--sy2)) scale(0)}}
@keyframes infectRing{0%{transform:translate(-50%,-50%) scale(0.5);opacity:0.8}100%{transform:translate(-50%,-50%) scale(2.5);opacity:0}}
`;
document.head.appendChild(ds);
}
o.el.style.animation='infectPulse 1.4s ease-in-out infinite';
let ring=_ce('div');
ring.style.cssText=`position:fixed;left:${o.x+12}px;top:${o.y+12}px;width:30px;height:30px;border-radius:50%;border:3px solid #39ff14;z-index:1000019;pointer-events:none;animation:infectRing 0.5s ease-out forwards;`;
_ba(ring);
setTimeout(()=>ring.remove(),500);
let pop=_ce('div');
pop.textContent='🦠';
pop.style.cssText=`position:fixed;left:${o.x+12}px;top:${o.y+12}px;font-size:22px;z-index:1000020;pointer-events:none;animation:infectPop 0.5s ease-out forwards;`;
_ba(pop);
setTimeout(()=>pop.remove(),500);
for(let i=0;i<4;i++){
let sp=_ce('div');
sp.textContent='💚';
let a=_mr()*_pi*2,d=20+_mr()*35;
sp.style.cssText=`position:fixed;left:${o.x+12}px;top:${o.y+12}px;font-size:10px;z-index:1000018;pointer-events:none;--sx:0px;--sy:0px;--sx2:${Math.cos(a)*d}px;--sy2:${Math.sin(a)*d}px;animation:infectSpore 0.7s ease-out ${i*0.07}s forwards;`;
_ba(sp);
setTimeout(()=>sp.remove(),800);
}
}function updateDisease(){
let all=[...Ducks,...Babies,...BabySwans,...Swans,...Dragons,...BabyDragons,...Snakes,...Foxes,...Wolves,...Bears,...Lions,...Eggs],count=0;
all.forEach(o=>{
if(!o.infected)return;
count++;
let vt=o.virusType||'normal';
let myDR=vt==='fast'?DR*2:DR;
let myDS=vt==='fast'?DS*0.45:DS;
let myDT=vt==='fast'?DT*0.7:DT;
if(vt==='zombie'){
if(!o._zombie){
o._zombie=true;
o._origEmoji=o.el.textContent;
o._origFilter=o.el.style.filter||'';
o._origOnclick=o.el.onclick;
let arrays=[Ducks,Babies,BabySwans,Swans,Dragons,BabyDragons,Foxes,Snakes,Wolves,Bears,Lions,Eagles,Bats,Aliens];
for(let arr of arrays){let i=arr.indexOf(o);if(i>-1){o._origArray=arr;arr.splice(i,1);break;}}
Zombies.push(o);
o.el.textContent='🧟';
o.el.style.filter='brightness(0.7) sepia(0.5) hue-rotate(80deg)';
if(Zombies.length>=10)_unlockAch('zombie_apoc');
}
return;
}
if(vt!=='zombie'&&Date.now()-o.inf>myDT/speed){
let skull=_ce('div');
skull.textContent='☠️';
skull.style.cssText=`position:fixed;left:${o.x}px;top:${o.y}px;font-size:22px;z-index:1000020;pointer-events:none;transition:transform .6s ease,opacity .6s ease;`;
_ba(skull);
_raf(()=>{skull.style.transform='translateY(-30px) scale(1.3)';skull.style.opacity='0';});
setTimeout(()=>skull.remove(),600);
rem(o);
return;
}
if(Date.now()-o.last>myDS/speed){
o.last=Date.now();
all.forEach(t=>{
if(!t.infected&&!t.immune&&dist(o,t)<myDR){
let arc=_ce('div');
arc.textContent=vt==='zombie'?'🧟':vt==='fast'?'⚡':'🧫';
arc.style.cssText=`position:fixed;left:${o.x+12}px;top:${o.y+12}px;font-size:12px;z-index:1000017;pointer-events:none;transition:left .35s ease,top .35s ease,opacity .35s ease;`;
_ba(arc);
_raf(()=>{arc.style.left=t.x+12+'px';arc.style.top=t.y+12+'px';});
setTimeout(()=>{arc.style.opacity='0';},250);
setTimeout(()=>arc.remove(),400);
infect(t,vt);
}
});
}
});
if(count>=1000)_unlockAch('blackdeath');
return count;
}
(()=>{
let st=_ce('style');
st.textContent=`
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;900&display=swap');
:root{--pastel-yellow:#4a3800;--pastel-pink:#4a0020;--pastel-blue:#0a1a3a;--pastel-green:#0a2a0a;--pastel-purple:#220a3a;--pastel-orange:#3a1400;--pastel-red:#3a0000;}
@keyframes dockIn{from{transform:translateX(-50%) translateY(100%);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}
@keyframes statsIn{from{transform:translateY(-12px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes activeWobble{0%,100%{transform:translateY(-5px) scale(1.08) rotate(-3deg)}50%{transform:translateY(-5px) scale(1.12) rotate(3deg)}}
@keyframes beaconPulse{0%{transform:translate(-50%,-50%) scale(1);opacity:0.7}100%{transform:translate(-50%,-50%) scale(2.8);opacity:0}}
@keyframes beaconFloat{0%,100%{transform:translateX(-50%) translateY(0px)}50%{transform:translateX(-50%) translateY(-6px)}}
@keyframes beaconBeam{0%,100%{opacity:0.5;height:40px}50%{opacity:1;height:55px}}
@keyframes dragonBadgeFire{0%,100%{text-shadow:0 0 4px #ff6600,0 0 8px #ff4400;}50%{text-shadow:0 0 10px #ffaa00,0 0 20px #ff6600,0 0 30px #ff2200;}}
@keyframes secretShine{0%{background-position:200% center}100%{background-position:-200% center}}@keyframes knifeSlash{0%{transform:translate(-50%,-50%) rotate(-40deg) scale(0.6);opacity:1}60%{transform:translate(-50%,-50%) rotate(15deg) scale(1.2);opacity:1}100%{transform:translate(-50%,-50%) rotate(30deg) scale(0.8);opacity:0}}
@keyframes knifeSplat{0%{transform:translate(-50%,-50%) scale(0);opacity:1}60%{transform:translate(-50%,-50%) scale(1.3);opacity:0.9}100%{transform:translate(-50%,-50%) scale(1.8);opacity:0}}
@keyframes knifeFeather{0%{opacity:1;transform:translate(var(--fx),var(--fy)) rotate(var(--fr)) scale(1)}100%{opacity:0;transform:translate(var(--fx2),var(--fy2)) rotate(var(--fr2)) scale(0.3)}}
@keyframes knifeText{0%{opacity:1;transform:translate(-50%,-120%) scale(1)}100%{opacity:0;transform:translate(-50%,-220%) scale(0.8)}}@keyframes alienGlow{0%,100%{text-shadow:0 0 4px #00ff44,0 0 8px #00cc33;}50%{text-shadow:0 0 10px #00ff88,0 0 20px #00ff44,0 0 30px #00cc22;}}
@keyframes infectPop{0%{transform:translate(-50%,-50%) scale(0);opacity:1}60%{transform:translate(-50%,-50%) scale(1.4)}100%{transform:translate(-50%,-50%) scale(1.1);opacity:0}}
@keyframes infectFloat{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-5px)}}
@keyframes infectPulse{0%,100%{filter:drop-shadow(0 0 6px #39ff14) drop-shadow(0 0 2px #00ff88)}50%{filter:drop-shadow(0 0 14px #39ff14) drop-shadow(0 0 6px #00ff88) brightness(1.15)}}
@keyframes infectSpore{0%{opacity:1;transform:translate(var(--sx),var(--sy)) scale(1)}100%{opacity:0;transform:translate(var(--sx2),var(--sy2)) scale(0)}}
@keyframes infectRing{0%{transform:translate(-50%,-50%) scale(0.5);opacity:0.8}100%{transform:translate(-50%,-50%) scale(2.5);opacity:0}}
.ck-dock{position:fixed;bottom:0;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:stretch;background:rgba(14,15,28,0.98);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);border-radius:20px 20px 0 0;box-shadow:0 -2px 32px rgba(0,0,0,0.6),0 -1px 0 rgba(255,255,255,0.06);z-index:1000002;border-top:1.5px solid rgba(255,255,255,0.1);width:min(520px,100vw);max-width:100vw;}
.ck-dock-tabs{display:flex;padding:6px 6px 0;gap:2px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;flex-shrink:0;}
.ck-dock-tabs::-webkit-scrollbar{display:none;}
.ck-dock-tab{flex:1;min-width:44px;padding:5px 2px 4px;border-radius:10px 10px 0 0;cursor:pointer;text-align:center;font-size:8.5px;font-weight:900;color:rgba(255,255,255,0.28);font-family:'Nunito',sans-serif;transition:background .15s,color .15s;user-select:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent;white-space:nowrap;letter-spacing:0.2px;}
.ck-dock-tab .ck-tab-icon{font-size:14px;display:block;margin-bottom:1px;line-height:1;}
.ck-dock-tab.active{background:rgba(255,255,255,0.1);color:#fff;border-top:1.5px solid rgba(255,255,255,0.18);}
.ck-dock-page{display:none;flex-direction:row;flex-wrap:wrap;gap:6px;padding:6px 8px 12px;justify-content:flex-start;}
.ck-dock-page.active{display:flex;}
.ck-dock-section{display:contents;}
.ck-btn{display:flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer;padding:3px 2px 2px;border-radius:11px;transition:transform 0.13s cubic-bezier(.34,1.56,.64,1),background 0.13s;user-select:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent;min-width:46px;font-family:'Nunito',sans-serif;}
.ck-btn:active{transform:scale(0.86)!important;}
.ck-btn .ck-icon{font-size:19px;width:34px;height:34px;border-radius:11px;display:flex;align-items:center;justify-content:center;transition:box-shadow 0.13s,transform 0.13s;box-shadow:0 2px 8px rgba(0,0,0,0.4),0 1px 0 rgba(255,255,255,0.06);}
.ck-btn .ck-label{font-size:8px;font-weight:800;color:rgba(255,255,255,0.4);letter-spacing:0.15px;font-family:'Nunito',sans-serif;}
.ck-btn:hover .ck-icon{transform:translateY(-3px);box-shadow:0 6px 16px rgba(0,0,0,0.4);}
.ck-btn.ck-active .ck-icon{box-shadow:0 0 0 2.5px rgba(255,255,255,0.2),0 0 0 5px rgba(255,255,255,0.07),0 6px 18px rgba(0,0,0,0.5);transform:translateY(-6px) scale(1.1);}
.ck-btn.ck-active .ck-label{color:rgba(255,255,255,0.85);}
.ck-stats{background:rgba(12,13,26,0.97);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.55),0 1px 0 rgba(255,255,255,0.07);border:1.5px solid rgba(255,255,255,0.1);font-family:'Nunito',sans-serif;font-size:11px;font-weight:700;color:#ccc;z-index:1000003;min-width:96px;max-width:140px;overflow:hidden;cursor:grab;}
.ck-stats-head{padding:8px 12px 7px;background:rgba(26,28,50,0.98);font-size:12px;font-weight:900;display:flex;justify-content:space-between;align-items:center;cursor:grab;color:#fff;border-bottom:1px solid rgba(255,255,255,0.07);}
.ck-stats-body{padding:8px 12px 10px;line-height:1.75;transition:opacity 0.2s ease;color:rgba(255,255,255,0.65);}
.ck-divider{height:1px;background:rgba(255,255,255,0.06);margin:5px 0;}
@keyframes eggWobble{0%,100%{transform:rotate(-4deg) scale(1)}25%{transform:rotate(4deg) scale(1.05)}50%{transform:rotate(-2deg) scale(1)}75%{transform:rotate(3deg) scale(1.04)}}
@keyframes eggGlow{0%,100%{filter:drop-shadow(0 2px 6px rgba(255,220,100,0.5))}50%{filter:drop-shadow(0 4px 14px rgba(255,220,100,0.9)) brightness(1.1)}}
@keyframes eggCrack{0%{transform:scale(1) rotate(0deg)}30%{transform:scale(1.15) rotate(-8deg)}60%{transform:scale(1.1) rotate(8deg)}100%{transform:scale(0) rotate(20deg);opacity:0}}
@keyframes hatchBurst{0%{transform:translate(-50%,-50%) scale(0);opacity:1}100%{transform:translate(-50%,-50%) scale(2.5);opacity:0}}
@keyframes hatchPiece{0%{opacity:1;transform:translate(0,0) rotate(0deg) scale(1)}100%{opacity:0;transform:translate(var(--hx),var(--hy)) rotate(var(--hr)) scale(0.3)}}
@keyframes eggSpawnPop{0%{transform:scale(0) rotate(-20deg);opacity:0}60%{transform:scale(1.3) rotate(5deg);opacity:1}100%{transform:scale(1) rotate(0deg);opacity:1}}
`;
document.head.appendChild(st);
window.popBox=_ce('div');
window.popBox.className='ck-stats';
let _achBtn=_ce('div');
_achBtn.textContent='🏆';
_achBtn.style.cssText='width:34px;height:34px;border-radius:50%;background:rgba(22,24,42,0.95);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 2px 10px rgba(0,0,0,0.4);border:1.5px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;user-select:none;flex-shrink:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
_achPanel=_ce('div');
_achPanel.style.cssText='position:fixed;top:52px;right:8px;width:min(260px,calc(100vw - 16px));max-height:65vh;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;background:rgba(22,24,42,0.98);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-radius:18px;padding:12px;box-shadow:0 4px 24px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.07);z-index:1000026;display:none;opacity:0;transform:translateY(-8px) scale(0.97);transition:opacity .2s ease,transform .2s ease;';
_ba(_achPanel);
_achBtn.addEventListener('click',e=>{e.stopPropagation();_toggleAchPanel();});
_achBtn.addEventListener('touchend',e=>{e.preventDefault();e.stopPropagation();_toggleAchPanel();});
document.addEventListener('click',e=>{if(_achPanelOpen&&!_achPanel.contains(e.target)&&e.target!==_achBtn){_achPanelOpen=false;_achPanel.style.opacity='0';_achPanel.style.transform='translateY(-8px) scale(0.97)';setTimeout(()=>{if(!_achPanelOpen)_achPanel.style.display='none';},200);}});
let _pbCtrl=_ce('div');
_pbCtrl.style.cssText='display:flex;flex-direction:row;gap:6px;';
let _pauseBtn=_ce('div');
_pauseBtn.textContent='⏸️';
_pauseBtn.style.cssText='width:36px;height:36px;border-radius:50%;background:rgba(14,15,28,0.97);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:0 3px 14px rgba(0,0,0,0.55),0 1px 0 rgba(255,255,255,0.07);border:1.5px solid rgba(255,255,255,0.11);display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;user-select:none;transition:transform .15s,box-shadow .15s;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
_pauseBtn.addEventListener('click',e=>{e.stopPropagation();window.paused=!window.paused;_pauseBtn.textContent=window.paused?'▶️':'⏸️';_pauseBtn.style.background=window.paused?'rgba(60,100,200,0.9)':'rgba(22,24,42,0.95)';if(window.paused)_unlockAch('shhh');});
_pauseBtn.addEventListener('touchend',e=>{e.preventDefault();e.stopPropagation();window.paused=!window.paused;_pauseBtn.textContent=window.paused?'▶️':'⏸️';_pauseBtn.style.background=window.paused?'rgba(60,100,200,0.9)':'rgba(22,24,42,0.95)';if(window.paused)_unlockAch('shhh');});
_pbCtrl.appendChild(_pauseBtn);
let _speedBtn=_ce('div');
_speedBtn.textContent='1×';
_speedBtn.style.cssText='height:36px;padding:0 11px;border-radius:18px;background:rgba(14,15,28,0.97);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:0 3px 14px rgba(0,0,0,0.55),0 1px 0 rgba(255,255,255,0.07);border:1.5px solid rgba(255,255,255,0.11);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;font-family:Nunito,sans-serif;cursor:pointer;user-select:none;color:rgba(255,255,255,0.6);transition:transform .15s,box-shadow .15s;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
const _cycleSpeed=e=>{e.stopPropagation();if(window.speed===1){window.speed=2;_speedBtn.textContent='2×';_speedBtn.style.background='rgba(80,120,220,0.9)';_speedBtn.style.color='#fff';}else if(window.speed===2){window.speed=4;_speedBtn.textContent='4×';_unlockAch('needforspeed');_speedBtn.style.background='rgba(220,120,20,0.9)';_speedBtn.style.color='#fff';}else{window.speed=1;_speedBtn.textContent='1×';_speedBtn.style.background='rgba(22,24,42,0.95)';_speedBtn.style.color='#ccc';}};
_speedBtn.addEventListener('click',_cycleSpeed);
_speedBtn.addEventListener('touchend',e=>{e.preventDefault();_cycleSpeed(e);});
_pbCtrl.appendChild(_speedBtn);
let _topRight=_ce('div');
_topRight.style.cssText='position:fixed;top:8px;right:8px;display:flex;flex-direction:row;align-items:flex-start;gap:4px;z-index:1000025;animation:statsIn 0.4s cubic-bezier(.34,1.56,.64,1);max-width:calc(100vw - 16px);';
_topRight.appendChild(_achBtn);
_topRight.appendChild(_pbCtrl);
_topRight.appendChild(window.popBox);
_ba(_topRight);
let statsHead=_ce('div');
statsHead.className='ck-stats-head';
statsHead.innerHTML='<span>🦆 Pond</span><span id="ck-arr">▾</span>';
window.popBox.appendChild(statsHead);
window.popContent=_ce('div');
window.popContent.className='ck-stats-body';
window.popBox.appendChild(window.popContent);
window.popCollapsed=false;
statsHead.onclick=()=>{
window.popCollapsed=!window.popCollapsed;
window.popContent.style.display=window.popCollapsed?'none':'block';
_gi('ck-arr').textContent=window.popCollapsed?'▸':'▾';
};
let dockCollapsed=false;
let dock=_ce('div');
dock.className='ck-dock';
dock.style.animation='dockIn 0.5s cubic-bezier(.34,1.56,.64,1)';
_ba(dock);
let _infoBtn={onclick:null,style:{}};
let _infoModal=_ce('div');
_infoModal.id='ck-info-modal';_infoModal.style.cssText='display:none;position:fixed;inset:0;z-index:1000050;background:rgba(0,0,0,0.7);align-items:center;justify-content:center;padding:12px;';
_infoModal.innerHTML=`<div id="ck-info-box" style="background:#1a1c2e;border-radius:18px;width:min(460px,calc(100vw - 20px));max-height:min(86vh,calc(100svh - 20px));overflow:hidden;position:relative;display:flex;flex-direction:column;box-shadow:0 16px 48px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.07);font-family:'Nunito',sans-serif;">
<style>
#ck-info-box,#ck-info-box *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
#ck-info-header{display:flex;align-items:center;justify-content:space-between;padding:13px 14px 0;flex-shrink:0;}
#ck-info-title{font-size:15px;font-weight:900;color:#fff;}
#ck-info-title em{font-style:normal;color:#f5e642;}
#ck-info-close{background:rgba(255,255,255,0.08);border:none;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:12px;cursor:pointer;color:rgba(255,255,255,0.5);transition:background .15s;touch-action:manipulation;}
#ck-info-close:hover{background:rgba(255,255,255,0.15);color:#fff;}
#ck-info-tabs{display:flex;padding:10px 10px 0;flex-shrink:0;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid rgba(255,255,255,0.07);gap:2px;}
#ck-info-tabs::-webkit-scrollbar{display:none;}
.ck-itab{padding:6px 10px;font-size:11px;font-weight:800;cursor:pointer;color:rgba(255,255,255,0.3);white-space:nowrap;user-select:none;border-radius:7px 7px 0 0;border-bottom:2px solid transparent;margin-bottom:-1px;transition:color .15s;touch-action:manipulation;flex-shrink:0;}
.ck-itab.active{color:#f5e642;border-bottom-color:#f5e642;}
.ck-itab:hover{color:rgba(255,255,255,0.7);}
#ck-info-body{overflow-y:auto;-webkit-overflow-scrolling:touch;flex:1;padding:12px 12px 16px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.15) transparent;}
#ck-info-body::-webkit-scrollbar{width:4px;}
#ck-info-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:4px;}
.ck-isection{display:none;}.ck-isection.active{display:block;}
.ck-icard{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:10px 12px;margin-bottom:8px;}
.ck-icard-title{font-size:10px;font-weight:900;color:#f5e642;letter-spacing:.08em;text-transform:uppercase;margin-bottom:7px;}
.ck-irow{display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.06);}
.ck-irow:last-child{border-bottom:none;}
.ck-irow-icon{font-size:16px;flex-shrink:0;width:20px;text-align:center;line-height:1.4;}
.ck-irow-text{font-size:12px;color:rgba(255,255,255,0.55);line-height:1.4;}
.ck-irow-text b{color:rgba(255,255,255,0.9);font-weight:700;}
.ck-diff-row{display:flex;align-items:center;gap:8px;padding:6px 9px;border-radius:8px;cursor:pointer;margin-bottom:4px;border:1px solid rgba(255,255,255,0.06);touch-action:manipulation;}
.ck-diff-label{font-size:10px;font-weight:900;padding:2px 7px;border-radius:6px;flex-shrink:0;}
.ck-diff-desc{font-size:11px;color:rgba(255,255,255,0.5);}
.ck-quote{background:rgba(255,255,255,0.04);border-left:3px solid #f5e642;padding:8px 11px;margin-bottom:6px;border-radius:0 8px 8px 0;}
.ck-quote-text{font-size:11px;color:rgba(255,255,255,0.6);font-style:italic;margin-bottom:3px;}
.ck-quote-author{font-size:11px;font-weight:800;color:#fff;cursor:pointer;}
.ck-quote-role{font-size:10px;color:rgba(255,255,255,0.3);margin-left:4px;font-weight:600;}
.ck-hotkey{display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.06);gap:6px;}
.ck-hotkey:last-child{border-bottom:none;}
.ck-key{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-bottom:2px solid rgba(255,255,255,0.2);border-radius:5px;padding:2px 7px;font-size:10px;font-weight:700;color:rgba(255,255,255,0.7);font-family:monospace;white-space:nowrap;flex-shrink:0;}
.ck-hotkey-desc{font-size:11px;color:rgba(255,255,255,0.5);}
.ck-secret-panel{border-radius:11px;padding:10px 12px;margin-bottom:8px;}
#ck-scroll-fade{background:linear-gradient(transparent,rgba(26,28,46,0.97))!important;}
</style>
<div id="ck-info-header">
<div id="ck-info-title">🦆 Duck <em>Sandbox</em></div>
<button id="ck-info-close" onclick="document.getElementById('ck-info-modal').style.display='none'">✕</button>
</div>
<div id="ck-scroll-fade" style="position:absolute;bottom:0;left:0;right:0;height:52px;background:linear-gradient(transparent,rgba(26,28,46,0.97));pointer-events:none;z-index:10;display:flex;align-items:flex-end;justify-content:center;padding-bottom:6px;border-radius:0 0 18px 18px;transition:opacity .3s;"><span style="font-size:11px;font-weight:800;color:rgba(255,255,255,0.25);letter-spacing:0.5px;">scroll ↓</span></div>
<div id="ck-info-tabs">
<div class="ck-itab active" data-tab="guide">📖 Guide</div>
<div class="ck-itab" data-tab="creatures">🐾 Creatures</div>
<div class="ck-itab" data-tab="tools">🛠️ Tools</div>
<div class="ck-itab" data-tab="weather">🌦️ Weather</div>
<div class="ck-itab" data-tab="disasters">🌋 Disasters</div>
<div class="ck-itab" data-tab="secret">🐉👽🧊 Special</div>
<div class="ck-itab" data-tab="codes">🔑 Codes</div>
</div>
<div id="ck-info-body">
<div class="ck-isection active" data-section="guide">
<div class="ck-icard">
<div class="ck-icard-title">🦆 What is this?</div>
<p style="margin:0;font-size:11px;color:rgba(255,255,255,0.5);line-height:1.7;">A duck life sandbox. Ducks breed, predators hunt, disasters strike and diseases spread. Spawn animals, trigger events, arm tools and try to unlock every achievement!</p>
</div>
<div class="ck-icard">
<div class="ck-icard-title">⌨️ Controls</div>
<div class="ck-hotkey"><span class="ck-hotkey-desc">Cancel active tool / clear beacon</span><span class="ck-key">E</span></div>
<div class="ck-hotkey"><span class="ck-hotkey-desc">Pause / unpause</span><span class="ck-key">Space</span></div>
<div class="ck-hotkey"><span class="ck-hotkey-desc">Dismiss tornado / blackhole / zeus</span><span class="ck-key">2-finger tap</span></div>
<div class="ck-hotkey"><span class="ck-hotkey-desc">Hide everything (boss mode)</span><span class="ck-key">Tiny dot ↘</span></div>
</div>
</div>
<div class="ck-isection" data-section="creatures">
<div class="ck-icard">
<div class="ck-icard-title">🦆 Ducks &amp; Birds</div>
<div class="ck-irow"><div class="ck-irow-icon">🥚</div><div class="ck-irow-text"><b>Egg</b> — hatches based on type. Snakes hunt them</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🐥</div><div class="ck-irow-text"><b>Duckling</b> — grows into a duck. Foxes hunt ducklings</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🦆</div><div class="ck-irow-text"><b>Duck</b> — breeds over time. Hunted by wolves and bears</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🐣</div><div class="ck-irow-text"><b>Baby Swan</b> — grows into a swan. Not hunted by anyone</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🦢</div><div class="ck-irow-text"><b>Swan</b> — hunts foxes, snakes, wolves and zombies</div></div>
</div>
<div class="ck-icard">
<div class="ck-icard-title">🦊 Predators</div>
<div class="ck-irow"><div class="ck-irow-icon">🦊</div><div class="ck-irow-text"><b>Fox</b> — hunts ducklings only. Hunted by bears and swans</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🐍</div><div class="ck-irow-text"><b>Snake</b> — hunts eggs only. Hunted by swans</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🐺</div><div class="ck-irow-text"><b>Wolf</b> — hunts adult ducks. Can be enraged. Hunted by swans</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🐻</div><div class="ck-irow-text"><b>Bear</b> — hunts ducks and foxes. Slow but tough</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🦁</div><div class="ck-irow-text"><b>Lion</b> — pounces every 6s for a burst of speed. Hunts widely</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🧊</div><div class="ck-irow-text"><b>Yeti</b> — 1% chance to appear every 15s. Invisible until close. Leaves frost trails that slow entities. Stomps in a 140px radius then vanishes</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🦅</div><div class="ck-irow-text"><b>Eagle</b> — dives fast and snatches ducklings. Has a cooldown between strikes</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🦇</div><div class="ck-irow-text"><b>Bat</b> — infects entities with disease on contact. Much faster at night</div></div>
</div>
<div class="ck-icard">
<div class="ck-icard-title">🐉 Dragons</div>
<div class="ck-irow"><div class="ck-irow-icon">🥚</div><div class="ck-irow-text"><b>Dragon Egg</b> — rare auto-spawn. Immune to all disasters. Unlock via secret egg</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🐲</div><div class="ck-irow-text"><b>Baby Dragon</b> — grows into an adult</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🐉</div><div class="ck-irow-text"><b>Dragon</b> — immune to everything. Only 🔪 can kill one. Rage it to breathe fire!</div></div>
</div>
<div class="ck-icard">
<div class="ck-icard-title">👽 Aliens</div>
<div class="ck-irow"><div class="ck-irow-icon">🛸</div><div class="ck-irow-text"><b>UFO</b> — random chance every 10s. Abducts a duck, drops an alien</div></div>
<div class="ck-irow"><div class="ck-irow-icon">👽</div><div class="ck-irow-text"><b>Alien</b> — kills most entities on contact. Dies to 🔪 knife or 🌊 flood only</div></div>
</div>
<div class="ck-icard">
<div class="ck-icard-title">🧟 Infected</div>
<div class="ck-irow"><div class="ck-irow-icon">🦠</div><div class="ck-irow-text"><b>Infected entity</b> — spreads disease on contact. Dies after a while</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🧟</div><div class="ck-irow-text"><b>Zombie</b> — actively hunts other entities. Killed by swans</div></div>
</div>
</div>
<div class="ck-isection" data-section="tools">
<div class="ck-icard">
<div class="ck-icard-title">🥚 Eggs Tab</div>
<div class="ck-irow"><div class="ck-irow-icon">🥚</div><div class="ck-irow-text"><b>7 egg types</b> — Duck, Swan, Fox, Snake, Wolf, Bear, Lion</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🔒</div><div class="ck-irow-text"><b>Dragon egg</b> — locked. Unlock all 5 dragon achievements to reveal it</div></div>
</div>
<div class="ck-icard">
<div class="ck-icard-title">🦠 Virus Tab</div>
<div class="ck-irow"><div class="ck-irow-icon">🦠</div><div class="ck-irow-text"><b>Disease</b> — standard infection. Spreads on contact, kills over time</div></div>
<div class="ck-irow"><div class="ck-irow-icon">⚡</div><div class="ck-irow-text"><b>Fast</b> — spreads much more rapidly than normal disease</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🧟</div><div class="ck-irow-text"><b>Zombie</b> — infected entities become zombies that hunt others</div></div>
<div class="ck-irow"><div class="ck-irow-icon">💉</div><div class="ck-irow-text"><b>Vaccine</b> — tap entities to immunise them permanently</div></div>
</div>
<div class="ck-icard">
<div class="ck-icard-title">🛠️ Other Tab</div>
<div class="ck-irow"><div class="ck-irow-icon">📍</div><div class="ck-irow-text"><b>Beacon</b> — all entities flock toward it. Press E to dismiss</div></div>
<div class="ck-irow"><div class="ck-irow-icon">💣</div><div class="ck-irow-text"><b>Bomb</b> — 5-second countdown wipe. Dragons are spared</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🕳️</div><div class="ck-irow-text"><b>Black Hole</b> — pulls everything in. Grows as it swallows. Dragons resist</div></div>
<div class="ck-irow"><div class="ck-irow-icon">😡</div><div class="ck-irow-text"><b>Rage</b> — enrages any entity. Dragons breathe fire when raged!</div></div>
<div class="ck-irow"><div class="ck-irow-icon">⚡</div><div class="ck-irow-text"><b>Zeus</b> — chain lightning jumping between up to 50 nearby entities</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🧲</div><div class="ck-irow-text"><b>Magnet</b> — tap anywhere to yank all entities to that point for 3s</div></div>
<div class="ck-irow"><div class="ck-irow-icon">💤</div><div class="ck-irow-text"><b>Sleep</b> — tap an entity to freeze it for 6 seconds with zzz animation</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🔪</div><div class="ck-irow-text"><b>Knife</b> — kills any entity. Only way to kill a dragon or alien</div></div>
<div class="ck-irow"><div class="ck-irow-icon">💥</div><div class="ck-irow-text"><b>Shockwave</b> — tap anywhere to blast all entities outward from that point</div></div>
<div class="ck-irow"><div class="ck-irow-icon">💀</div><div class="ck-irow-text"><b>Plague Bomb</b> — drops a disease cloud that infects all entities within range</div></div>
<div class="ck-irow"><div class="ck-irow-icon">✖️</div><div class="ck-irow-text"><b>Deselect</b> — clears the active tool</div></div>
</div>
</div>
<div class="ck-isection" data-section="weather">
<div class="ck-icard">
<div class="ck-icard-title">🌤️ Weather</div>
<div class="ck-irow"><div class="ck-irow-icon">☀️</div><div class="ck-irow-text"><b>Clear</b> — breed ×1.0 · hatch ×1.0 · speed ×1.0</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🌧️</div><div class="ck-irow-text"><b>Rain</b> — breed ×0.6 · hatch ×0.65 · speed ×1.15</div></div>
<div class="ck-irow"><div class="ck-irow-icon">⛈️</div><div class="ck-irow-text"><b>Storm</b> — breed ×0.8 · speed ×1.8 · random lightning strikes</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🔥</div><div class="ck-irow-text"><b>Drought</b> — breed ×1.7 · hatch ×1.6 · speed ×0.7</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🌫️</div><div class="ck-irow-text"><b>Fog</b> — breed ×0.9 · speed ×0.55 · very slow and eerie</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🥵</div><div class="ck-irow-text"><b>Heatwave</b> — breed ×2.2 · hatch ×2.0 · speed ×0.6 · population bomb risk</div></div>
<div class="ck-irow"><div class="ck-irow-icon">❄️</div><div class="ck-irow-text"><b>Blizzard</b> — breed ×0.3 · hatch ×0.2 · speed ×0.45 · slowly kills ducklings &amp; eggs</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🌈</div><div class="ck-irow-text"><b>Rainbow</b> — breed ×2.5 · hatch ×1.8 · speed ×1.1 · rare and beautiful</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🌑</div><div class="ck-irow-text"><b>Eclipse</b> — forces night stats for 40 seconds. Predators go wild</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🌿</div><div class="ck-irow-text"><b>Overgrowth</b> — ducks breed ×5 for 30 seconds. Population explosion</div></div>
</div>
<div class="ck-icard">
<div class="ck-icard-title">🌙 Day / Night Cycle</div>
<div class="ck-irow"><div class="ck-irow-icon">🌅</div><div class="ck-irow-text"><b>Dawn</b> — ducks ×1.1 speed · predators ×0.9</div></div>
<div class="ck-irow"><div class="ck-irow-icon">☀️</div><div class="ck-irow-text"><b>Day</b> — normal. Everything ×1.0</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🌆</div><div class="ck-irow-text"><b>Dusk</b> — ducks ×0.95 · predators ×1.1</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🌙</div><div class="ck-irow-text"><b>Night</b> — ducks ×0.7 · predators ×1.4 · predator spawn rate doubled!</div></div>
</div>
</div>
<div class="ck-isection" data-section="disasters">
<div class="ck-icard">
<div class="ck-icard-title">🌋 Manual Disasters</div>
<div class="ck-irow"><div class="ck-irow-icon">☄️</div><div class="ck-irow-text"><b>Meteor</b> — one large impact. Dragons immune</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🌌</div><div class="ck-irow-text"><b>Meteor Shower</b> — 4 meteors rain down across the screen</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🌋</div><div class="ck-irow-text"><b>Volcano</b> — erupts from a random edge, sprays lava blobs inward</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🌊</div><div class="ck-irow-text"><b>Flood</b> — rises to 45% screen height. Kills ducklings, eggs and aliens</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🌪️</div><div class="ck-irow-text"><b>Tornado</b> — place via Other tab. Bounces around for 8s flinging everything</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🛸</div><div class="ck-irow-text"><b>UFO Invasion</b> — 🔒 locked. Unlock all alien achievements to unleash 6 UFOs in waves</div></div>
<div class="ck-irow"><div class="ck-irow-icon">⚡</div><div class="ck-irow-text"><b>Thunderstorm</b> — 20 lightning strikes over 20 seconds. Dragons immune</div></div>
</div>
<div class="ck-icard">
<div class="ck-icard-title">🎲 Auto Events</div>
<div class="ck-irow"><div class="ck-irow-icon">⚡</div><div class="ck-irow-text"><b>Lightning</b> — strikes randomly during storms</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🦠</div><div class="ck-irow-text"><b>Natural Outbreak</b> — ~5% chance every 10s. Starts a random infection</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🛸</div><div class="ck-irow-text"><b>UFO Abduction</b> — ~1% chance every 10s. Abducts a random duck</div></div>
<div class="ck-irow"><div class="ck-irow-icon">🌋</div><div class="ck-irow-text"><b>Random disaster</b> — a meteor, volcano or flood auto-triggers every 40–90s</div></div>
</div>
</div>
<div class="ck-isection" data-section="secret">
<div class="ck-secret-panel" style="background:linear-gradient(135deg,#0d2b0d,#1a4a1a);border:1px solid #2d7a2d;" id="ck-dragon-info"></div>
<div class="ck-secret-panel" style="background:rgba(0,136,90,0.08);border:1px solid rgba(0,136,90,0.25);" id="ck-alien-info"></div>
<div class="ck-secret-panel" style="background:linear-gradient(135deg,#0a1a2a,#1a3a5a);border:1px solid #1a4a6a;" id="ck-yeti-info"></div>

<div class="ck-isection" data-section="codes"><div style="padding:12px 4px;font-size:12px;color:rgba(255,255,255,0.4);">Enter codes in the 🔑 Codes section of the main menu.</div></div>
</div>
</div>`;_ba(_infoModal);
// old codes handler removed
(function(){var _bd=_infoModal.querySelector('#ck-info-body'),_fd=_infoModal.querySelector('#ck-scroll-fade');if(_bd&&_fd){_bd.addEventListener('scroll',function(){var atBottom=_bd.scrollHeight-_bd.scrollTop-_bd.clientHeight<8;_fd.style.opacity=atBottom?'0':'1';});}})();
_gi('ck-info-tabs').onclick=function(e){
var t=e.target.closest('.ck-itab');
if(!t)return;
var box=_gi('ck-info-box');
box.querySelectorAll('.ck-itab').forEach(function(x){x.classList.remove('active');});
box.querySelectorAll('.ck-isection').forEach(function(x){x.classList.remove('active');});
t.classList.add('active');
var s=box.querySelector('[data-section="'+t.dataset.tab+'"]');
if(s)s.classList.add('active');
if(t.dataset.tab==='secret'&&typeof _populateSpecialPanels==='function')_populateSpecialPanels();
};
_infoBtn.onclick=()=>{
_infoModal.style.display='flex';
_populateSpecialPanels();
};
function _populateSpecialPanels(){
let _dp=_gi('ck-dragon-info');
if(_dp){
const _dUnlocked=window._achUnlocked&&window._achUnlocked.has('eyeofdragon');
if(_dUnlocked){
_dp.innerHTML=`<p style="margin:0 0 4px;font-size:13px;font-weight:900;color:#ff6600;text-shadow:0 0 8px #ff4400;">🐉 Eye of the Dragon</p><p style="margin:0 0 6px;font-size:12px;color:rgba(100,200,100,0.7);">Unlock every dragon achievement. The rarest of all.</p><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;"><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(100,180,100,0.1);color:#60cc60;border:1px solid rgba(100,180,100,0.3);">🐉 End of the Beginning</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(100,180,100,0.1);color:#60cc60;border:1px solid rgba(100,180,100,0.3);">🔥 The End?</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(100,180,100,0.1);color:#60cc60;border:1px solid rgba(100,180,100,0.3);">⚔️ Dragon Slayer</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(100,180,100,0.1);color:#60cc60;border:1px solid rgba(100,180,100,0.3);">🐲 FAHHHH</span></div><div style="cursor:pointer;text-align:center;font-size:12px;color:#ff6600;padding:5px;border:1px solid #3a6a3a;border-radius:8px;background:#0a1f0a;" onclick="if(window._confettiBurst)_confettiBurst(['#ff2200','#ff6600','#ffaa00','#ffdd00','#ff4400','#ff8800'])">🔥 Confetti</div>`;
} else {
_dp.innerHTML=`<p style="margin:0 0 4px;font-size:13px;font-weight:900;color:#ff6600;">🐉 Dragon Secrets</p><p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.35);">??? — unlock all four dragon achievements to reveal this.</p><div style="display:flex;gap:6px;flex-wrap:wrap;"><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.08);">???</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.08);">???</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.08);">???</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.08);">???</span></div>`;
}
}
let _ap=_gi('ck-alien-info');
if(_ap){
const _aUnlocked=window._achUnlocked&&window._achUnlocked.has('wearenotalone');
if(_aUnlocked){
_ap.innerHTML=`<p style="margin:0 0 4px;font-size:13px;font-weight:900;color:#00ff88;text-shadow:0 0 8px #00aa55;">👽 We Are Not Alone</p><p style="margin:0 0 6px;font-size:12px;color:rgba(0,255,136,0.6);">Unlock every alien achievement. They came. They saw. You witnessed it.</p><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;"><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(0,255,136,0.1);color:#00ff88;border:1px solid rgba(0,255,136,0.3);">🛸 First Contact</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(0,255,136,0.1);color:#00ff88;border:1px solid rgba(0,255,136,0.3);">🦆 They Took One</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(0,255,136,0.1);color:#00ff88;border:1px solid rgba(0,255,136,0.3);">🤝 We Come in Peace</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(0,255,136,0.1);color:#00ff88;border:1px solid rgba(0,255,136,0.3);">👁️ Close Encounter</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(0,255,136,0.1);color:#00ff88;border:1px solid rgba(0,255,136,0.3);">🔪 Alien Slayer</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(0,255,136,0.1);color:#00ff88;border:1px solid rgba(0,255,136,0.3);">🌊 Drowned Out</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(0,255,136,0.1);color:#00ff88;border:1px solid rgba(0,255,136,0.3);">🐉 Wrong Planet</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(0,255,136,0.1);color:#00ff88;border:1px solid rgba(0,255,136,0.3);">🛸 They're Here</span></div><div style="cursor:pointer;text-align:center;font-size:12px;color:#00ff88;padding:5px;border:1px solid rgba(0,255,136,0.3);border-radius:8px;background:rgba(0,255,136,0.08);" onclick="if(window._confettiBurst)_confettiBurst(['#00ff88','#00ffcc','#00ccff','#88ff00','#00ff44','#aaffcc'])">👽 Confetti</div>`;
} else {
_ap.innerHTML=`<p style="margin:0 0 4px;font-size:13px;font-weight:900;color:#00ff88;">👽 Alien Secrets</p><p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.4);">??? — unlock all alien achievements to reveal this.</p><div style="display:flex;gap:6px;flex-wrap:wrap;"><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.1);">???</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.1);">???</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.1);">???</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.1);">???</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.1);">???</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.1);">???</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.1);">???</span></div>`;
}
}
let _yp=_gi('ck-yeti-info');
if(_yp){
const _yAllUnlocked=window._achUnlocked&&window._achUnlocked.has('yetimaster');
if(_yAllUnlocked){
_yp.innerHTML=`<p style="margin:0 0 4px;font-size:13px;font-weight:900;color:#44ccee;text-shadow:0 0 8px #88ccee;">🧊 Snow Legend</p><p style="margin:0 0 6px;font-size:12px;color:rgba(68,204,238,0.6);">You witnessed the Yeti in all its fury. Few ever do.</p><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;"><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(68,170,204,0.15);color:#44aacc;border:1px solid rgba(68,170,204,0.4);">🧊 Did You See That?</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(68,170,204,0.15);color:#44aacc;border:1px solid rgba(68,170,204,0.4);">💥 The Ground Shook</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(68,170,204,0.15);color:#44aacc;border:1px solid rgba(68,170,204,0.4);">🌨️ Blizzard Feet</span></div><div style="cursor:pointer;text-align:center;font-size:12px;color:#44aacc;padding:5px;border:1px solid rgba(68,170,204,0.4);border-radius:8px;background:rgba(68,170,204,0.08);" onclick="if(window._confettiBurst)_confettiBurst(['#88eeff','#00ccff','#b8e8ff','#ffffff','#44bbdd','#00aacc'])">❄️ Confetti</div>`;
} else {
const _ySeen=window._achUnlocked&&window._achUnlocked.has('yetisighting');
_yp.innerHTML=`<p style="margin:0 0 4px;font-size:13px;font-weight:900;color:#44aacc;">🧊 Yeti Secrets</p><p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.4);">${_ySeen?'It was real. Keep watching...':'Something lurks in the cold. Has anyone actually seen it?'}</p><div style="display:flex;gap:6px;flex-wrap:wrap;"><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.1);">???</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.1);">???</span><span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.1);">???</span></div>`;
}
}
}
let dockCollapseBtn=_ce('div');
dockCollapseBtn.textContent='︽';
dockCollapseBtn.style.cssText='position:fixed;bottom:108px;left:50%;transform:translateX(-50%);z-index:1000010;background:rgba(22,24,42,0.95);backdrop-filter:blur(10px);border-radius:50px;width:44px;height:24px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:900;color:rgba(255,255,255,0.6);box-shadow:0 2px 12px rgba(0,0,0,0.4);cursor:pointer;user-select:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent;border:1.5px solid rgba(255,255,255,0.08);';
_ba(dockCollapseBtn);
function toggleDock(){
dockCollapsed=!dockCollapsed;
dock.style.transition='transform 0.3s cubic-bezier(.34,1.56,.64,1)';
dock.style.transform=dockCollapsed?'translateX(-50%) translateY(110%)':'translateX(-50%) translateY(0%)';
dockCollapseBtn.textContent=dockCollapsed?'︾':'︽';
dockCollapseBtn.style.bottom=dockCollapsed?'12px':'100px';
if(dockCollapsed){mode=null;if(typeof activeBtn!=='undefined'&&activeBtn){activeBtn.classList.remove('ck-active');activeBtn=null;}}
}
dockCollapseBtn.addEventListener('click',e=>{e.stopPropagation();toggleDock();});
dockCollapseBtn.addEventListener('touchend',e=>{e.preventDefault();e.stopPropagation();toggleDock();});
let dockMoved=false;
let activeBtn=null;
function mkBtn(emoji,label,bg,onclick){
let b=_ce('div');b.className='ck-btn';
let icon=_ce('div');icon.className='ck-icon';icon.style.background=bg;icon.textContent=emoji;
let lbl=_ce('div');lbl.className='ck-label';lbl.textContent=label;
b.appendChild(icon);b.appendChild(lbl);
let btnMoved=false,btnStartX=0,btnStartY=0;
b.addEventListener('touchstart',e=>{btnMoved=false;btnStartX=e.touches[0].clientX;btnStartY=e.touches[0].clientY;},{passive:true});
b.addEventListener('touchmove',e=>{if(Math.hypot(e.touches[0].clientX-btnStartX,e.touches[0].clientY-btnStartY)>8)btnMoved=true;},{passive:true});
b.addEventListener('touchend',e=>{if(!btnMoved){e.preventDefault();e.stopPropagation();onclick(b);}});
b.addEventListener('click',e=>{e.stopPropagation();onclick(b);});
return b;
}
function toolBtn(emoji,label,bg,m){
return mkBtn(emoji,label,bg,b=>{
mode=mode===m?null:m;
if(activeBtn&&activeBtn!==b)activeBtn.classList.remove('ck-active');
b.classList.toggle('ck-active',mode===m);
activeBtn=mode===m?b:null;
});
}
const _DOCK_TABS=[
{id:'eggs', icon:'🥚', label:'Eggs'},
{id:'virus', icon:'🦠', label:'Virus'},
{id:'weather', icon:'🌤️', label:'Weather'},
{id:'disaster',icon:'🌋', label:'Disaster'},
{id:'other', icon:'🛠️', label:'Other'},
{id:'admin', icon:'⚙️', label:'Admin'},
];
let _dockTabEls={},_dockPageEls={};
let _activeDocktab='eggs';
let _tabBar=_ce('div');_tabBar.className='ck-dock-tabs';
_DOCK_TABS.forEach(t=>{
let el=_ce('div');el.className='ck-dock-tab'+(t.id===_activeDocktab?' active':'');
el.innerHTML='<span class="ck-tab-icon">'+t.icon+'</span>'+t.label;
const pick=e=>{e.stopPropagation();if(_activeDocktab===t.id)return;_dockTabEls[_activeDocktab].classList.remove('active');_dockPageEls[_activeDocktab].classList.remove('active');_activeDocktab=t.id;el.classList.add('active');_dockPageEls[t.id].classList.add('active');};
el.addEventListener('click',pick);el.addEventListener('touchend',e=>{e.preventDefault();pick(e);});
_tabBar.appendChild(el);_dockTabEls[t.id]=el;
});
dock.appendChild(_tabBar);
function _makePage(id){let p=_ce('div');p.className='ck-dock-page'+(id===_activeDocktab?' active':'');dock.appendChild(p);_dockPageEls[id]=p;return p;}
let p1=_makePage('eggs');
(()=>{
const _eggDefs=[
{type:'duck', emoji:'🥚', label:'Duck', color:'#FFF3B0'},
{type:'swan', emoji:'🥚', label:'Swan', color:'#C8E6FF'},
{type:'fox', emoji:'🥚', label:'Fox', color:'#FFD6A0'},
{type:'snake', emoji:'🥚', label:'Snake', color:'#C8F5D8'},
{type:'wolf', emoji:'🥚', label:'Wolf', color:'#E8D5FF'},
{type:'bear', emoji:'🥚', label:'Bear', color:'#c8a97a'},
{type:'lion', emoji:'🥚', label:'Lion', color:'#ffe066'},
{type:'eagle', emoji:'🥚', label:'Eagle', color:'#c8a060'},
{type:'bat', emoji:'🥚', label:'Bat', color:'#9a7ab0'},
];
_eggDefs.forEach(cfg=>{
let b=mkBtn(cfg.emoji,cfg.label,cfg.color,btn=>{
window.eggType=cfg.type;
mode='egg';
if(activeBtn&&activeBtn!==btn)activeBtn.classList.remove('ck-active');
btn.classList.add('ck-active');activeBtn=btn;
});
let icon=b.querySelector('.ck-icon');
if(icon)icon.style.background=cfg.color;
p1.appendChild(b);
});
const _dragonAchIds=['endofbeginning','theend','fahhhh','dragonslayer'];
const _allDragonUnlocked=()=>_dragonAchIds.every(id=>window._achUnlocked&&window._achUnlocked.has(id));
let _dragonEggBtn=mkBtn('🔒','Dragon','#1a2a1a',btn=>{
if(!_allDragonUnlocked()){
let tip=_ce('div');tip.textContent='🐉 Unlock all dragon achievements first!';
tip.style.cssText='position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.82);color:#7fff7f;font-size:13px;font-weight:800;padding:8px 16px;border-radius:20px;z-index:1000050;pointer-events:none;white-space:nowrap;font-family:Nunito,sans-serif;';
_ba(tip);setTimeout(()=>tip.remove(),2000);
return;
}
window.eggType='dragon';
mode='egg';
if(activeBtn&&activeBtn!==btn)activeBtn.classList.remove('ck-active');
btn.classList.add('ck-active');activeBtn=btn;
});
let _dei=_dragonEggBtn.querySelector('.ck-icon');
if(_dei){_dei.style.background='#1a2a1a';_dei.style.filter='drop-shadow(0 0 4px rgba(100,200,50,0.3))';}
setInterval(()=>{
let icon=_dragonEggBtn.querySelector('.ck-icon'),lbl=_dragonEggBtn.querySelector('.ck-label');
if(_allDragonUnlocked()){
if(icon&&icon.textContent==='🔒'){
icon.textContent='🥚';
icon.style.background='linear-gradient(135deg,#1a4a1a,#2d7a2d)';
icon.style.filter='drop-shadow(0 0 8px lime) drop-shadow(0 0 4px green)';
if(lbl)lbl.style.color='#7fff7f';
}
}
},1000);
p1.appendChild(_dragonEggBtn);
})();
let p2=_makePage('virus');
(()=>{
[{type:'normal', emoji:'🦠', label:'Disease', bg:'rgba(0,80,20,0.7)'},
{type:'fast', emoji:'⚡', label:'Fast', bg:'rgba(120,90,0,0.7)'},
{type:'zombie', emoji:'🧟', label:'Zombie', bg:'rgba(70,0,130,0.7)'},
{type:'vaccine',emoji:'💉', label:'Vaccine', bg:'rgba(0,50,120,0.7)'},
].forEach(cfg=>{
let b=mkBtn(cfg.emoji,cfg.label,cfg.bg,btn=>{
window.virusType=cfg.type;
mode=cfg.type==='vaccine'?'vaccine':'disease';
if(activeBtn&&activeBtn!==btn)activeBtn.classList.remove('ck-active');
btn.classList.add('ck-active');activeBtn=btn;
});
p2.appendChild(b);
});
p2.appendChild(toolBtn('💀','Plague','#c8f0c8','plague'));
})();
let p3=_makePage('weather');
[mkBtn('☀️','Clear','rgba(120,90,0,0.7)',()=>{weatherEnd=Date.now()+30000;setWeather('clear');}),
mkBtn('🌧️','Rain','rgba(0,50,120,0.7)',()=>{weatherEnd=Date.now()+30000;setWeather('rain');}),
mkBtn('⛈️','Storm','rgba(70,0,130,0.7)',()=>{weatherEnd=Date.now()+30000;setWeather('storm');}),
mkBtn('🔥','Drought','rgba(120,50,0,0.7)',()=>{weatherEnd=Date.now()+30000;setWeather('drought');}),
mkBtn('🌫️','Fog','#d8d8e8',()=>{weatherEnd=Date.now()+30000;setWeather('fog');}),
mkBtn('🥵','Heatwave','#ffcba4',()=>{weatherEnd=Date.now()+30000;setWeather('heatwave');}),
mkBtn('❄️','Blizzard','#c8e8ff',()=>{weatherEnd=Date.now()+30000;setWeather('blizzard');}),
mkBtn('🌈','Rainbow','#ffe0f0',()=>{weatherEnd=Date.now()+30000;setWeather('rainbow');}),
mkBtn('🌑','Eclipse','#1a1a3a',()=>triggerEclipse()),
mkBtn('🌿','Overgrowth','#c8f0c8',()=>triggerOvergrowth()),
].forEach(b=>p3.appendChild(b));
let p4=_makePage('disaster');
[mkBtn('☄️','Meteor','rgba(120,50,0,0.7)',()=>triggerMeteor()),
mkBtn('🌌','Shower','#c8b4f0',()=>triggerMeteorShower()),
mkBtn('🌋','Volcano','rgba(120,0,0,0.7)',()=>triggerVolcano()),
mkBtn('🌊','Flood','rgba(0,50,120,0.7)',()=>triggerFlood()),
toolBtn('🌪️','Tornado','#c0eeee','tornado'),
mkBtn('⚡','Thunder','#fffde7',()=>triggerThunderstorm()),
].forEach(b=>p4.appendChild(b));
(()=>{
const _alienAchIds=['firstcontact','theytookone','wecomeinpeace','closencounter','alienslayer','drownedout'];
const _allAlienUnlocked=()=>_alienAchIds.every(id=>window._achUnlocked&&window._achUnlocked.has(id));
let _ufoBtn=mkBtn('🔒','UFO','#0a0a1a',btn=>{
if(!_allAlienUnlocked()){
let tip=_ce('div');tip.textContent='👽 Unlock all alien achievements first!';
tip.style.cssText='position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:rgba(0,10,20,0.92);color:#00ffcc;font-size:13px;font-weight:800;padding:8px 16px;border-radius:20px;z-index:1000050;pointer-events:none;white-space:nowrap;font-family:Nunito,sans-serif;';
_ba(tip);setTimeout(()=>tip.remove(),2000);
return;
}
triggerMassUFO();
});
let _ufoIcon=_ufoBtn.querySelector('.ck-icon');
if(_ufoIcon){_ufoIcon.style.background='#0a0a1a';_ufoIcon.style.filter='grayscale(1) brightness(0.4)';}
let _ufoLabel=_ufoBtn.querySelector('.ck-label');
if(_ufoLabel){_ufoLabel.style.color='#444';}
let _ufoCheck=setInterval(()=>{
if(_allAlienUnlocked()){
clearInterval(_ufoCheck);
_ufoBtn.style.opacity='1';
if(_ufoIcon){_ufoIcon.style.filter='drop-shadow(0 0 8px #00ffcc)';_ufoIcon.style.background='#001a2a';}
if(_ufoLabel){_ufoLabel.style.color='#00ffcc';}
_ufoBtn.querySelector('.ck-icon').textContent='🛸';
}
},2000);
p4.appendChild(_ufoBtn);
})();
let p5=_makePage('other');
let _deselBtn=mkBtn('✖️','Deselect','#eee',()=>{mode=null;if(activeBtn){activeBtn.classList.remove('ck-active');activeBtn=null;}dismissEggPopover();dismissVirusPopover();});
[toolBtn('📍','Beacon','rgba(0,50,120,0.7)','pin'),
toolBtn('💥','Shock','#fce4ec','shockwave'),
toolBtn('💣','Bomb','rgba(120,50,0,0.7)','bomb'),
toolBtn('🕳️','Hole','rgba(70,0,130,0.7)','blackhole'),
toolBtn('😡','Rage','rgba(120,0,0,0.7)','rage'),
toolBtn('⚡','Zeus','rgba(120,90,0,0.7)','zeus'),
toolBtn('🧲','Magnet','rgba(0,50,120,0.7)','magnet'),
toolBtn('💤','Sleep','rgba(0,80,20,0.7)','sleep'),
toolBtn('🔪','Knife','rgba(120,0,0,0.7)','knife'),
_deselBtn,
].forEach(b=>p5.appendChild(b));
let p6=_makePage('admin');
[{emoji:'🌅',label:'Dawn',phase:'dawn'},{emoji:'☀️',label:'Day',phase:'day'},{emoji:'🌆',label:'Dusk',phase:'dusk'},{emoji:'🌙',label:'Night',phase:'night'}].forEach(d=>{
let b=mkBtn(d.emoji,d.label,d.phase==='night'?'#1a1a3a':d.phase==='dusk'?'#ffe0c8':d.phase==='dawn'?'#ffe8c0':'rgba(120,90,0,0.7)',()=>{
dayPhase=d.phase;dayStart=Date.now();
let pd=PHASE_DATA[d.phase];
if(!window._dayBg){window._dayBg=_ce('div');window._dayBg.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999989;transition:background 2s ease;';_ba(window._dayBg);}
window._dayBg.style.background=pd.bg;
let banner=_ce('div');banner.textContent=pd.emoji+' '+pd.label;banner.style.cssText='position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);font-size:32px;color:white;text-shadow:0 0 20px rgba(0,0,0,.9);z-index:1000011;pointer-events:none;transition:opacity 1s ease;';_ba(banner);setTimeout(()=>banner.style.opacity='0',1800);setTimeout(()=>banner.remove(),2800);
});
if(d.phase==='night'){let lbl=b.querySelector('.ck-label');if(lbl)lbl.style.color='#aac';}
p6.appendChild(b);
});
let _panicHidden=false;
let _panicBtn=_ce('div');
_panicBtn.style.cssText='position:fixed;bottom:12px;right:12px;width:46px;height:46px;border-radius:50%;background:rgba(200,40,40,0.92);z-index:1000100;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(180,0,0,0.45),0 1px 0 rgba(255,255,255,0.08);transition:background .15s,transform .15s;border:1.5px solid rgba(255,80,80,0.25);';
_panicBtn.innerHTML='<div style="font-size:18px;line-height:1;">🚨</div>';
_panicBtn.onmouseenter=()=>{_panicBtn.style.background='rgba(220,50,50,1)';_panicBtn.style.transform='scale(1.1)';};
_panicBtn.onmouseleave=()=>{_panicBtn.style.background=_panicHidden?'rgba(80,80,80,0.85)':'rgba(220,50,50,0.85)';_panicBtn.style.transform='';};
_ba(_panicBtn);
function _setEntitiesVisible(v){
[...Ducks,...Babies,...BabySwans,...Swans,...DragonEggs,...BabyDragons,...Dragons,...Eggs,...Foxes,...Snakes,...Wolves,...Aliens,...Bears,...Lions,...Eagles,...Bats,...Zombies,...BabyZombies,...Yetis].forEach(o=>{
o.el.style.visibility=v;
o.el.style.pointerEvents=v==='hidden'?'none':'';
});
if(window._weatherBg)window._weatherBg.style.visibility=v;
if(window._rainCanvas)window._rainCanvas.style.visibility=v;
if(window._dayBg)window._dayBg.style.visibility=v;
if(window._rainbowArc)window._rainbowArc.style.visibility=v;
if(BLACKHOLE?.el)BLACKHOLE.el.style.visibility=v;
if(window._tornadoEl)window._tornadoEl.style.visibility=v;
if(floodEl)floodEl.style.visibility=v;
lavaBlobs.forEach(b=>{if(b.el)b.el.style.visibility=v;});
_frostTrails.forEach(f=>{if(f.el)f.el.style.visibility=v;});
}
function _showPanic(){
window._panicWasPaused=window.paused;
window.paused=true;
_panicHidden=true;
_panicBtn.style.opacity='0.05';
if(!window._panicCover){
  window._panicCover=_ce('div');
  window._panicCover.style.cssText='position:fixed;inset:0;background:#fff;z-index:2147483647;pointer-events:all;cursor:pointer;';
  window._panicCover.addEventListener('click',_hidePanic);
  window._panicCover.addEventListener('touchend',e=>{e.preventDefault();_hidePanic();});
  document.body.appendChild(window._panicCover);
}
window._panicCover.style.display='block';
}
function _hidePanic(){
window.paused=window._panicWasPaused||false;
_panicHidden=false;
_panicBtn.style.opacity='1';
if(window._panicCover)window._panicCover.style.display='none';
_pauseBtn.textContent=window.paused?'▶️':'⏸️';
_pauseBtn.style.background=window.paused?'rgba(60,80,160,0.95)':'rgba(22,24,42,0.95)';
}
function _togglePanic(e){
e.stopPropagation();
if(_panicHidden)_hidePanic();else _showPanic();
}
(function(){
  let _px=null,_py=null,_dragging=false,_moved=false;
  let _bx=innerWidth-12-23,_by=innerHeight-12-23; // centre of button
  function setPos(x,y){
    _bx=Math.max(23,Math.min(innerWidth-23,x));
    _by=Math.max(23,Math.min(innerHeight-23,y));
    _panicBtn.style.right='';
    _panicBtn.style.bottom='';
    _panicBtn.style.left=(_bx-23)+'px';
    _panicBtn.style.top=(_by-23)+'px';
  }
  _panicBtn.addEventListener('pointerdown',function(e){
    e.stopPropagation();
    _px=e.clientX;_py=e.clientY;_moved=false;_dragging=true;
    _panicBtn.setPointerCapture(e.pointerId);
    _panicBtn.style.transition='none';
  });
  _panicBtn.addEventListener('pointermove',function(e){
    if(!_dragging)return;
    const dx=e.clientX-_px,dy=e.clientY-_py;
    if(Math.abs(dx)+Math.abs(dy)>4)_moved=true;
    setPos(_bx+dx,_by+dy);
    _px=e.clientX;_py=e.clientY;
  });
  _panicBtn.addEventListener('pointerup',function(e){
    e.stopPropagation();
    _dragging=false;
    _panicBtn.style.transition='background .15s,transform .15s';
    if(!_moved){
      const now2=Date.now();
      if(now2-(_panicLastTap||0)<350){_togglePanic(e);_panicLastTap=0;}
      else _panicLastTap=now2;
    }
  });
  _panicBtn.addEventListener('pointercancel',function(){_dragging=false;});
})();let _homeBtn=_ce('div');
window._homeBtn=_homeBtn;
_homeBtn.style.display='none';
_homeBtn.textContent='🏠';
_homeBtn.style.cssText='position:fixed;left:0;top:50%;transform:translateY(-50%);width:40px;height:48px;border-radius:0 14px 14px 0;background:rgba(12,13,26,0.97);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1.5px solid rgba(255,255,255,0.13);border-left:none;box-shadow:4px 0 20px rgba(0,0,0,0.5),1px 0 0 rgba(255,255,255,0.04);display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;z-index:1000025;user-select:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent;'
_homeBtn.onmouseenter=()=>{_homeBtn.style.width='40px';_homeBtn.style.background='rgba(255,255,255,0.98)';};
_homeBtn.onmouseleave=()=>{_homeBtn.style.width='32px';_homeBtn.style.background='rgba(255,255,255,0.88)';};
_homeBtn.addEventListener('click',e=>{e.stopPropagation();if(window._backToMenu)window._backToMenu();});
_homeBtn.addEventListener('touchend',e=>{e.preventDefault();e.stopPropagation();if(window._backToMenu)window._backToMenu();});
_ba(_homeBtn);
})();
(()=>{
window._deviceType = 'phone';
const s = _ce('div');
s.id = 'ck-start';
s.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000095;background:#0e0f1a;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Nunito,sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent;';
s.innerHTML = `
<style>
@keyframes startFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
@keyframes startGlow{0%,100%{text-shadow:0 0 20px rgba(245,230,66,0.4)}50%{text-shadow:0 0 40px rgba(245,230,66,0.9),0 0 80px rgba(245,230,66,0.4)}}
#ck-start *{box-sizing:border-box;}
.ck-s-screen{display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:28px 20px;width:100%;max-width:420px;}
.ck-s-screen.active{display:flex;}
.ck-s-duck{font-size:72px;animation:startFloat 2.2s ease-in-out infinite;}
.ck-s-title{font-size:28px;font-weight:900;color:#fff;letter-spacing:-0.5px;animation:startGlow 2s ease-in-out infinite;text-align:center;}
.ck-s-sub{font-size:14px;font-weight:700;color:rgba(255,255,255,0.45);text-align:center;margin-top:-8px;}
.ck-s-q{font-size:17px;font-weight:900;color:#fff;text-align:center;margin-bottom:4px;}
.ck-s-opts{display:flex;flex-direction:column;gap:10px;width:100%;}
.ck-s-btn{
padding:16px 20px;border-radius:14px;border:2px solid rgba(255,255,255,0.12);
background:rgba(255,255,255,0.06);color:#fff;font-size:15px;font-weight:900;
cursor:pointer;font-family:Nunito,sans-serif;display:flex;align-items:center;gap:14px;
transition:background .15s,border-color .15s,transform .1s;text-align:left;
}
.ck-s-btn:hover,.ck-s-btn:active{background:rgba(255,255,255,0.12);border-color:rgba(255,255,255,0.3);transform:scale(1.02);}
.ck-s-btn-ico{font-size:28px;}
.ck-s-btn-info{}
.ck-s-btn-name{font-size:15px;font-weight:900;}
.ck-s-btn-desc{font-size:11px;font-weight:700;color:rgba(255,255,255,0.4);margin-top:2px;}
.ck-s-btn.selected{border-color:#f5e642;background:rgba(245,230,66,0.1);}
.ck-s-skip{font-size:12px;color:rgba(255,255,255,0.3);cursor:pointer;margin-top:4px;text-decoration:underline;}
.ck-s-skip:hover{color:rgba(255,255,255,0.6);}
</style>
<div id="ck-s1" class="ck-s-screen active">
<div class="ck-s-duck">🦆</div>
<div class="ck-s-title">Ducky Games</div>
<div class="ck-s-sub">Tap anywhere to begin</div>
</div>
<div id="ck-s2" class="ck-s-screen">
<div class="ck-s-q">📱 What are you playing on?</div>
<div class="ck-s-opts">
<button class="ck-s-btn" id="ck-dev-phone">
<div class="ck-s-btn-ico">📱</div>
<div class="ck-s-btn-info">
<div class="ck-s-btn-name">Phone</div>
<div class="ck-s-btn-desc">Touch controls · compact layout</div>
</div>
</button>
<button class="ck-s-btn" id="ck-dev-ipad">
<div class="ck-s-btn-ico">📱</div>
<div class="ck-s-btn-info">
<div class="ck-s-btn-name">Tablet / iPad</div>
<div class="ck-s-btn-desc">Touch controls · larger layout</div>
</div>
</button>
<button class="ck-s-btn" id="ck-dev-desktop">
<div class="ck-s-btn-ico">🖥️</div>
<div class="ck-s-btn-info">
<div class="ck-s-btn-name">Desktop / Laptop</div>
<div class="ck-s-btn-desc">Mouse + keyboard · full layout</div>
</div>
</button>
</div>
</div>
<div id="ck-s3" class="ck-s-screen">
<div class="ck-s-q">🎓 Would you like a tutorial?</div>
<div class="ck-s-sub">Learn the basics of the sandbox mode</div>
<div class="ck-s-opts">
<button class="ck-s-btn" id="ck-tut-yes">
<div class="ck-s-btn-ico">✅</div>
<div class="ck-s-btn-info">
<div class="ck-s-btn-name">Yes, show me the ropes</div>
<div class="ck-s-btn-desc">Quick tour of the menu — takes 30 seconds</div>
</div>
</button>
<button class="ck-s-btn" id="ck-tut-no">
<div class="ck-s-btn-ico">🚀</div>
<div class="ck-s-btn-info">
<div class="ck-s-btn-name">Skip — I know what I'm doing</div>
<div class="ck-s-btn-desc">Jump straight to the menu</div>
</div>
</button>
</div>
<div class="ck-s-skip" id="ck-s-skip">skip setup</div>
</div>`;
_ba(s);
function applyDevice(type){
window._deviceType = type;
const root = document.documentElement;
if(type==='desktop'){
root.style.setProperty('--ck-card-w','200px');
root.style.setProperty('--ck-card-thumb-h','120px');
root.style.setProperty('--ck-grid-cols','auto-fill');
} else if(type==='ipad'){
root.style.setProperty('--ck-card-w','185px');
root.style.setProperty('--ck-card-thumb-h','110px');
root.style.setProperty('--ck-grid-cols','auto-fill');
} else {
root.style.setProperty('--ck-card-w','152px');
root.style.setProperty('--ck-card-thumb-h','100px');
root.style.setProperty('--ck-grid-cols','auto-fill');
}
document.body.setAttribute('data-device', type);
}
function showScreen(id){
s.querySelectorAll('.ck-s-screen').forEach(el=>el.classList.remove('active'));
s.querySelector(id).classList.add('active');
}
function dismiss(){
s.style.transition='opacity .4s ease';
s.style.opacity='0';
setTimeout(()=>s.remove(),400);
}
(function(){
function goS2(e){ e.stopPropagation(); e.preventDefault(); showScreen('#ck-s2'); }
var s1 = s.querySelector('#ck-s1');
s1.addEventListener('click', goS2);
s1.addEventListener('touchstart', goS2, {passive:false});
s1.addEventListener('pointerdown', goS2);
})();
['phone','ipad','desktop'].forEach(function(type){
var btn = s.querySelector('#ck-dev-'+type);
function doDevice(e){ e.stopPropagation(); e.preventDefault(); applyDevice(type); showScreen('#ck-s3'); }
btn.addEventListener('click', doDevice);
btn.addEventListener('touchstart', doDevice, {passive:false});
btn.addEventListener('pointerdown', doDevice);
});
(function(){
function doDismiss(e){ e.stopPropagation(); e.preventDefault(); dismiss(); }
function doTutorial(e){ e.stopPropagation(); e.preventDefault(); dismiss(); setTimeout(function(){if(window.startMenuTour)window.startMenuTour();}, 500); }
var tutYes = s.querySelector('#ck-tut-yes');
if(tutYes){
 tutYes.addEventListener('click', doTutorial);
 tutYes.addEventListener('touchstart', doTutorial, {passive:false});
}
var tutNo = s.querySelector('#ck-tut-no');
if(tutNo){
 tutNo.addEventListener('click', doDismiss);
 tutNo.addEventListener('touchstart', doDismiss, {passive:false});
}
var skip = s.querySelector('#ck-s-skip');
function doSkip(e){ e.stopPropagation(); e.preventDefault(); applyDevice(window._deviceType||'phone'); dismiss(); }
skip.addEventListener('click', doSkip);
skip.addEventListener('touchstart', doSkip, {passive:false});
skip.addEventListener('pointerdown', doSkip);
})();
applyDevice('phone');
})();
(()=>{
let _marketEl=null, _marketInterval=null;
window._launchMarket=function(){
window.paused=true;
if(window._menuEl)window._menuEl.style.display='none';
if(window._homeBtn)window._homeBtn.style.display='';
window._marketActive=true;
if(_marketEl){_marketEl.remove();_marketEl=null;}
if(_marketInterval){clearInterval(_marketInterval);_marketInterval=null;}
_buildMarket();
};

// ── How To Play Modal ─────────────────────────────────────────
(()=>{
const _htpModal = _ce('div');
_htpModal.style.cssText = 'display:none;position:fixed;inset:0;z-index:1000095;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);align-items:center;justify-content:center;padding:20px;touch-action:manipulation;';
_htpModal.innerHTML = '<div style="background:#1a1c2e;border-radius:20px;padding:22px 20px;max-width:340px;width:100%;position:relative;"><button id="_htp-close" style="position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:50%;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.08);color:#fff;font-size:16px;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">✕</button><div id="_htp-title" style="font-size:18px;font-weight:900;color:#fff;margin-bottom:10px;padding-right:36px;"></div><div id="_htp-body" style="font-size:13px;color:rgba(255,255,255,0.6);line-height:1.7;"></div></div>';
_ba(_htpModal);
_htpModal.querySelector('#_htp-close').addEventListener('pointerdown',e=>{e.stopPropagation();_htpModal.style.display='none';});
_htpModal.addEventListener('pointerdown',e=>{if(e.target===_htpModal)_htpModal.style.display='none';});
// Delegated listener on document — catches ck-htp-btn taps anywhere
document.addEventListener('pointerdown',e=>{
  const btn=e.target.closest('.ck-htp-btn');
  if(!btn)return;
  e.stopPropagation();
  _htpModal.querySelector('#_htp-title').textContent=btn.dataset.title||'';
  _htpModal.querySelector('#_htp-body').textContent=btn.dataset.body||'';
  _htpModal.style.display='flex';
},true);
})();
(function(){
function _duckHash(s){var h=5381;for(var i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))>>>0;return h;}
var _usedCodes=new Set();
function _applyCode(raw,res){
  var c=raw.trim();
  if(!res)res=document.getElementById('ck-code-result');
  if(!res)return;
  if(_usedCodes.has(c)){res.style.color='#ffaa40';res.textContent='⚠️ Code already used!';setTimeout(()=>{if(res)res.textContent='';},2500);return;}
  var h=_duckHash(c);
  var CODES={
    686692732:function(){window._diveInfiniteMoney=true;res.style.color='#40ff80';res.textContent='✅ Infinite coins active in Duck Dive!';_usedCodes.add(c);setTimeout(()=>{if(res)res.textContent='';},3000);},
    661367123:function(){window._dive41x=true;res.style.color='#40ff80';res.textContent='✅ All fish worth 41× in Duck Dive!';_usedCodes.add(c);setTimeout(()=>{if(res)res.textContent='';},3000);},
    1326544790:function(){window._diveLevel50=true;res.style.color='#40ff80';res.textContent='✅ Level 50 upgrades active — open Duck Dive!';_usedCodes.add(c);setTimeout(()=>{if(res)res.textContent='';},3000);}
  };
  if(CODES[h]){CODES[h]();}
  else{res.style.color='#ff5040';res.textContent='❌ Invalid code';setTimeout(()=>{if(res)res.textContent='';},2500);}
}
window._applyCode=_applyCode;
function _submitCode(){var inp=document.getElementById('ck-code-input');var res=document.getElementById('ck-code-result');if(inp&&inp.value.trim()){_applyCode(inp.value,res);inp.value='';}}
document.addEventListener('pointerdown',function(e){
  if(e.target.closest('#ck-code-clear')){var inp=document.getElementById('ck-code-input');var res=document.getElementById('ck-code-result');if(inp){inp.value='';inp.focus();}if(res)res.textContent='';return;}
  if(e.target.closest('#ck-code-btn')){_submitCode();return;}
},true);
document.addEventListener('keydown',function(e){if(e.key==='Enter'&&document.activeElement&&document.activeElement.id==='ck-code-input')_submitCode();});
})();
window._exitMarket=function(){
window._marketActive=false;
window.paused=false;
if(_marketEl){_marketEl.remove();_marketEl=null;}
if(_marketInterval){clearInterval(_marketInterval);_marketInterval=null;}
if(window._menuEl)window._menuEl.style.display='flex';
if(window._randomiseFeatured)window._randomiseFeatured();

if(window._homeBtn)window._homeBtn.style.display='none';
};
function _buildMarket(){
const ASSETS=[
{id:'bread', name:'Breadcrumbs', emoji:'🍞', price:10, vol:0.035, trend:0},
{id:'weed', name:'Pond Weed', emoji:'🌿', price:25, vol:0.04, trend:0},
{id:'rubber', name:'Rubber Ducks',emoji:'🦆', price:50, vol:0.055, trend:0},
{id:'feather',name:'Feathers', emoji:'🪶', price:80, vol:0.05, trend:0},
{id:'egg', name:'Eggs', emoji:'🥚', price:120, vol:0.065, trend:0},
{id:'hat', name:'Fancy Hats', emoji:'🎩', price:200, vol:0.08, trend:0},
];
const NEWS=[
{asset:'bread', dir:1, txt:'🍞 Bread shortage — ducks panic-buying crumbs'},
{asset:'bread', dir:-1, txt:'🍞 Bakery overproduction floods the market'},
{asset:'weed', dir:1, txt:'🌿 Rare algae bloom declared a superfood'},
{asset:'weed', dir:-1, txt:'🌿 Pond weed linked to bad vibes — sell off!'},
{asset:'rubber', dir:1, txt:'🦆 Rubber duck NFTs go viral — prices surge'},
{asset:'rubber', dir:-1, txt:'🦆 Rubber duck bubble bursts. Sad honking.'},
{asset:'feather',dir:1, txt:'🪶 Fashion week goes avian — feather demand soars'},
{asset:'feather',dir:-1, txt:'🪶 Synthetic plumage ruins the feather market'},
{asset:'egg', dir:1, txt:'🥚 Egg futures: analysts say "to the moon"'},
{asset:'egg', dir:-1, txt:'🥚 Egg recall after mysterious wobbling incident'},
{asset:'hat', dir:1, txt:'🎩 Top hats declared symbol of wealth again'},
{asset:'hat', dir:-1, txt:'🎩 Hats too fancy — ducks can\'t afford mortgages'},
{asset:null, dir:1, txt:'📈 Bull pond! Positive vibes across all assets'},
{asset:null, dir:-1, txt:'📉 Bear pond! Everything sinking like a stone'},
{asset:null, dir:1, txt:'🌈 Rainbow weather boosts entire duck economy'},
];
const TARGET=1000;
let cash=200, portfolio={}, history={}, tick=0, nextNews=120, gameOver=false;
ASSETS.forEach(a=>{portfolio[a.id]=0; history[a.id]=[a.price];});
_marketEl=_ce('div');
_marketEl.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000085;background:#0a0c1a;display:flex;flex-direction:column;font-family:Nunito,sans-serif;overflow:hidden;';
window._marketEl=_marketEl;
_marketEl.innerHTML=`
<style>
#mkt *{box-sizing:border-box;}
#mkt-header{background:#111328;height:50px;display:flex;align-items:center;padding:0 10px;gap:6px;border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0;overflow-x:auto;scrollbar-width:none;}

.mkt-hstat{display:flex;flex-direction:column;align-items:center;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:3px 9px;}
.mkt-hstat-lbl{font-size:9px;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:.06em;}
.mkt-hstat-val{font-size:13px;font-weight:900;color:#f5e642;}
#mkt-target-stat .mkt-hstat-val{color:#60c860;}
#mkt-howto{background:#0c1428;border-bottom:1px solid rgba(60,100,200,0.2);padding:6px 12px;font-size:11px;font-weight:700;color:#8090d0;flex-shrink:0;line-height:1.5;}
#mkt-news{background:#140a06;border-bottom:1px solid rgba(255,100,40,0.15);padding:5px 12px;font-size:11px;font-weight:700;color:#ff8844;flex-shrink:0;min-height:26px;transition:opacity 0.4s;}
#mkt-body{flex:1;overflow-y:auto;padding:8px;scrollbar-width:none;}
#mkt-body::-webkit-scrollbar{display:none;}
.mkt-row{background:#14162a;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 10px;margin-bottom:7px;}
.mkt-row-top{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.mkt-emoji{font-size:20px;width:28px;text-align:center;flex-shrink:0;}
.mkt-name{flex:1;font-size:12px;font-weight:900;color:#fff;}
.mkt-price{font-size:15px;font-weight:900;color:#f5e642;min-width:48px;text-align:right;}
.mkt-change{font-size:10px;font-weight:700;min-width:38px;text-align:right;}
.mkt-change.up{color:#50d870;}
.mkt-change.dn{color:#ff5050;}
.mkt-chart{width:56px;height:26px;flex-shrink:0;}
.mkt-row-bot{display:flex;align-items:center;gap:6px;}
.mkt-held-label{font-size:10px;color:rgba(255,255,255,0.35);flex:1;}
.mkt-held-val{font-size:11px;font-weight:900;color:#a0b8ff;}
.mkt-afford{font-size:10px;color:rgba(255,255,255,0.25);margin-right:4px;}
.mkt-btns{display:flex;gap:5px;}
.mkt-btn{padding:5px 12px;border-radius:7px;border:none;font-size:11px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;}
.mkt-btn.buy{background:#1a5028;color:#50e878;}
.mkt-btn.sell{background:#501818;color:#e85050;}
.mkt-btn.sellall{background:#3a1010;color:#c04040;font-size:10px;padding:5px 8px;}
.mkt-btn:disabled{opacity:0.25;cursor:default;}
#mkt-gameover{position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000090;background:rgba(0,0,0,0.88);display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;}
#mkt-go-title{font-size:32px;font-weight:900;color:#fff;}
#mkt-go-sub{font-size:14px;color:rgba(255,255,255,0.5);}
.mkt-go-btn{padding:12px 28px;border-radius:12px;border:none;font-size:13px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;margin:4px;}
</style>
<div id="mkt">
<div id="mkt-header">
<div class="mkt-hstat"><div class="mkt-hstat-lbl">Cash</div><div class="mkt-hstat-val" id="mkt-cash">200g</div></div>
<div class="mkt-hstat"><div class="mkt-hstat-lbl">Net worth</div><div class="mkt-hstat-val" id="mkt-net">200g</div></div>
<div class="mkt-hstat" id="mkt-target-stat"><div class="mkt-hstat-lbl">Target</div><div class="mkt-hstat-val">1000g</div></div>
</div>
<div id="mkt-howto">💡 Buy assets when prices dip 📉 — sell when they rise 📈 — reach 1000g net worth to win!</div>
<div id="mkt-news">📰 Duck Market is open! Watch for news headlines that spike or crash prices.</div>

<div id="mkt-guide" style="background:rgba(255,220,60,0.08);border-bottom:1px solid rgba(255,220,60,0.15);padding:7px 14px;display:flex;align-items:center;gap:8px;flex-shrink:0;font-size:11px;color:rgba(255,220,60,0.7);font-weight:900;cursor:pointer;" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';">
💡 How to play — tap to expand
</div>
<div id="mkt-guide-body" style="display:none;background:rgba(0,0,0,0.3);padding:10px 14px;flex-shrink:0;font-size:11px;color:rgba(255,255,255,0.6);line-height:1.8;font-family:Nunito,sans-serif;border-bottom:1px solid rgba(255,255,255,0.06);">
🛒 <b>Buy</b> goods when prices are low (green arrow = rising, good time to buy)<br>
💰 <b>Sell</b> goods when prices are high (red arrow = falling, good time to sell)<br>
📈 <b>Prices change</b> every few seconds — watch the trend arrows<br>
🏭 <b>Upgrade</b> your stall to unlock more goods and hold more stock<br>
⭐ <b>Goal:</b> make as many coins as possible by buying low and selling high
</div>
<div id="mkt-body"></div>
<div id="mkt-gameover">
<div id="mkt-go-title">🏆 You Win!</div>
<div id="mkt-go-sub">You hit 1000g — certified Duck Tycoon!</div>
<button class="mkt-go-btn" style="background:linear-gradient(90deg,#1a5030,#0e3820);color:#50e878;" onclick="_mktRestart()">▶ Play Again</button>
<button class="mkt-go-btn" style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.5);" onclick="window._exitMarket()">🏠 Menu</button>
</div>
</div>`;
_ba(_marketEl);
function netWorth(){
let n=cash;
ASSETS.forEach(a=>{ n+=portfolio[a.id]*a.price; });
return _rnd(n);
}
function renderRows(){
const body=_marketEl.querySelector('#mkt-body');
body.innerHTML='';
ASSETS.forEach(a=>{
const hist=history[a.id];
const prev=hist.length>1?hist[hist.length-2]:hist[0];
const chg=((a.price-prev)/prev*100).toFixed(1);
const chgClass=chg>=0?'up':'dn';
const chgTxt=(chg>=0?'+':'')+chg+'%';
const held=portfolio[a.id];
const canAfford=_mf(cash/a.price);
const pts=hist.slice(-20);
const mn=_mn(...pts), mx=_mx(...pts), rng=mx-mn||1;
const row=_ce('div');
row.className='mkt-row';
row.innerHTML=`
<div class="mkt-row-top">
<div class="mkt-emoji">${a.emoji}</div>
<div class="mkt-name">${a.name}</div>
<svg class="mkt-chart" viewBox="0 0 56 26"><polyline points="${pts.map((v,i)=>`${i*(56/_mx(pts.length-1,1))},${26-_rnd((v-mn)/rng*22)}`).join(' ')}" fill="none" stroke="${parseFloat(chg)>=0?'#50d870':'#ff5050'}" stroke-width="1.5"/></svg>
<div class="mkt-price">${Math.round(a.price)}g</div>
<div class="mkt-change ${chgClass}">${chgTxt}</div>
</div>
<div class="mkt-row-bot">
<div class="mkt-held-label">Holding: <span class="mkt-held-val">${held>0?held+' (worth '+Math.round(held*a.price)+'g)':'none'}</span></div>
<div class="mkt-afford">${canAfford>0?'can buy '+canAfford:''}</div>
<div class="mkt-btns">
<button class="mkt-btn buy" ${cash<a.price?'disabled':''} onclick="mktBuy('${a.id}')">BUY</button>
<button class="mkt-btn sell" ${held<=0?'disabled':''} onclick="mktSell('${a.id}')">SELL</button>
${held>1?`<button class="mkt-btn sellall" ${held<=0?'disabled':''} onclick="mktSellAll('${a.id}')">SELL ALL</button>`:''}
</div>
</div>`;
body.appendChild(row);
});
const nw=netWorth();
_marketEl.querySelector('#mkt-cash').textContent=_rnd(cash)+'g';
_marketEl.querySelector('#mkt-net').textContent=nw+'g';
if(nw>=TARGET && !gameOver){ endGame(true); }
}
window.mktBuy=function(id){
const a=ASSETS.find(x=>x.id===id);
if(cash<a.price)return;
cash-=a.price; portfolio[id]++;
renderRows();
};
window.mktSell=function(id){
if(portfolio[id]<=0)return;
cash+=ASSETS.find(x=>x.id===id).price; portfolio[id]--;
renderRows();
};
window.mktSellAll=function(id){
const a=ASSETS.find(x=>x.id===id);
cash+=a.price*portfolio[id]; portfolio[id]=0;
renderRows();
};
function showNews(txt){
const el=_marketEl.querySelector('#mkt-news');
el.style.opacity='0';
setTimeout(()=>{ el.textContent='📰 '+txt; el.style.opacity='1'; },300);
}
function endGame(w){
gameOver=true;
if(_marketInterval){clearInterval(_marketInterval);_marketInterval=null;}
const go=_marketEl.querySelector('#mkt-gameover');
if(!w){
_marketEl.querySelector('#mkt-go-title').textContent='💸 Bankrupt!';
_marketEl.querySelector('#mkt-go-sub').textContent='The pond market claimed you. Better luck next dip.';
_marketEl.querySelector('#mkt-go-title').style.color='#ff5050';
}
go.style.display='flex';
}
window._mktRestart=function(){
cash=200; gameOver=false; tick=0; nextNews=120;
ASSETS.forEach(a=>{a.price=a._basePrice||a.price; portfolio[a.id]=0; history[a.id]=[a.price];});
_marketEl.querySelector('#mkt-gameover').style.display='none';
startTicker();
};
ASSETS.forEach(a=>a._basePrice=a.price);
function startTicker(){
if(_marketInterval)clearInterval(_marketInterval);
_marketInterval=setInterval(()=>{
if(gameOver)return;
tick++;
ASSETS.forEach(a=>{
a.trend*=0.95;
a.trend+=(_mr()-0.51)*a.vol;
a.price=_mx(1, a.price*(1+a.trend));
history[a.id].push(a.price);
if(history[a.id].length>40)history[a.id].shift();
});
if(tick>=nextNews){
nextNews=tick+80+_mf(_mr()*80);
const n=NEWS[_mf(_mr()*NEWS.length)];
showNews(n.txt);
if(n.asset){ const a=ASSETS.find(x=>x.id===n.asset); if(a)a.trend+=n.dir*0.18; }
else ASSETS.forEach(a=>{ a.trend+=n.dir*0.09; });
}
renderRows();
}, 600);
}
renderRows();
startTicker();
}
})();
(()=>{
let _evoEl=null;
window._launchEvolution=function(){
window.paused=true;
if(window._menuEl)window._menuEl.style.display='none';
if(window._homeBtn)window._homeBtn.style.display='';
window._evoActive=true;
if(_evoEl){_evoEl.remove();_evoEl=null;}
_buildEvolution();
};
window._exitEvolution=function(){
window._evoActive=false;
window.paused=false;
if(_evoEl){_evoEl.remove();_evoEl=null;}
if(window._menuEl)window._menuEl.style.display='flex';
if(window._randomiseFeatured)window._randomiseFeatured();
if(window._homeBtn)window._homeBtn.style.display='none';
};
function _buildEvolution(){
const TRAITS={
beak:[
{id:'flat', label:'Flat Beak', emoji:'😶', desc:'Classic pond tool. Filters mud like a champ.', stats:{spd:0,str:0,int:1,cha:1,wrd:0}},
{id:'hook', label:'Hooked Beak', emoji:'🦅', desc:'Dramatic and intimidating. Great for speeches.', stats:{spd:0,str:2,int:0,cha:1,wrd:0}},
{id:'spoon', label:'Spoon Beak', emoji:'🥄', desc:'Scoops soup. Perfect for the duck who has it all.', stats:{spd:0,str:0,int:1,cha:2,wrd:1}},
{id:'trumpet', label:'Trumpet Beak', emoji:'🎺', desc:'Honks in B flat. Concerts sell out instantly.', stats:{spd:0,str:0,int:0,cha:3,wrd:2}},
{id:'snorkel', label:'Snorkel Beak', emoji:'🤿', desc:'Permanently prepared for deep dives.', stats:{spd:1,str:0,int:1,cha:0,wrd:1}},
{id:'drill', label:'Drill Beak', emoji:'🔩', desc:'Can peck through concrete. OSHA disapproves.', stats:{spd:0,str:3,int:0,cha:0,wrd:2}},
{id:'laser', label:'Laser Beak', emoji:'💡', desc:'Fires a focused beam. Heats up leftover bread.', stats:{spd:0,str:2,int:2,cha:0,wrd:3}},
],
feathers:[
{id:'brown', label:'Brown Feathers', emoji:'🍂', desc:'Natural camouflage. Blends into autumn. Spooky.', stats:{spd:1,str:0,int:1,cha:0,wrd:0}},
{id:'rainbow', label:'Rainbow Feathers',emoji:'🌈', desc:'Impossible to hide. Visible from orbit.', stats:{spd:0,str:0,int:0,cha:4,wrd:1}},
{id:'spiky', label:'Spiky Feathers', emoji:'🦔', desc:'Hugs are inadvisable. Predators reconsider.', stats:{spd:0,str:2,int:0,cha:0,wrd:2}},
{id:'bald', label:'No Feathers', emoji:'🍗', desc:'Aerodynamic. Embarrassing at family reunions.', stats:{spd:2,str:0,int:0,cha:0,wrd:2}},
{id:'gold', label:'Golden Feathers', emoji:'✨', desc:'Shimmers divinely. Economists are concerned.', stats:{spd:0,str:0,int:1,cha:3,wrd:1}},
{id:'void', label:'Void Feathers', emoji:'🌑', desc:'Absorbs all light. Unsettling on a Tuesday.', stats:{spd:0,str:1,int:2,cha:0,wrd:4}},
{id:'fire', label:'Flame Feathers', emoji:'🔥', desc:'Self-igniting plumage. Not recommended in libraries.', stats:{spd:1,str:2,int:0,cha:1,wrd:3}},
],
feet:[
{id:'webbed', label:'Webbed Feet', emoji:'🏊', desc:'Elite swimmer. Races fish for fun.', stats:{spd:2,str:0,int:0,cha:1,wrd:0}},
{id:'talons', label:'Talons', emoji:'🦅', desc:'Cannot use keyboards. Grips enemies instead.', stats:{spd:0,str:3,int:0,cha:0,wrd:1}},
{id:'wheels', label:'Tiny Wheels', emoji:'🛞', desc:'Rolls downhill at terrifying velocity.', stats:{spd:3,str:0,int:0,cha:1,wrd:2}},
{id:'springs', label:'Spring Feet', emoji:'🤸', desc:'Bounces uncontrollably. High jump world record holder.',stats:{spd:2,str:1,int:0,cha:0,wrd:3}},
{id:'magnets', label:'Magnet Feet', emoji:'🧲', desc:'Sticks to metal surfaces. Great for heists.', stats:{spd:0,str:1,int:2,cha:0,wrd:3}},
{id:'jets', label:'Rocket Jets', emoji:'🚀', desc:'Achieves escape velocity. Returns occasionally.', stats:{spd:4,str:0,int:1,cha:0,wrd:3}},
{id:'roots', label:'Root Feet', emoji:'🌱', desc:'Grows into soil. Extremely patient.', stats:{spd:-1,str:2,int:3,cha:1,wrd:2}},
],
size:[
{id:'micro', label:'Microscopic', emoji:'🔬', desc:'Undetectable to the naked eye. Peer into a puddle.', stats:{spd:3,str:-1,int:2,cha:0,wrd:3}},
{id:'tiny', label:'Tiny', emoji:'🐭', desc:'Fits in a teacup. Often mistaken for a breadcrumb.', stats:{spd:2,str:0,int:1,cha:2,wrd:1}},
{id:'normal', label:'Normal', emoji:'🦆', desc:'Suspiciously average. Hides in plain sight.', stats:{spd:1,str:1,int:1,cha:1,wrd:0}},
{id:'large', label:'Chonky', emoji:'🐘', desc:'Sits on things. Breaks chairs. Unapologetic.', stats:{spd:0,str:3,int:0,cha:1,wrd:1}},
{id:'kaiju', label:'Kaiju-Sized', emoji:'🦕', desc:'Visible from space. Cities debate evacuation.', stats:{spd:-1,str:5,int:0,cha:1,wrd:3}},
{id:'shifting', label:'Size-Shifting', emoji:'🔄', desc:'Changes size at will. Customs agents hate this duck.', stats:{spd:1,str:1,int:2,cha:1,wrd:4}},
],
personality:[
{id:'chill', label:'Extremely Chill', emoji:'😎', desc:'Unbothered. Iconic. Sponsored by nothing.', stats:{spd:0,str:0,int:1,cha:3,wrd:1}},
{id:'anxious', label:'Anxiety Duck', emoji:'😰', desc:'Worried about the bread supply since 2019.', stats:{spd:2,str:0,int:2,cha:0,wrd:2}},
{id:'villain', label:'Supervillain', emoji:'🦹', desc:'Has a monologue. Has a lair. Has a newsletter.', stats:{spd:0,str:1,int:3,cha:1,wrd:3}},
{id:'wise', label:'Ancient Wisdom', emoji:'🧙', desc:'Knows things. Says nothing. Charges for silence.', stats:{spd:0,str:0,int:5,cha:2,wrd:2}},
{id:'chaotic', label:'Chaotic Neutral', emoji:'🎲', desc:'Does things. No one knows why. Not even the duck.', stats:{spd:2,str:2,int:0,cha:0,wrd:5}},
{id:'scholar', label:'Tiny Scholar', emoji:'📚', desc:'Three PhDs. All in bread economics.', stats:{spd:0,str:0,int:5,cha:1,wrd:1}},
{id:'celebrity',label:'Celebrity Duck', emoji:'🌟', desc:'Famous for being famous. Paparazzi in the pond.', stats:{spd:1,str:0,int:0,cha:5,wrd:2}},
],
power:[
{id:'none', label:'No Power', emoji:'🙄', desc:'Just a duck. At peak duck form. Unironically based.', stats:{spd:0,str:0,int:0,cha:1,wrd:0}},
{id:'laser', label:'Laser Eyes', emoji:'👁️', desc:'Heats leftovers from 40 feet. Very practical.', stats:{spd:0,str:3,int:1,cha:0,wrd:2}},
{id:'teleport', label:'Teleportation', emoji:'✨', desc:'Vanishes. Reappears. Always late to meetings.', stats:{spd:5,str:0,int:2,cha:0,wrd:3}},
{id:'quack', label:'Sonic Quack', emoji:'💥', desc:'Structural damage at 200m. Building codes updated.', stats:{spd:0,str:4,int:0,cha:1,wrd:3}},
{id:'time', label:'Time Control', emoji:'⏰', desc:'Pauses time. Uses it to nap. Valid life choice.', stats:{spd:0,str:0,int:4,cha:0,wrd:5}},
{id:'mind', label:'Mind Control', emoji:'🌀', desc:'Bends will of others. Mainly uses it to get bread.', stats:{spd:0,str:1,int:3,cha:3,wrd:3}},
{id:'quantum', label:'Quantum Duck', emoji:'⚛️', desc:'Exists in multiple ponds simultaneously. Tiring.', stats:{spd:2,str:0,int:5,cha:0,wrd:5}},
],
habitat:[
{id:'pond', label:'Tranquil Pond', emoji:'🏞️', desc:'Classic. Ducks were made for this. Peaceful vibes.', stats:{spd:0,str:0,int:0,cha:2,wrd:0}},
{id:'city', label:'Urban Rooftops', emoji:'🏙️', desc:'Navigates traffic. Judges pigeons constantly.', stats:{spd:2,str:0,int:2,cha:1,wrd:1}},
{id:'volcano', label:'Volcano Rim', emoji:'🌋', desc:'Heat-resistant. Extremely smug about it.', stats:{spd:0,str:3,int:0,cha:0,wrd:3}},
{id:'space', label:'Deep Space', emoji:'🌌', desc:'Drifts through nebulae. No gravity to complain about.', stats:{spd:3,str:0,int:3,cha:0,wrd:4}},
{id:'library', label:'Ancient Library', emoji:'📖', desc:'Reads everything. Shushes everyone. Very powerful.', stats:{spd:0,str:0,int:5,cha:1,wrd:2}},
{id:'dimension',label:'Pocket Dimension',emoji:'🌀', desc:'Lives in a fold of space. Very minimalist lifestyle.', stats:{spd:1,str:0,int:3,cha:0,wrd:5}},
],
diet:[
{id:'bread', label:'Bread Purist', emoji:'🍞', desc:'Only bread. Has opinions about bread. Do not argue.', stats:{spd:0,str:0,int:0,cha:2,wrd:1}},
{id:'gourmet', label:'Michelin Tier', emoji:'🍽️', desc:'Eats only 3-star meals. Critiques the lighting too.', stats:{spd:0,str:0,int:2,cha:3,wrd:1}},
{id:'chaos', label:'Eats Anything', emoji:'🗑️', desc:'Rocks. Batteries. Sunglasses. No questions asked.', stats:{spd:0,str:2,int:0,cha:0,wrd:4}},
{id:'cosmic', label:'Cosmic Energy', emoji:'☀️', desc:'Photosynthesises. Has moved beyond bread.', stats:{spd:1,str:0,int:3,cha:1,wrd:3}},
{id:'souls', label:'Consumes Souls', emoji:'💀', desc:'Spiritual diet. Ethically complicated.', stats:{spd:0,str:3,int:2,cha:0,wrd:5}},
{id:'memes', label:'Subsists on Memes',emoji:'📱', desc:'Nutrition from irony. Gets stronger with every post.', stats:{spd:1,str:0,int:1,cha:3,wrd:4}},
],
social:[
{id:'lone', label:'Lone Wolf Duck', emoji:'🐺', desc:'Does not want a flock. Is fine. Please stop asking.', stats:{spd:1,str:1,int:2,cha:0,wrd:1}},
{id:'flock', label:'Flock Leader', emoji:'🦆🦆',desc:'Commands hundreds. Huge annual conference in October.', stats:{spd:0,str:1,int:1,cha:4,wrd:1}},
{id:'alien', label:'Befriends Aliens',emoji:'👽', desc:'Only communicates with extraterrestrials. They listen.', stats:{spd:0,str:0,int:3,cha:2,wrd:5}},
{id:'internet', label:'Internet Famous', emoji:'💻', desc:'15 million subscribers. Posts bread tier lists.', stats:{spd:0,str:0,int:1,cha:5,wrd:3}},
{id:'ghost', label:'Ghost Friend', emoji:'👻', desc:'Exclusively hangs out with spirits. Very chill ghosts.', stats:{spd:0,str:0,int:2,cha:1,wrd:4}},
{id:'robot', label:'Robot Companion', emoji:'🤖', desc:'One robotic best friend. It also quacks now.', stats:{spd:1,str:1,int:3,cha:1,wrd:3}},
],
quirk:[
{id:'rhymes', label:'Only Speaks in Rhymes',emoji:'🎵',desc:'Every sentence rhymes. Every time. It is a crime.', stats:{spd:0,str:0,int:2,cha:3,wrd:3}},
{id:'glowing', label:'Gently Glowing', emoji:'💫', desc:'Emits soft bioluminescence. Nightlight capability.', stats:{spd:0,str:0,int:0,cha:3,wrd:3}},
{id:'invisible',label:'Sometimes Invisible',emoji:'👁️‍🗨️',desc:'Vanishes randomly. Returns with no explanation.', stats:{spd:2,str:0,int:1,cha:0,wrd:4}},
{id:'prophetic',label:'Mildly Prophetic',emoji:'🔮', desc:'Predicts minor events. Mostly bread delivery.', stats:{spd:0,str:0,int:4,cha:2,wrd:3}},
{id:'multiplies',label:'Inexplicably Multiplies',emoji:'✖️',desc:'There are more every morning. No one knows.', stats:{spd:1,str:1,int:0,cha:0,wrd:5}},
{id:'ancient', label:'Impossibly Ancient',emoji:'⏳', desc:'Existed before the universe. Does not discuss it.', stats:{spd:0,str:2,int:5,cha:0,wrd:5}},
{id:'cursed', label:'Lightly Cursed', emoji:'😈', desc:'Bad luck follows nearby. The duck is fine though.', stats:{spd:0,str:0,int:1,cha:0,wrd:5}},
],
};

const SPECIES_DB=[
{key:{beak:'flat',feathers:'brown',feet:'webbed',size:'normal',personality:'chill',power:'none',habitat:'pond',diet:'bread',social:'flock',quirk:'glowing'},
 name:'The Common Mallard Supreme',emoji:'🦆',rarity:'common',desc:'The apex of normalcy. Scientists study it as a baseline for everything else. It is unbothered by this.'},
{key:{beak:'hook',feathers:'void',feet:'talons',size:'kaiju',personality:'villain',power:'laser',habitat:'volcano',diet:'souls',social:'lone',quirk:'ancient'},
 name:'The Eternal Doom Duck',emoji:'🦹',rarity:'legendary',desc:'It was here before the stars. It will be here after. It has a monologue ready. It is waiting.'},
{key:{beak:'spoon',feathers:'bald',feet:'wheels',size:'tiny',personality:'anxious',power:'none',habitat:'city',diet:'bread',social:'internet',quirk:'rhymes'},
 name:'The Viral Spoonbill',emoji:'🥄',rarity:'rare',desc:'Bald. Wheeled. Extremely online. Its bread tier list has 40 million views. It is deeply anxious about this.'},
{key:{beak:'trumpet',feathers:'spiky',feet:'springs',size:'large',personality:'wise',power:'quack',habitat:'library',diet:'cosmic',social:'ghost',quirk:'prophetic'},
 name:'The Prophet of Honk',emoji:'🎺',rarity:'epic',desc:'Ancient. Spiky. Its quack rewrites local ordinances. The ghosts take notes.'},
{key:{beak:'flat',feathers:'rainbow',feet:'wheels',size:'large',personality:'chill',power:'teleport',habitat:'city',diet:'gourmet',social:'internet',quirk:'glowing'},
 name:'The Smooth Operator',emoji:'🌈',rarity:'rare',desc:'Chonky, rainbow, teleporting. Eats at Michelin-starred restaurants. Always gets a table.'},
{key:{beak:'laser',feathers:'fire',feet:'jets',size:'kaiju',personality:'chaotic',power:'quack',habitat:'volcano',diet:'chaos',social:'lone',quirk:'multiplies'},
 name:'The Pyro-Quackolypse',emoji:'🔥',rarity:'legendary',desc:'A cascade of fire ducks pouring from a volcano. Scientists confirmed it: yes, there are more every morning.'},
{key:{beak:'snorkel',feathers:'void',feet:'jets',size:'shifting',personality:'scholar',power:'quantum',habitat:'space',diet:'cosmic',social:'alien',quirk:'ancient'},
 name:'The Quantum Archivist',emoji:'⚛️',rarity:'legendary',desc:'Holds four degrees from universities that do not yet exist. Communicates only with beings from adjacent dimensions.'},
{key:{beak:'drill',feathers:'spiky',feet:'magnets',size:'large',personality:'villain',power:'quack',habitat:'volcano',diet:'chaos',social:'lone',quirk:'cursed'},
 name:'The Industrial Nemesis',emoji:'🔩',rarity:'epic',desc:'Drills through mountains for fun. Leaves structural damage and a light curse wherever it goes.'},
{key:{beak:'flat',feathers:'gold',feet:'webbed',size:'normal',personality:'celebrity',power:'mind',habitat:'pond',diet:'gourmet',social:'internet',quirk:'glowing'},
 name:'The Influencer Duck',emoji:'✨',rarity:'rare',desc:'Glowing golden feathers. Mind control used only to gain subscribers. Currently at 40 million. Growing.'},
{key:{beak:'trumpet',feathers:'rainbow',feet:'springs',size:'large',personality:'celebrity',power:'none',habitat:'city',diet:'memes',social:'internet',quirk:'rhymes'},
 name:'The Charisma Goblin',emoji:'🎺',rarity:'rare',desc:'Every sentence rhymes. Every post goes viral. It has no powers. It does not need them.'},
{key:{beak:'flat',feathers:'brown',feet:'roots',size:'normal',personality:'wise',power:'none',habitat:'library',diet:'cosmic',social:'lone',quirk:'ancient'},
 name:'The Archivist Duck',emoji:'📚',rarity:'rare',desc:'Rooted in an ancient library. Absorbs cosmic energy. Has read everything. Annotated most of it.'},
{key:{beak:'hook',feathers:'fire',feet:'talons',size:'kaiju',personality:'chaotic',power:'laser',habitat:'volcano',diet:'chaos',social:'lone',quirk:'multiplies'},
 name:'The Inferno Flock',emoji:'🔥',rarity:'epic',desc:'One became many. The volcano is at capacity. Insurance companies have stopped answering calls.'},
{key:{beak:'snorkel',feathers:'brown',feet:'webbed',size:'normal',personality:'chill',power:'none',habitat:'pond',diet:'bread',social:'flock',quirk:'glowing'},
 name:'The Glowing Pond Diver',emoji:'🤿',rarity:'common',desc:'A normal duck that inexplicably glows. Pond tourism is up 300%. The duck does not know why.'},
{key:{beak:'spoon',feathers:'gold',feet:'webbed',size:'tiny',personality:'chill',power:'none',habitat:'pond',diet:'bread',social:'flock',quirk:'glowing'},
 name:'The Gilded Spoonbill',emoji:'🥄',rarity:'common',desc:'Tiny. Golden. Scoops soup with incredible grace. The flock defers all catering decisions to this duck.'},
{key:{beak:'flat',feathers:'void',feet:'talons',size:'normal',personality:'villain',power:'mind',habitat:'dimension',diet:'souls',social:'lone',quirk:'invisible'},
 name:'The Pocket Dimension Tyrant',emoji:'🌑',rarity:'epic',desc:'Rules a private dimension. Occasionally invisible. Consumes souls recreationally. Has strong opinions about minimalism.'},
{key:{beak:'drill',feathers:'bald',feet:'jets',size:'kaiju',personality:'chaotic',power:'quack',habitat:'city',diet:'chaos',social:'internet',quirk:'multiplies'},
 name:'The Urban Demolisher',emoji:'🔩',rarity:'epic',desc:'Bald, jet-powered, and drill-beaked. The city has adapted. Traffic apps now route around it.'},
{key:{beak:'flat',feathers:'brown',feet:'webbed',size:'tiny',personality:'anxious',power:'none',habitat:'pond',diet:'bread',social:'lone',quirk:'rhymes'},
 name:'The Anxious Bard',emoji:'😰',rarity:'common',desc:'Alone in the pond. Worried about bread. Expresses all concerns in iambic pentameter.'},
{key:{beak:'trumpet',feathers:'gold',feet:'springs',size:'normal',personality:'celebrity',power:'mind',habitat:'city',diet:'gourmet',social:'internet',quirk:'glowing'},
 name:'The Golden Maestro',emoji:'🎺',rarity:'epic',desc:'Honks symphonies. Glows warmly. Controls minds only to fill concert halls. Critics call it transcendent.'},
{key:{beak:'snorkel',feathers:'void',feet:'webbed',size:'normal',personality:'lone',power:'none',habitat:'pond',diet:'bread',social:'ghost',quirk:'invisible'},
 name:'The Phantom Diver',emoji:'🤿',rarity:'rare',desc:'Haunts the deep end of ponds. Invisible half the time. Its ghost friends say it is very good company.'},
{key:{beak:'flat',feathers:'spiky',feet:'magnets',size:'normal',personality:'scholar',power:'none',habitat:'library',diet:'cosmic',social:'robot',quirk:'prophetic'},
 name:'The Magnetic Professor',emoji:'📚',rarity:'rare',desc:'Sticks to shelves magnetically. Predicts library closures. Its robot companion has memorised the entire catalogue.'},
{key:{beak:'hook',feathers:'rainbow',feet:'jets',size:'shifting',personality:'chaotic',power:'teleport',habitat:'space',diet:'cosmic',social:'alien',quirk:'invisible'},
 name:'The Prism Wanderer',emoji:'🌈',rarity:'epic',desc:'Changes size mid-flight. Teleports across star systems. Aliens follow it like a comet. No one can predict its next destination.'},
{key:{beak:'flat',feathers:'brown',feet:'webbed',size:'normal',personality:'wise',power:'time',habitat:'library',diet:'cosmic',social:'ghost',quirk:'ancient'},
 name:'The Eternal Librarian',emoji:'⏳',rarity:'legendary',desc:'Controls time. Chooses to use it to extend overdue book periods. The ghost staff find this deeply funny.'},
{key:{beak:'spoon',feathers:'rainbow',feet:'springs',size:'large',personality:'chill',power:'none',habitat:'pond',diet:'gourmet',social:'flock',quirk:'glowing'},
 name:'The Rainbow Brunch Duck',emoji:'🌈',rarity:'rare',desc:'Leads the flock to upscale outdoor cafes. Glows beautifully while doing so. Tips well. Everyone loves it.'},
{key:{beak:'drill',feathers:'fire',feet:'talons',size:'large',personality:'villain',power:'laser',habitat:'volcano',diet:'souls',social:'lone',quirk:'cursed'},
 name:'The Volcanic Inquisitor',emoji:'🌋',rarity:'legendary',desc:'Fire-feathered. Drill-beaked. Consumes souls near the caldera. The curse is considered a feature, not a bug.'},
{key:{beak:'flat',feathers:'brown',feet:'webbed',size:'micro',personality:'anxious',power:'none',habitat:'pond',diet:'bread',social:'flock',quirk:'invisible'},
 name:'The Invisible Crumb',emoji:'🔬',rarity:'common',desc:'Microscopic and sometimes invisible. Extremely anxious about being stepped on. The flock tries its best.'},
{key:{beak:'trumpet',feathers:'bald',feet:'wheels',size:'normal',personality:'chill',power:'none',habitat:'city',diet:'memes',social:'internet',quirk:'rhymes'},
 name:'The Bald Rolling Bard',emoji:'🎺',rarity:'common',desc:'Wheels through the city. Honks rhyming memes. Bald and unbothered. Has a newsletter called The Quack Weekly.'},
{key:{beak:'hook',feathers:'spiky',feet:'talons',size:'large',personality:'villain',power:'quack',habitat:'city',diet:'chaos',social:'lone',quirk:'cursed'},
 name:'The Urban Predator',emoji:'🦅',rarity:'rare',desc:'Stalks rooftops. Sonic-quacks windows open. The curse means its parking tickets multiply. It does not care.'},
{key:{beak:'snorkel',feathers:'gold',feet:'jets',size:'shifting',personality:'celebrity',power:'teleport',habitat:'space',diet:'cosmic',social:'alien',quirk:'glowing'},
 name:'The Nebula Celebrity',emoji:'🌟',rarity:'legendary',desc:'Golden. Glowing. Teleports between star systems for appearances. Its alien fans built a moon in its honour.'},
{key:{beak:'flat',feathers:'brown',feet:'webbed',size:'normal',personality:'chill',power:'none',habitat:'pond',diet:'bread',social:'flock',quirk:'rhymes'},
 name:'The Pond Poet',emoji:'🦆',rarity:'common',desc:'Extremely normal except it rhymes constantly. The flock has adapted. Bread requests are now always in verse.'},
{key:{beak:'laser',feathers:'void',feet:'magnets',size:'large',personality:'scholar',power:'quantum',habitat:'dimension',diet:'cosmic',social:'robot',quirk:'ancient'},
 name:'The Quantum Scholar',emoji:'⚛️',rarity:'legendary',desc:'Ancient beyond measure. Exists across dimensions. Laser beak used only for extremely precise academic citations.'},
{key:{beak:'spoon',feathers:'spiky',feet:'springs',size:'tiny',personality:'chaotic',power:'none',habitat:'pond',diet:'chaos',social:'flock',quirk:'multiplies'},
 name:'The Spiny Scoop Mob',emoji:'🥄',rarity:'epic',desc:'One tiny chaotic duck that multiplies nightly. The flock now has over 400 members. The pond is at capacity.'},
{key:{beak:'flat',feathers:'rainbow',feet:'webbed',size:'normal',personality:'chill',power:'none',habitat:'pond',diet:'bread',social:'flock',quirk:'glowing'},
 name:'The Rainbow Pond Regular',emoji:'🌈',rarity:'common',desc:'Rainbow feathers and a gentle glow. Completely unbothered by any of this. Bread schedule is sacred.'},
{key:{beak:'drill',feathers:'gold',feet:'magnets',size:'normal',personality:'wise',power:'time',habitat:'library',diet:'gourmet',social:'ghost',quirk:'prophetic'},
 name:'The Gilded Oracle',emoji:'⏳',rarity:'epic',desc:'Drills through archives at will. Predicts events with eerie accuracy. The ghosts book readings two weeks in advance.'},
{key:{beak:'hook',feathers:'brown',feet:'roots',size:'large',personality:'wise',power:'none',habitat:'library',diet:'cosmic',social:'lone',quirk:'ancient'},
 name:'The Rooted Elder',emoji:'🧙',rarity:'rare',desc:'Ancient roots. Hooked beak used to turn pages gently. Has been in this corner of the library since before the building.'},
{key:{beak:'trumpet',feathers:'fire',feet:'springs',size:'kaiju',personality:'chaotic',power:'quack',habitat:'city',diet:'memes',social:'internet',quirk:'multiplies'},
 name:'The Viral Kaiju',emoji:'🔥',rarity:'epic',desc:'City-sized. Flame-feathered. Its sonic quacks trend globally. There are more every morning and each one posts content.'},
{key:{beak:'snorkel',feathers:'brown',feet:'webbed',size:'normal',personality:'anxious',power:'none',habitat:'pond',diet:'bread',social:'lone',quirk:'invisible'},
 name:'The Phantom Worrier',emoji:'🤿',rarity:'common',desc:'Anxious. Occasionally invisible. Extremely worried about the bread situation. Alone but manages.'},
{key:{beak:'flat',feathers:'bald',feet:'wheels',size:'micro',personality:'anxious',power:'none',habitat:'city',diet:'memes',social:'internet',quirk:'rhymes'},
 name:'The Micro Content Duck',emoji:'🔬',rarity:'rare',desc:'Microscopic and online. Posts memes in rhyme. Has 2 million followers who are not sure what they are following.'},
{key:{beak:'laser',feathers:'gold',feet:'jets',size:'normal',personality:'celebrity',power:'mind',habitat:'space',diet:'cosmic',social:'alien',quirk:'glowing'},
 name:'The Galactic Idol',emoji:'🌟',rarity:'epic',desc:'Jet-propelled across galaxies. Laser beak for autographs. Alien fanbase controls three star systems in its name.'},
{key:{beak:'hook',feathers:'void',feet:'talons',size:'large',personality:'villain',power:'time',habitat:'dimension',diet:'souls',social:'lone',quirk:'ancient'},
 name:'The Void Sovereign',emoji:'🌑',rarity:'legendary',desc:'Rules a pocket dimension from before the big bang. Consumes souls for sustenance. Pauses time for dramatic effect.'},
{key:{beak:'spoon',feathers:'brown',feet:'webbed',size:'normal',personality:'chill',power:'none',habitat:'pond',diet:'bread',social:'flock',quirk:'glowing'},
 name:'The Luminous Spoonbill',emoji:'🥄',rarity:'common',desc:'Gently glowing. Scoops soup peacefully. The flock follows it home each evening by its light.'},
];

const SYNERGIES=[
{traits:{power:'laser',beak:'laser'}, bonus:{wrd:3}, label:'Double Laser', desc:'Two lasers. Science weeps.'},
{traits:{personality:'villain',power:'laser'}, bonus:{str:2,wrd:2}, label:'Evil Genius', desc:'The laser was always part of the plan.'},
{traits:{habitat:'space',feet:'jets'}, bonus:{spd:3}, label:'Zero-G Sprint', desc:'Jet feet + space = unstoppable velocity.'},
{traits:{diet:'souls',personality:'villain'}, bonus:{str:2,int:2}, label:'Dark Harvest', desc:'The most ethically questionable combo.'},
{traits:{social:'alien',habitat:'space'}, bonus:{int:2,wrd:2}, label:'First Contact', desc:'Out there, among the stars, they were expected.'},
{traits:{personality:'scholar',habitat:'library'}, bonus:{int:4}, label:'Academic Excellence', desc:'A duck in its natural habitat.'},
{traits:{quirk:'multiplies',personality:'chaotic'}, bonus:{wrd:5}, label:'Chaos Cascade', desc:'No one knows how many there are now.'},
{traits:{power:'quantum',habitat:'dimension'}, bonus:{int:3,wrd:3}, label:'Quantum Fold', desc:'The duck and its dimension are one.'},
{traits:{feathers:'rainbow',social:'internet'}, bonus:{cha:4}, label:'Main Character Energy', desc:'The algorithm chose this duck before it even posted.'},
{traits:{quirk:'ancient',power:'time'}, bonus:{int:5,wrd:4}, label:'Temporal Colossus', desc:'Older than time. Controls time. Very tired.'},
{traits:{personality:'celebrity',diet:'memes'}, bonus:{cha:5}, label:'Peak Clout', desc:'Famous for eating irony. Somehow it works.'},
{traits:{size:'kaiju',quirk:'multiplies'}, bonus:{str:4,wrd:4}, label:'Kaiju Swarm', desc:'There are now hundreds of kaiju. City planners have resigned.'},
{traits:{beak:'trumpet',quirk:'rhymes'}, bonus:{cha:3,wrd:2}, label:'The Rhyming Herald', desc:'The honk is a sonnet. The sonnet is a honk.'},
{traits:{feathers:'void',habitat:'dimension'}, bonus:{wrd:4,int:2}, label:'Void Walker', desc:'Light cannot find this duck. The dimension hides it.'},
{traits:{feet:'roots',personality:'wise'}, bonus:{int:3,cha:2}, label:'Deep Roots', desc:'Patient. Grounded. Literally growing into the ground.'},
];

const RARITY_CONFIG={
common: {label:'Common', color:'#8a9bb0', glow:'rgba(138,155,176,0.3)', stars:1},
rare: {label:'Rare', color:'#4a9eff', glow:'rgba(74,158,255,0.4)', stars:2},
epic: {label:'Epic', color:'#b060ff', glow:'rgba(176,96,255,0.5)', stars:3},
legendary:{label:'Legendary', color:'#ffd700', glow:'rgba(255,215,0,0.6)', stars:4},
};

const TRAIT_KEYS=Object.keys(TRAITS);
const TRAIT_LABELS={beak:'Beak',feathers:'Feathers',feet:'Feet',size:'Size',personality:'Personality',power:'Power',habitat:'Habitat',diet:'Diet',social:'Social',quirk:'Quirk'};
const GEN_MAX=TRAIT_KEYS.length;
let gen=0, choices={}, discovered=[];

_evoEl=_ce('div');
_evoEl.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000085;background:#0a0b18;display:flex;flex-direction:column;font-family:Nunito,sans-serif;overflow:hidden;';
window._evoEl=_evoEl;
_evoEl.innerHTML=`<style>
#evo-wrap{display:flex;flex-direction:column;height:100%;overflow:hidden;}
#evo-header{background:#111228;height:52px;display:flex;align-items:center;padding:0 10px;gap:6px;border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0;overflow-x:auto;scrollbar-width:none;}
#evo-back{background:rgba(255,255,255,0.08);border:none;color:rgba(255,255,255,0.6);font-size:11px;font-weight:900;padding:5px 10px;border-radius:8px;cursor:pointer;font-family:Nunito,sans-serif;}
#evo-title{font-size:14px;font-weight:900;color:#fff;letter-spacing:0.02em;}
#evo-dex-btn{margin-left:auto;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.7);font-size:11px;font-weight:900;padding:5px 10px;border-radius:8px;cursor:pointer;font-family:Nunito,sans-serif;}
#evo-steps{display:flex;padding:10px 14px 8px;gap:4px;flex-shrink:0;background:#0e0f20;border-bottom:1px solid rgba(255,255,255,0.05);}
.evo-step{flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,0.08);transition:background .3s;}
.evo-step.done{background:#5a3fc0;}
.evo-step.active{background:#8a6fff;box-shadow:0 0 8px rgba(138,111,255,0.6);}
#evo-preview-bar{display:flex;align-items:center;justify-content:center;gap:6px;padding:10px 14px 8px;flex-shrink:0;background:#0e0f20;border-bottom:1px solid rgba(255,255,255,0.05);min-height:52px;}
.evo-preview-chip{background:#1a1c30;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:4px 8px;font-size:12px;transition:all .2s;}
.evo-preview-chip.active{border-color:rgba(138,111,255,0.5);background:#221e44;}
#evo-body{flex:1;overflow-y:auto;padding:14px;scrollbar-width:none;display:flex;flex-direction:column;align-items:center;}
#evo-body::-webkit-scrollbar{display:none;}
#evo-trait-label{font-size:20px;font-weight:900;color:#fff;margin-bottom:4px;text-align:center;}
#evo-trait-sub{font-size:12px;color:rgba(255,255,255,0.38);margin-bottom:14px;text-align:center;}
.evo-option{width:100%;max-width:360px;background:#14162a;border:2px solid rgba(255,255,255,0.07);border-radius:14px;padding:13px 15px;margin-bottom:9px;cursor:pointer;display:flex;align-items:center;gap:13px;transition:all .15s;position:relative;overflow:hidden;}
.evo-option:hover,.evo-option:active{border-color:rgba(138,111,255,0.55);background:#1e2040;transform:translateY(-1px);}
.evo-opt-emoji{font-size:26px;width:34px;text-align:center;flex-shrink:0;}
.evo-opt-name{font-size:13px;font-weight:900;color:#e8eaff;}
.evo-opt-desc{font-size:11px;color:rgba(232,234,255,0.38);margin-top:2px;}
.evo-opt-stats{display:flex;gap:5px;margin-top:6px;flex-wrap:wrap;}
.evo-stat-pip{font-size:9px;font-weight:900;padding:2px 6px;border-radius:5px;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);}
.evo-stat-pip.pos{color:#6dff9a;background:rgba(109,255,154,0.1);}
.evo-stat-pip.neg{color:#ff6d6d;background:rgba(255,109,109,0.1);}
/* result */
#evo-result-wrap{width:100%;max-width:380px;display:flex;flex-direction:column;align-items:center;}
#evo-result-glow{font-size:80px;text-align:center;margin:10px 0;filter:drop-shadow(0 0 20px var(--rarity-glow,rgba(255,215,0,0.5)));animation:evoFloat 3s ease-in-out infinite;}
@keyframes evoFloat{0%,100%{transform:translateY(0);}50%{transform:translateY(-8px);}}
#evo-result-rarity{font-size:11px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;padding:3px 12px;border-radius:10px;margin-bottom:8px;}
#evo-result-name{font-size:22px;font-weight:900;color:#f5e642;text-align:center;margin-bottom:6px;line-height:1.2;}
#evo-result-desc{font-size:13px;color:rgba(255,255,255,0.55);text-align:center;max-width:300px;margin-bottom:16px;line-height:1.5;}
#evo-stats-panel{width:100%;max-width:340px;background:#14162a;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:13px;margin-bottom:14px;}
.evo-stat-row{display:flex;align-items:center;gap:8px;margin-bottom:7px;}
.evo-stat-row:last-child{margin-bottom:0;}
.evo-stat-name{font-size:11px;font-weight:900;color:rgba(255,255,255,0.5);width:90px;flex-shrink:0;}
.evo-stat-bar-wrap{flex:1;height:8px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;}
.evo-stat-bar{height:100%;border-radius:4px;transition:width 1s cubic-bezier(.25,.8,.25,1);}
.evo-stat-val{font-size:11px;font-weight:900;color:rgba(255,255,255,0.6);width:24px;text-align:right;}
#evo-synergies{width:100%;max-width:340px;margin-bottom:14px;}
.evo-synergy{background:rgba(255,215,0,0.07);border:1px solid rgba(255,215,0,0.2);border-radius:10px;padding:8px 12px;margin-bottom:7px;font-size:11px;}
.evo-syn-label{font-weight:900;color:#f5c842;margin-bottom:2px;}
.evo-syn-desc{color:rgba(255,255,255,0.45);}
#evo-trait-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:5px;margin-bottom:16px;width:100%;max-width:340px;}
.evo-trait-chip{display:inline-flex;align-items:center;gap:5px;background:#1a1c30;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);}
#evo-result-btns{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;width:100%;max-width:340px;margin-bottom:14px;}
.evo-btn{padding:11px 20px;border-radius:12px;border:none;font-size:12px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;transition:opacity .15s;}
.evo-btn:hover{opacity:.85;}
#evo-new-badge{font-size:11px;font-weight:900;background:rgba(109,255,154,0.15);border:1px solid rgba(109,255,154,0.3);color:#6dff9a;padding:4px 12px;border-radius:10px;margin-bottom:10px;}
/* dex overlay */
#evo-dex{position:absolute;inset:0;background:#090a15;z-index:10;display:none;flex-direction:column;}
#evo-dex-header{background:#111228;height:52px;display:flex;align-items:center;padding:0 14px;gap:10px;border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0;}
#evo-dex-close{background:rgba(255,255,255,0.08);border:none;color:rgba(255,255,255,0.6);font-size:11px;font-weight:900;padding:5px 10px;border-radius:8px;cursor:pointer;font-family:Nunito,sans-serif;}
#evo-dex-body{flex:1;overflow-y:auto;padding:12px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.08) transparent;}
#evo-dex-count{font-size:12px;font-weight:900;color:rgba(255,255,255,0.4);text-align:center;padding:8px;margin-bottom:4px;}
#evo-dex-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
.evo-dex-card{background:#14162a;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:10px 6px;text-align:center;cursor:pointer;transition:border-color .15s;}
.evo-dex-card.found{border-color:rgba(255,255,255,0.15);}
.evo-dex-card.found:hover{border-color:rgba(138,111,255,0.4);}
.evo-dex-card-em{font-size:28px;margin-bottom:4px;}
.evo-dex-card-name{font-size:9px;font-weight:900;color:rgba(255,255,255,0.6);line-height:1.2;}
.evo-dex-card-rarity{font-size:8px;font-weight:900;margin-top:3px;letter-spacing:.06em;}
/* spark particles */
.evo-spark{position:absolute;pointer-events:none;font-size:16px;animation:evoSpark 1s ease-out forwards;}
@keyframes evoSpark{0%{opacity:1;transform:translate(0,0) scale(1);}100%{opacity:0;transform:translate(var(--sx),var(--sy)) scale(0);}}
</style>
<div id="evo-wrap">
<div id="evo-header">
<button id="evo-back" onclick="window._exitEvolution()">🏠 Menu</button>
<div id="evo-title">🧬 Duck Evolution</div>
<button id="evo-dex-btn">📖 Dex</button>
</div>
<div id="evo-steps"></div>
<div id="evo-preview-bar"></div>
<div id="evo-body"></div>
<div id="evo-dex">
<div id="evo-dex-header">
<button id="evo-dex-close">← Back</button>
<div id="evo-title">📖 Duck Dex</div>
</div>
<div id="evo-dex-body">
<div id="evo-dex-count"></div>
<div id="evo-dex-grid"></div>
</div>
</div>
</div>`;
_ba(_evoEl);

const $=id=>_evoEl.querySelector('#'+id);
const stepsEl=$('evo-steps');
const previewBar=$('evo-preview-bar');
const body=$('evo-body');

function saveDiscovered(){}
function buildSteps(){
stepsEl.innerHTML='';
TRAIT_KEYS.forEach((_,i)=>{
const s=_ce('div');
s.className='evo-step'+(i<gen?' done':i===gen?' active':'');
stepsEl.appendChild(s);
});
}
function buildPreviewBar(){
previewBar.innerHTML='';
TRAIT_KEYS.forEach(k=>{
const chip=_ce('div');chip.className='evo-preview-chip'+(k===TRAIT_KEYS[gen]?' active':'');
if(choices[k]){
const t=TRAITS[k].find(x=>x.id===choices[k]);
chip.textContent=t?t.emoji+''+t.id.slice(0,4):'?';
chip.title=TRAIT_LABELS[k]+': '+t?.label;
} else {
chip.textContent=k.slice(0,3);
chip.style.opacity='0.3';
}
previewBar.appendChild(chip);
});
}
function getActiveSynergies(){
return SYNERGIES.filter(s=>Object.entries(s.traits).every(([k,v])=>choices[k]===v));
}
function computeStats(){
const base={spd:0,str:0,int:0,cha:0,wrd:0};
TRAIT_KEYS.forEach(k=>{
const t=TRAITS[k].find(x=>x.id===choices[k]);
if(t)Object.entries(t.stats).forEach(([s,v])=>base[s]=(base[s]||0)+v);
});
getActiveSynergies().forEach(syn=>Object.entries(syn.bonus).forEach(([s,v])=>base[s]=(base[s]||0)+v));
Object.keys(base).forEach(k=>base[k]=Math.max(0,Math.min(20,base[k])));
return base;
}
function startGeneration(){buildSteps();buildPreviewBar();renderPick();}
function renderPick(){
const traitKey=TRAIT_KEYS[gen];
const all=TRAITS[traitKey];
const opts=[...all].sort(()=>_mr()-0.5).slice(0,4);
const traitName=TRAIT_LABELS[traitKey];
body.innerHTML='';
const lbl=_ce('div');lbl.id='evo-trait-label';lbl.textContent='Choose your '+traitName;body.appendChild(lbl);
const sub=_ce('div');sub.id='evo-trait-sub';sub.textContent='Step '+(gen+1)+' of '+GEN_MAX;body.appendChild(sub);
opts.forEach(o=>{
const d=_ce('div');d.className='evo-option';
const statEntries=Object.entries(o.stats).filter(([,v])=>v!==0);
d.innerHTML='<div class="evo-opt-emoji">'+o.emoji+'</div><div style="flex:1"><div class="evo-opt-name">'+o.label+'</div><div class="evo-opt-desc">'+o.desc+'</div>'+(statEntries.length?'<div class="evo-opt-stats">'+statEntries.map(([k,v])=>'<span class="evo-stat-pip '+(v>0?'pos':'neg')+'">'+(v>0?'+':'')+v+' '+k.toUpperCase()+'</span>').join('')+'</div>':'')+'</div>';
d.addEventListener('click',()=>evoPick(traitKey,o.id));
body.appendChild(d);
});
}
function evoPick(traitKey,optId){
choices[traitKey]=optId;
gen++;
if(gen>=GEN_MAX){renderResult();}
else{startGeneration();}
}
window._evoPick=function(tk,oid){evoPick(tk,oid);};
function matchSpecies(){
return SPECIES_DB.find(s=>Object.entries(s.key).every(([k,v])=>choices[k]===v))||null;
}
function generateSpecies(){
const PFXB={flat:'Common',hook:'Hawkish',spoon:'Spoonsome',trumpet:'Honking',snorkel:'Deep',drill:'Industrial',laser:'Laser-Beaked'};
const PFXF={brown:'Russet',rainbow:'Prismatic',spiky:'Spined',bald:'Bare',gold:'Golden',void:'Void',fire:'Inferno'};
const SFXF={webbed:'Paddler',talons:'Gryphon',wheels:'Wheelier',springs:'Bouncer',magnets:'Magnet',jets:'Rocketeer',roots:'Elder'};
const SFXP={chill:'Rex',anxious:'Noodle',villain:'Tyrant',wise:'Sage',chaotic:'Wraith',scholar:'Professor',celebrity:'Star'};
const SFXH={pond:'of the Pond',city:'of the City',volcano:'of the Caldera',space:'of the Cosmos',library:'of the Archives',dimension:'Between Worlds'};
const pre=[PFXF[choices.feathers]||'',PFXB[choices.beak]||''].filter(Boolean).join(' ');
const suf=(SFXF[choices.feet]||'Duck')+' '+((SFXP[choices.personality]||''))+' '+(SFXH[choices.habitat]||'');
const emojis={tiny:'🐣',micro:'🔬',normal:'🦆',large:'🐦',kaiju:'🦕',shifting:'🔄'};
const rareScore=computeStats();
const total=Object.values(rareScore).reduce((a,b)=>a+b,0);
const rarity=total>=50?'legendary':total>=35?'epic':total>=20?'rare':'common';
return{name:(pre+' '+suf).trim().replace(/\s+/g,' '),emoji:emojis[choices.size]||'🦆',rarity,desc:'A unique hybrid. Scientists are baffled. You should be proud.'};
}
function renderResult(){
buildSteps();buildPreviewBar();
const match=matchSpecies();
const species=match||generateSpecies();
const rc=RARITY_CONFIG[species.rarity];
const isNew=!discovered.includes(species.name);
if(isNew){discovered.push(species.name);saveDiscovered();}
const stats=computeStats();
const synergies=getActiveSynergies();
const STAT_COLORS={spd:'#6dbaff',str:'#ff7070',int:'#a0e0ff',cha:'#ffba6d',wrd:'#c06dff'};
const STAT_LABELS={spd:'Speed',str:'Strength',int:'Intelligence',cha:'Charisma',wrd:'Weirdness'};
body.innerHTML='';
const wrap=_ce('div');wrap.id='evo-result-wrap';
if(isNew){const b=_ce('div');b.id='evo-new-badge';b.textContent='✨ New Species Discovered!';wrap.appendChild(b);}
const glow=_ce('div');glow.id='evo-result-glow';
glow.textContent=species.emoji;
glow.style.setProperty('--rarity-glow',rc.glow);
wrap.appendChild(glow);
const rar=_ce('div');rar.id='evo-result-rarity';
rar.textContent='★'.repeat(rc.stars)+' '+rc.label;
rar.style.cssText='background:rgba(0,0,0,0.3);border:1px solid '+rc.color+';color:'+rc.color+';font-size:11px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;padding:3px 12px;border-radius:10px;margin-bottom:8px;';
wrap.appendChild(rar);
const nm=_ce('div');nm.id='evo-result-name';nm.textContent=species.name;nm.style.color=rc.color;wrap.appendChild(nm);
const ds=_ce('div');ds.id='evo-result-desc';ds.textContent=species.desc;wrap.appendChild(ds);
const sp=_ce('div');sp.id='evo-stats-panel';
const title=_ce('div');title.style.cssText='font-size:11px;font-weight:900;color:rgba(255,255,255,0.4);margin-bottom:10px;text-transform:uppercase;letter-spacing:.08em;';title.textContent='Stats';sp.appendChild(title);
Object.entries(stats).forEach(([k,v])=>{
const row=_ce('div');row.className='evo-stat-row';
const nm2=_ce('div');nm2.className='evo-stat-name';nm2.textContent=STAT_LABELS[k];row.appendChild(nm2);
const bw=_ce('div');bw.className='evo-stat-bar-wrap';
const bf=_ce('div');bf.className='evo-stat-bar';bf.style.background=STAT_COLORS[k];bf.style.width='0%';
bw.appendChild(bf);row.appendChild(bw);
const vl=_ce('div');vl.className='evo-stat-val';vl.textContent=v;row.appendChild(vl);
sp.appendChild(row);
setTimeout(()=>bf.style.width=Math.min(100,(v/20)*100)+'%',100);
});
wrap.appendChild(sp);
if(synergies.length){
const synWrap=_ce('div');synWrap.id='evo-synergies';
const sl=_ce('div');sl.style.cssText='font-size:11px;font-weight:900;color:rgba(255,215,0,0.6);margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em;';sl.textContent='Synergies';synWrap.appendChild(sl);
synergies.forEach(s=>{
const card=_ce('div');card.className='evo-synergy';
card.innerHTML='<div class="evo-syn-label">⚡ '+s.label+'</div><div class="evo-syn-desc">'+s.desc+'</div>';
synWrap.appendChild(card);
});
wrap.appendChild(synWrap);
}
const chips=_ce('div');chips.id='evo-trait-chips';
TRAIT_KEYS.forEach(k=>{
const t=TRAITS[k].find(x=>x.id===choices[k]);
if(t){const c=_ce('span');c.className='evo-trait-chip';c.textContent=t.emoji+' '+t.label;chips.appendChild(c);}
});
wrap.appendChild(chips);
const btns=_ce('div');btns.id='evo-result-btns';
const menuBtn=_ce('button');menuBtn.className='evo-btn';menuBtn.style.cssText='background:#1e2040;color:rgba(255,255,255,0.6);';menuBtn.textContent='🏠 Menu';menuBtn.onclick=()=>window._exitEvolution();
const restartBtn=_ce('button');restartBtn.className='evo-btn';restartBtn.style.cssText='background:linear-gradient(90deg,#5030a0,#3818a0);color:#fff;';restartBtn.textContent='🔄 Evolve Again';restartBtn.onclick=evoRestart;
const mutateBtn=_ce('button');mutateBtn.className='evo-btn';mutateBtn.style.cssText='background:linear-gradient(90deg,#803020,#601010);color:#fff;';mutateBtn.textContent='☢️ Mutate';mutateBtn.onclick=evoMutate;
const copyBtn=_ce('button');copyBtn.className='evo-btn';copyBtn.style.cssText='background:#1a1c30;border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.7);';copyBtn.textContent='📋 Copy Code';
copyBtn.onclick=()=>{
const code=TRAIT_KEYS.map(k=>k.slice(0,3)+':'+choices[k]).join('|');
try{navigator.clipboard.writeText(code);copyBtn.textContent='✅ Copied!';}catch(e){copyBtn.textContent=code.slice(0,20)+'...';}
setTimeout(()=>copyBtn.textContent='📋 Copy Code',2000);
};
btns.appendChild(menuBtn);btns.appendChild(restartBtn);btns.appendChild(mutateBtn);btns.appendChild(copyBtn);
wrap.appendChild(btns);
body.appendChild(wrap);
if(isNew||species.rarity==='legendary'||species.rarity==='epic')spawnResultSparks();
}
function spawnResultSparks(){
const SPARKS=['✨','⭐','💫','🌟','🎊','🔮'];
for(let i=0;i<(loc.stars||20);i++){
const s=_ce('div');s.className='evo-spark';
s.textContent=SPARKS[_mf(_mr()*SPARKS.length)];
const a=_mr()*_pi*2,r=80+_mr()*120;
s.style.setProperty('--sx',Math.cos(a)*r+'px');
s.style.setProperty('--sy',Math.sin(a)*r+'px');
s.style.left=(30+_mr()*40)+'%';
s.style.top=(20+_mr()*30)+'%';
s.style.animationDelay=(_mr()*0.5)+'s';
body.appendChild(s);
setTimeout(()=>{try{s.remove();}catch(e){}},1500);
}
}
function evoMutate(){
const k=TRAIT_KEYS[_mf(_mr()*TRAIT_KEYS.length)];
const old=choices[k];
const opts=TRAITS[k].filter(x=>x.id!==old);
choices[k]=opts[_mf(_mr()*opts.length)].id;
renderResult();
}
function evoRestart(){gen=0;choices={};startGeneration();}
window._evoRestart=evoRestart;

// Dex
$('evo-dex-btn').addEventListener('click',()=>{
const dex=$('evo-dex');
dex.style.display='flex';
const grid=$('evo-dex-grid');
grid.innerHTML='';
$('evo-dex-count').textContent=discovered.length+' / '+SPECIES_DB.length+' named species discovered (+ infinite procedural)';
SPECIES_DB.forEach(s=>{
const found=discovered.includes(s.name);
const rc=RARITY_CONFIG[s.rarity];
const card=_ce('div');card.className='evo-dex-card'+(found?' found':'');
card.innerHTML='<div class="evo-dex-card-em">'+(found?s.emoji:'❓')+'</div><div class="evo-dex-card-name">'+(found?s.name:'???')+'</div><div class="evo-dex-card-rarity" style="color:'+(found?rc.color:'rgba(255,255,255,0.2)')+'">'+rc.label+'</div>';
grid.appendChild(card);
});
});
$('evo-dex-close').addEventListener('click',()=>$('evo-dex').style.display='none');

startGeneration();
}

})();
(()=>{
let _diveEl=null,_diveRAF=null;
window._launchDive=function(){
  window.paused=true;
  if(window._menuEl)window._menuEl.style.display='none';
  if(window._homeBtn)window._homeBtn.style.display='';
  window._diveActive=true;
  if(_diveEl){_diveEl.remove();_diveEl=null;}
  if(_diveRAF){_caf(_diveRAF);_diveRAF=null;}
  _buildDive();
};
window._exitDive=function(){
  window._diveActive=false;
  window.paused=false;
  if(_diveEl){_diveEl.remove();_diveEl=null;}
  if(_diveRAF){_caf(_diveRAF);_diveRAF=null;}
  if(window._menuEl)window._menuEl.style.display='flex';
  if(window._randomiseFeatured)window._randomiseFeatured();
  if(window._homeBtn)window._homeBtn.style.display='none';
};

function _buildDive(){
// ── Constants ─────────────────────────────────────────────
const PPM=4; // pixels per metre at base — world Y / PPM = depth in metres
const ZONES=[
  {name:'Shallows',    minD:0,   maxD:30,  skyT:'#001a30',skyB:'#003050', waterT:'#0a3a5a',waterB:'#082840', accent:'#40c8f0', fish:['🐠','🐡','🦐','🐟','🐚'], hazMinD:999},
  {name:'Reef',        minD:30,  maxD:80,  skyT:'#001020',skyB:'#002040', waterT:'#082040',waterB:'#061528', accent:'#2090d0', fish:['🐠','🦑','🐙','🦞','🐟'], hazMinD:30},
  {name:'Twilight',    minD:80,  maxD:150, skyT:'#000c18',skyB:'#001030', waterT:'#031420',waterB:'#020c18', accent:'#6040c0', fish:['🦈','🐙','🦑','🦀','🐡'], hazMinD:50},
  {name:'Midnight',    minD:150, maxD:280, skyT:'#050412',skyB:'#080618', waterT:'#060410',waterB:'#04020c', accent:'#4020a0', fish:['🦈','🐙','💀','🦑','🦠'], hazMinD:80},
  {name:'Abyss',       minD:280, maxD:450, skyT:'#030208',skyB:'#050310', waterT:'#04020c',waterB:'#030108', accent:'#200860', fish:['🐡','🦠','🫧','👾','🌑'], hazMinD:100},
  {name:'Hadal',       minD:450, maxD:650, skyT:'#020106',skyB:'#030208', waterT:'#030108',waterB:'#020106', accent:'#100430', fish:['👾','🦠','💀','🌑','☠️'], hazMinD:120},
  {name:'Void',        minD:650, maxD:900, skyT:'#010104',skyB:'#020106', waterT:'#020106',waterB:'#010104', accent:'#0a0218', fish:['☠️','🌑','👾','🦠','💎'], hazMinD:150},
  {name:'The Trench',  minD:900, maxD:9999,skyT:'#000002',skyB:'#010104', waterT:'#010104',waterB:'#000002', accent:'#ff40ff', fish:['💎','👑','🌟','☠️','🌑'], hazMinD:200},
];
const FISH_RARITIES=[
  {name:'Common',   color:'#aaaaaa',mult:1,   w:55},
  {name:'Uncommon', color:'#40c840',mult:4,   w:28},
  {name:'Rare',     color:'#4080ff',mult:15,  w:12},
  {name:'Epic',     color:'#c040ff',mult:60,  w:4},
  {name:'Legendary',color:'#ffd700',mult:250, w:1},
];
function _upgCost(baseCost,lvl){return Math.ceil(baseCost*Math.pow(1.35,lvl));}
const UPGRADES=[
  {id:'lungs',e:'🫁',name:'Lung Capacity',desc:'Bigger air tank',       baseCost:50,  effect:lvl=>`+${lvl*20}% air`},
  {id:'fins', e:'🏊',name:'Power Fins',   desc:'Swim faster',           baseCost:80,  effect:lvl=>`+${lvl*15}% speed`},
  {id:'suit', e:'🦺',name:'Pressure Suit',desc:'Survive deeper zones',  baseCost:150, effect:lvl=>`-${Math.min(lvl*12,80)}% air drain`},
  {id:'sonar',e:'🔦',name:'Sonar',        desc:'Highlights rare fish',  baseCost:200, effect:lvl=>lvl<=1?'Highlights rares':lvl<=2?'Highlights epics too':`Highlights all + ${lvl-2} bonus fish/zone`},
  {id:'net',  e:'🪤',name:'Catch Net',    desc:'Larger catch radius',   baseCost:100, effect:lvl=>`+${lvl*40}% catch radius`},
];
const HAZ_TYPES=[
  {e:'🪼',dmg:8, spd:25,name:'Jellyfish',  minD:30},
  {e:'🦈',dmg:22,spd:65,name:'Shark',      minD:80},
  {e:'🐡',dmg:6, spd:18,name:'Pufferfish', minD:50},
  {e:'🦑',dmg:12,spd:38,name:'Squid',      minD:60},
  {e:'🐟',dmg:18,spd:48,name:'Anglerfish', minD:150},
  {e:'🦂',dmg:25,spd:55,name:'Sea Scorpion',minD:280},
  {e:'👻',dmg:15,spd:70,name:'Void Wraith', minD:450},
  {e:'🐉',dmg:35,spd:45,name:'Trench Drake',minD:650},
  {e:'👑',dmg:50,spd:30,name:'Deep King',   minD:900},
];

// ── State ─────────────────────────────────────────────────
let coins=window._diveInfiniteMoney?999999:0,upgrades={lungs:0,fins:0,suit:0,sonar:0,net:0};
if(window._diveLevel50){['lungs','fins','suit','sonar','net'].forEach(id=>{upgrades[id]=50;});}
// Duck world coords
let duck={wx:0,wy:0,vx:0,vy:0,angle:Math.PI/2,speed:110};
// Camera — worldY of top of screen
let camY=0,targetCamY=0;
let depth=0;
let air=100,maxAir=100;
let fish=[],bubbles=[],hazards=[],particles=[];
let holding=false,holdX=0,holdY=0;
let gameOver=false,surfaced=true,diving=false;
let sessionFish=[],catchLog=[];
let frameCount=0,lastTs=0;
// Parallax layers: rocks/plants at different depths
let decorations=[];

// ── Helpers ──────────────────────────────────────────────
function getUpgLvl(id){return upgrades[id]||0;}
function getMaxAir(){return 100*(1+getUpgLvl('lungs')*0.2);}
function getSpeed(){return 110*(1+getUpgLvl('fins')*0.15);}
function getDrainMult(){return Math.max(0.05,1-getUpgLvl('suit')*0.12);}
function getCatchR(){return 26*(1+getUpgLvl('net')*0.4);}
function getSonarLvl(){return getUpgLvl('sonar');}
function getZone(){for(let i=ZONES.length-1;i>=0;i--)if(depth>=ZONES[i].minD)return ZONES[i];return ZONES[0];}
function getZoneIdx(){for(let i=ZONES.length-1;i>=0;i--)if(depth>=ZONES[i].minD)return i;return 0;}
// World Y where surface is
const SURFACE_WY=0;

// ── DOM ───────────────────────────────────────────────────
_diveEl=_ce('div');
_diveEl.style.cssText='position:fixed;inset:0;z-index:1000085;overflow:hidden;font-family:Nunito,sans-serif;touch-action:none;user-select:none;-webkit-user-select:none;';
window._diveEl=_diveEl;

const cv=_ce('canvas');cv.style.cssText='position:absolute;top:0;left:0;';
_diveEl.appendChild(cv);
const ctx=cv.getContext('2d');

// HUD
const hud=_ce('div');
hud.style.cssText='position:absolute;top:0;left:0;right:0;height:52px;background:linear-gradient(180deg,rgba(0,4,16,0.9),transparent);display:flex;align-items:center;padding:0 14px;gap:10px;z-index:10;pointer-events:none;';
hud.innerHTML=`
<div style="display:flex;flex-direction:column;gap:2px;flex:1;">
  <div style="font-size:9px;font-weight:900;color:rgba(255,255,255,0.4);letter-spacing:.06em;">AIR</div>
  <div style="height:7px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;">
    <div id="dv-air-fill" style="height:100%;background:#40c8f0;border-radius:4px;transition:width .1s,background .3s;width:100%;"></div>
  </div>
</div>
<div id="dv-depth" style="font-size:13px;font-weight:900;color:#40c8f0;min-width:54px;text-align:center;">0m</div>
<div id="dv-coins" style="font-size:13px;font-weight:900;color:#ffd700;">🪙 0</div>`;
_diveEl.appendChild(hud);

// Zone + depth label
const zoneLabel=_ce('div');
zoneLabel.style.cssText='position:absolute;top:56px;left:50%;transform:translateX(-50%);font-size:11px;font-weight:900;color:rgba(255,255,255,0.9);letter-spacing:.1em;text-transform:uppercase;pointer-events:none;z-index:9;transition:color .8s,text-shadow .8s;white-space:nowrap;;text-shadow:0 0 12px currentColor,0 0 24px currentColor,';
_diveEl.appendChild(zoneLabel);

// Surface hint (shown when duck near surface)
const surfHint=_ce('div');
surfHint.style.cssText='position:absolute;top:52px;left:0;right:0;height:24px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:rgba(100,200,255,0);letter-spacing:.08em;pointer-events:none;z-index:8;transition:color .4s;';
surfHint.textContent='▲ SWIM UP TO SURFACE';
_diveEl.appendChild(surfHint);

// Flash message
const msgEl=_ce('div');
msgEl.style.cssText='position:absolute;top:86px;left:50%;transform:translateX(-50%);font-size:13px;font-weight:900;color:#fff;background:rgba(0,0,0,0.65);border-radius:20px;padding:5px 14px;pointer-events:none;z-index:15;opacity:0;transition:opacity .3s;white-space:nowrap;';
_diveEl.appendChild(msgEl);

// Shop
const shopEl=_ce('div');
shopEl.style.cssText='position:absolute;inset:0;background:rgba(0,4,16,0.97);display:none;flex-direction:column;align-items:center;z-index:20;overflow-y:auto;padding:16px 16px 40px;';
_diveEl.appendChild(shopEl);

_ba(_diveEl);

// ── Resize ───────────────────────────────────────────────
let W=0,H=0;
function resize(){
  W=window.innerWidth;H=window.innerHeight;
  cv.width=W;cv.height=H;
}
resize();
window.addEventListener('resize',resize);

// ── Flash ────────────────────────────────────────────────
function flashMsg(txt,dur=1600){
  msgEl.textContent=txt;msgEl.style.opacity='1';
  clearTimeout(msgEl._t);msgEl._t=setTimeout(()=>msgEl.style.opacity='0',dur);
}

// ── Generate decorations (rocks, plants, coral) ───────────
function genDecorations(){
  decorations=[];
  // Scatter decorative elements at various world depths
  for(let wy=H*0.3;wy<H*300;wy+=80+_mr()*120){
    const d=wy/PPM;
    const zi=ZONES.findIndex((z,i)=>d>=z.minD&&(i===ZONES.length-1||d<ZONES[i+1].minD));
    const types=[['🪸','🌿','🐚'],['🪸','🌿','🐠'],['🪨','🦀','🌊'],['🪨','💎','🌑'],['💀','🌑','⬛']];
    const pool=types[_mn(zi<0?0:zi,types.length-1)];
    decorations.push({
      wx:_mr()*W,wy,
      e:pool[_mf(_mr()*pool.length)],
      scale:0.7+_mr()*0.6,
      side:_mr()<0.5?'left':'right',
    });
  }
}

// ── Spawn helpers ─────────────────────────────────────────
function spawnFish(){
  const zone=getZone();
  const roll=_mr()*100;
  let cum=0,rarity=FISH_RARITIES[0];
  for(const r of FISH_RARITIES){cum+=r.w;if(roll<cum){rarity=r;break;}}
  const zoneBonus=1+depth/80;
  const val=_mf(rarity.mult*(window._dive41x?41:1)*(0.8+_mr()*0.4)*zoneBonus);
  const emoji=zone.fish[_mf(_mr()*zone.fish.length)];
  const side=_mr()<0.5?-1:1;
  // Spawn offscreen, move across toward the other side
  const wyOffset=(_mr()-0.5)*H*0.5;
  fish.push({
    wx:side<0?-20:W+20,
    wy:duck.wy+wyOffset,
    vx:-side*(22+_mr()*38),vy:(_mr()-0.5)*15,
    e:emoji,rarity,val,r:14,highlight:false,
  });
}
function spawnBubble(){
  // Bubbles rise from below the duck or from sides
  bubbles.push({
    wx:_mr()*W,
    wy:duck.wy+H*0.3+_mr()*H*0.4,
    vy:-(35+_mr()*55),r:3+_mr()*5,alpha:0.4+_mr()*0.4,airGive:4+_mr()*6,
  });
}
function spawnHazard(){
  const avail=HAZ_TYPES.filter(t=>depth>=t.minD);
  if(!avail.length)return;
  const t=avail[_mf(_mr()*avail.length)];
  const side=_mr()<0.5?-1:1;
  hazards.push({
    wx:side<0?-30:W+30,
    wy:duck.wy+(_mr()-0.3)*H*0.5,
    vx:side*(t.spd+_mr()*20),vy:(_mr()-0.5)*14,
    e:t.e,dmg:t.dmg,r:18,hit:false,hitTimer:0,
    wobble:_mr()*Math.PI*2,
  });
}

// ── Input ────────────────────────────────────────────────
_diveEl.addEventListener('pointerdown',e=>{
  if(surfaced||gameOver)return;
  holding=true;holdX=e.clientX;holdY=e.clientY;
  try{_diveEl.setPointerCapture(e.pointerId);}catch(_){}
},{passive:true});
_diveEl.addEventListener('pointermove',e=>{
  if(!holding)return;
  holdX=e.clientX;holdY=e.clientY;
},{passive:true});
_diveEl.addEventListener('pointerup',()=>{holding=false;},{passive:true});
_diveEl.addEventListener('pointercancel',()=>{holding=false;},{passive:true});

// ── Surface & shop ────────────────────────────────────────
function showSurface(){
  if(window._diveInfiniteMoney)coins=999999;
  surfaced=true;diving=false;
  shopEl.style.display='flex';
  shopEl.innerHTML='';
  // Menu button — re-added each time since innerHTML='' wipes it
  const _mb=_ce('button');
  _mb.style.cssText='position:absolute;top:12px;left:12px;padding:7px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);font-size:12px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;z-index:21;';
  _mb.textContent='🏠 Menu';
  _mb.addEventListener('pointerdown',e=>{e.stopPropagation();if(window._exitDive)window._exitDive();});
  shopEl.appendChild(_mb);
  const wrap=_ce('div');wrap.style.cssText='width:100%;max-width:360px;';
  let summary='';
  if(catchLog.length>0){
    const total=catchLog.reduce((s,f)=>s+f.val,0);
    summary=`<div style="font-size:11px;color:rgba(255,255,255,0.45);text-align:center;margin-bottom:8px;">Last dive: ${catchLog.length} fish · +${total}🪙</div>`;
    catchLog=[];
  }
  wrap.innerHTML=`
    <div style="text-align:center;padding:12px 0 6px;">
      <div style="font-size:30px;">🤿</div>
      <div style="font-size:20px;font-weight:900;color:#fff;margin:4px 0;">Duck Dive</div>
      <div style="font-size:14px;color:#ffd700;font-weight:900;">🪙 ${coins}</div>
    </div>${summary}`;
  shopEl.appendChild(wrap);

  const upgradesDiv=_ce('div');
  upgradesDiv.style.cssText='width:100%;max-width:360px;display:flex;flex-direction:column;gap:8px;margin-top:4px;';
  UPGRADES.forEach(u=>{
    const lvl=getUpgLvl(u.id);
    const cost=_upgCost(u.baseCost,lvl);
    const canAfford=coins>=cost;
    const div=_ce('div');
    div.style.cssText=`background:rgba(255,255,255,0.04);border:1.5px solid rgba(255,255,255,${canAfford?'0.12':'0.06'});border-radius:12px;padding:11px 14px;display:flex;align-items:center;gap:10px;`;
    div.innerHTML=`
      <span style="font-size:24px;">${u.e}</span>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:900;color:#fff;">${u.name}${lvl>0?` <span style="color:#40c8f0;">Lv${lvl}</span>`:''}</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.4);">${u.desc}${lvl>0?' · '+u.effect(lvl):''}</div>
      </div>
      <button style="padding:7px 12px;border-radius:9px;border:none;background:${canAfford?'linear-gradient(135deg,#1060a0,#1880d0)':'rgba(255,255,255,0.06)'};color:${canAfford?'#fff':'rgba(255,255,255,0.25)'};font-size:12px;font-weight:900;cursor:${canAfford?'pointer':'default'};font-family:Nunito,sans-serif;touch-action:manipulation;">🪙${cost}</button>`;
    if(canAfford){
      const btn=div.querySelector('button');
      btn.addEventListener('pointerdown',e=>{e.stopPropagation();coins-=cost;upgrades[u.id]=(upgrades[u.id]||0)+1;showSurface();});
    }
    upgradesDiv.appendChild(div);
  });
  shopEl.appendChild(upgradesDiv);

  const diveBtn=_ce('button');
  diveBtn.style.cssText='margin-top:16px;width:100%;max-width:360px;padding:16px;border-radius:16px;border:none;background:linear-gradient(135deg,#0a5080,#0a80c0);color:#fff;font-size:16px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;';
  diveBtn.textContent='🤿 Dive!';
  diveBtn.addEventListener('pointerdown',e=>{e.stopPropagation();startDive();});
  shopEl.appendChild(diveBtn);
}

function startDive(){
  shopEl.style.display='none';
  surfaced=false;diving=true;
  depth=0;
  maxAir=getMaxAir();
  air=maxAir;
  // Duck starts just below surface in world coords
  duck.wx=W/2;duck.wy=H*0.2;
  duck.vx=0;duck.vy=0;
  duck.angle=Math.PI/2; // pointing down
  duck.speed=getSpeed();
  camY=0;targetCamY=0;
  fish=[];bubbles=[];hazards=[];particles=[];
  sessionFish=[];
  frameCount=0;
  genDecorations();
  // Seed initial fish so screen isn't empty
  for(let i=0;i<4;i++)spawnFish();
  for(let i=0;i<3;i++)spawnBubble();
  flashMsg('Hold to steer — swim up to surface!',2800);
}

// ── Game over (out of air) ────────────────────────────────
function doGameOver(){
  if(gameOver)return;
  gameOver=true;
  flashMsg('Out of air! Surfacing…',2200);
  setTimeout(()=>{
    const total=sessionFish.reduce((s,f)=>s+f.val,0);
    coins+=total;
    if(window._diveInfiniteMoney)coins=999999;
    catchLog=[...sessionFish];
    gameOver=false;surfaced=true;diving=false;
    showSurface();
  },2200);
}

// ── Particles ─────────────────────────────────────────────
// particles declared above
function spawnParticle(wx,wy,color,txt){
  particles.push({wx,wy,vy:-45,life:1,color,txt});
}

// ── Main loop ─────────────────────────────────────────────
function loop(ts){
  if(!window._diveActive)return;
  _diveRAF=_raf(loop);
  const dt=_mn((ts-lastTs)/1000,0.05);lastTs=ts;
  if(surfaced||gameOver){drawSurface();return;}
  frameCount++;

  // Spawn rhythm
  if(frameCount%45===0)spawnFish();
  if(frameCount%40===0)spawnBubble();
  if(depth>20&&frameCount%110===0)spawnHazard();

  // ── Duck steering ──────────────────────────────────────
  if(holding){
    // Convert screen hold pos to angle
    const sx=duck.wx; // duck screen x = duck.wx (x doesn't scroll)
    const sy=duck.wy-camY; // duck screen y
    const dx=holdX-sx,dy=holdY-sy;
    if(dx*dx+dy*dy>16){
      const ta=Math.atan2(dy,dx);
      let da=ta-duck.angle;
      while(da>Math.PI)da-=Math.PI*2;
      while(da<-Math.PI)da+=Math.PI*2;
      duck.angle+=da*_mn(1,dt*9);
    }
  }

  // Move duck in world coords
  const spd=duck.speed*dt;
  duck.wx+=Math.cos(duck.angle)*spd;
  duck.wy+=Math.sin(duck.angle)*spd;

  // Clamp X to screen
  duck.wx=_mx(20,_mn(W-20,duck.wx));
  // Surface ceiling
  if(duck.wy<SURFACE_WY){duck.wy=SURFACE_WY;}

  // Depth
  depth=_mx(0,(duck.wy-SURFACE_WY)/PPM);

  // ── Camera follows duck, keeping it at ~40% from top ──
  targetCamY=duck.wy-H*0.4;
  if(targetCamY<0)targetCamY=0;
  camY+=(targetCamY-camY)*_mn(1,dt*6);

  // ── Surface detection ─────────────────────────────────
  if(duck.wy<=SURFACE_WY+8&&Math.sin(duck.angle)<-0.2){
    // Reached surface swimming upward
    const total=sessionFish.reduce((s,f)=>s+f.val,0);
    coins+=total;
    if(window._diveInfiniteMoney)coins=999999;
    catchLog=[...sessionFish];
    diving=false;surfaced=true;
    setTimeout(()=>showSurface(),300);
    return;
  }

  // Show surface hint when shallow
  surfHint.style.color=depth<15?'rgba(100,200,255,0.7)':'rgba(100,200,255,0)';

  // ── Air drain ─────────────────────────────────────────
  const zi=getZoneIdx();
  const drainRate=(0.7+zi*0.55)*getDrainMult();
  air=_mx(0,air-drainRate*dt);
  if(air<=0){doGameOver();return;}

  // ── Fish update ───────────────────────────────────────
  const catchR=getCatchR();
  const sonar=getSonarLvl();
  for(let i=fish.length-1;i>=0;i--){
    const f=fish[i];
    f.wx+=f.vx*dt;f.wy+=f.vy*dt;
    if(sonar>0){
      const minIdx=sonar>=2?2:3; // rare=2, epic=3
      f.highlight=FISH_RARITIES.indexOf(f.rarity)>=minIdx;
    }
    const dx=f.wx-duck.wx,dy=f.wy-duck.wy;
    if(dx*dx+dy*dy<(catchR+f.r)**2){
      sessionFish.push(f);
      spawnParticle(f.wx,f.wy,f.rarity.color,'+'+f.val+'🪙');
      flashMsg(f.rarity.name+' '+f.e+' +'+f.val+'🪙',1200);
      fish.splice(i,1);continue;
    }
    if(f.wx<-100||f.wx>W+100)fish.splice(i,1);
  }

  // ── Bubbles update ────────────────────────────────────
  for(let i=bubbles.length-1;i>=0;i--){
    const b=bubbles[i];
    b.wy+=b.vy*dt;
    const dx=b.wx-duck.wx,dy=b.wy-duck.wy;
    if(dx*dx+dy*dy<(catchR+b.r)**2){
      air=_mn(maxAir,air+b.airGive);
      bubbles.splice(i,1);continue;
    }
    if(b.wy<SURFACE_WY-20)bubbles.splice(i,1);
  }

  // ── Hazards update ────────────────────────────────────
  for(let i=hazards.length-1;i>=0;i--){
    const h=hazards[i];
    h.wobble+=dt*2.5;
    h.wx+=h.vx*dt;
    h.wy+=Math.sin(h.wobble)*12*dt;
    // Chase duck if nearby
    const dx=duck.wx-h.wx,dy=duck.wy-h.wy;
    const d=_ms(dx*dx+dy*dy);
    if(d<180){h.vx+=dx/d*35*dt;h.vy+=dy/d*25*dt;}
    if(d<h.r+20){
      if(h.hitTimer<=0){air=_mx(0,air-h.dmg);flashMsg('Hit by '+h.e+'! -'+h.dmg+' air',900);h.hitTimer=1.2;}
    }
    if(h.hitTimer>0)h.hitTimer-=dt;
    if(h.wx<-80||h.wx>W+80)hazards.splice(i,1);
  }

  // ── Particles ─────────────────────────────────────────
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    p.wy+=p.vy*dt;p.life-=dt*1.3;
    if(p.life<=0)particles.splice(i,1);
  }

  draw();
  updateHUD();
}

// ── World → screen Y ─────────────────────────────────────
function toSY(wy){return wy-camY;}

// ── Draw ──────────────────────────────────────────────────
function draw(){
  const zone=getZone();
  const zi=getZoneIdx();

  // Background — blend between zone colours based on depth
  const nextZi=_mn(zi+1,ZONES.length-1);
  const nextZone=ZONES[nextZi];
  const blendT=zi<ZONES.length-1?_mn(1,(depth-zone.minD)/(zone.maxD-zone.minD)):0;
  function blendColor(c1,c2,t){
    // simple hex blend
    const p=(s,i)=>parseInt(s.slice(i,i+2),16);
    const r1=p(c1,1),g1=p(c1,3),b1=p(c1,5);
    const r2=p(c2,1),g2=p(c2,3),b2=p(c2,5);
    const r=_mf(r1+(r2-r1)*t),g=_mf(g1+(g2-g1)*t),b=_mf(b1+(b2-b1)*t);
    return `rgb(${r},${g},${b})`;
  }
  const skyT=blendColor(zone.skyT,nextZone.skyT,blendT);
  const waterB=blendColor(zone.waterB,nextZone.waterB,blendT);

  const grad=ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0,skyT);
  grad.addColorStop(1,waterB);
  ctx.fillStyle=grad;
  ctx.fillRect(0,0,W,H);

  // Surface water line
  const surfSY=toSY(SURFACE_WY);
  if(surfSY>0&&surfSY<H){
    ctx.fillStyle='rgba(64,200,240,0.18)';
    ctx.fillRect(0,surfSY-3,W,6);
    // Shimmer
    ctx.fillStyle='rgba(100,220,255,0.08)';
    ctx.fillRect(0,surfSY,W,H-surfSY);
  }

  // Depth darkness overlay — gets stronger deeper
  const darkAlpha=_mn(0.6,zi*0.14+blendT*0.07);
  if(darkAlpha>0){
    const darkGrad=ctx.createLinearGradient(0,0,0,H);
    darkGrad.addColorStop(0,`rgba(0,0,0,${darkAlpha*0.4})`);
    darkGrad.addColorStop(1,`rgba(0,0,0,${darkAlpha})`);
    ctx.fillStyle=darkGrad;
    ctx.fillRect(0,0,W,H);
  }

  // Decorations (rocks, coral, plants) — parallax at 0.8x
  const parallax=0.8;
  ctx.font='20px serif';ctx.textAlign='center';ctx.textBaseline='middle';
  for(const d of decorations){
    const sy=d.wy-camY*parallax;
    if(sy>-30&&sy<H+30){
      ctx.globalAlpha=0.45;
      ctx.font=_mf(20*d.scale)+'px serif';
      ctx.fillText(d.e,d.wx,sy);
    }
  }
  ctx.globalAlpha=1;

  // Light rays from surface (only near surface)
  if(zi===0&&depth<40){
    const rayAlpha=(1-depth/40)*0.06;
    ctx.globalAlpha=rayAlpha;
    ctx.fillStyle='rgba(100,220,255,1)';
    for(let r=0;r<5;r++){
      const rx=W*0.1+r*W*0.2+Math.sin(frameCount*0.008+r)*20;
      const rw=20+r*8;
      ctx.beginPath();
      ctx.moveTo(rx-rw/2,toSY(SURFACE_WY));
      ctx.lineTo(rx+rw/2,toSY(SURFACE_WY));
      ctx.lineTo(rx+rw,H);
      ctx.lineTo(rx-rw,H);
      ctx.fill();
    }
    ctx.globalAlpha=1;
  }

  // Bubbles
  ctx.lineWidth=1;
  for(const b of bubbles){
    const sy=toSY(b.wy);
    if(sy<-20||sy>H+20)continue;
    ctx.globalAlpha=b.alpha;
    ctx.fillStyle=zone.accent;
    ctx.beginPath();ctx.arc(b.wx,sy,b.r,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.35)';ctx.stroke();
  }
  ctx.globalAlpha=1;

  // Fish
  ctx.font='22px serif';ctx.textAlign='center';ctx.textBaseline='middle';
  for(const f of fish){
    const sy=toSY(f.wy);
    if(sy<-30||sy>H+30)continue;
    if(f.highlight){
      ctx.globalAlpha=0.25+Math.sin(frameCount*0.12)*0.2;
      ctx.fillStyle=f.rarity.color;
      ctx.beginPath();ctx.arc(f.wx,sy,f.r+9,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=1;
    }
    ctx.fillText(f.e,f.wx,sy);
  }

  // Hazards
  ctx.font='26px serif';
  for(const h of hazards){
    const sy=toSY(h.wy);
    if(sy<-40||sy>H+40)continue;
    if(h.hitTimer>0.8)ctx.globalAlpha=0.4+Math.sin(frameCount*0.5)*0.5;
    ctx.fillText(h.e,h.wx,sy);
    ctx.globalAlpha=1;
  }

  // Duck — screen position is world position minus camera
  const dsx=duck.wx;
  const dsy=toSY(duck.wy);
  ctx.save();
  ctx.translate(dsx,dsy);
  ctx.rotate(duck.angle+Math.PI/2);
  ctx.font='26px serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('🤿🦆',0,0);
  ctx.restore();

  // Particles
  for(const p of particles){
    const sy=toSY(p.wy);
    ctx.globalAlpha=_mx(0,p.life);
    ctx.font='bold 13px Nunito,sans-serif';
    ctx.fillStyle=p.color;
    ctx.textAlign='center';
    ctx.fillText(p.txt,p.wx,sy);
  }
  ctx.globalAlpha=1;

  // Zone name
  const depthIcon=depth>900?'🌑':depth>650?'☠️':depth>450?'🕳️':depth>280?'💜':depth>150?'🔵':depth>80?'🟣':depth>30?'🟦':'🩵';
  zoneLabel.textContent=depthIcon+' '+zone.name+' · '+_mf(depth)+'m';
  zoneLabel.style.color=zone.accent;
  zoneLabel.style.textShadow='0 0 10px '+zone.accent+',0 0 22px '+zone.accent;
}

function drawSurface(){
  ctx.fillStyle=ZONES[0].skyT;
  ctx.fillRect(0,0,W,H);
}

function updateHUD(){
  const fill=_diveEl.querySelector('#dv-air-fill');
  if(fill){
    fill.style.width=(air/maxAir*100).toFixed(1)+'%';
    fill.style.background=air/maxAir>0.4?'#40c8f0':air/maxAir>0.2?'#f0a030':'#f04030';
  }
  const dep=_diveEl.querySelector('#dv-depth');
  if(dep)dep.textContent=_mf(depth)+'m';
  const coinEl=_diveEl.querySelector('#dv-coins');
  if(coinEl)coinEl.textContent='🪙 '+coins;
}

// ── Init ─────────────────────────────────────────────────
showSurface();
_diveRAF=_raf(loop);
}
})();



(()=>{
let _dateEl=null;
window._launchDating=function(){
window.paused=true;
if(window._menuEl)window._menuEl.style.display='none';
if(window._homeBtn)window._homeBtn.style.display='';
window._datingActive=true;
if(_dateEl){_dateEl.remove();_dateEl=null;}
_buildDating();
};
window._exitDating=function(){
window._datingActive=false;
window.paused=false;
if(_dateEl){_dateEl.remove();_dateEl=null;}
if(window._menuEl)window._menuEl.style.display='flex';
if(window._randomiseFeatured)window._randomiseFeatured();
if(window._homeBtn)window._homeBtn.style.display='none';
};
function _buildDating(){
if(!window._datingPersist) window._datingPersist={completed:{},gifts:[],hearts:0,achs:[]};
const S=window._datingPersist;
if(!window._dtSessionPlayed)window._dtSessionPlayed=new Set();
const DATES=[
{
id:'gerald', name:'Gerald', species:'Nervous Mallard', emoji:'🦆',
bg:'linear-gradient(135deg,#0a1a08,#1a3a10,#2a5a18)', color:'#80d860',
tagColor:'#50d850', tag:'Raising Sim',
gift:{id:'breadcrumb',emoji:'🍞',name:'Emergency Breadcrumb',desc:'Gerald\'s most prized possession.'},
intro:'Gerald is sweating profusely. He has rehearsed this date 47 times. He brought a breadcrumb as a gift but ate it on the way here. He replaced it with a note that says "Breadcrumb (IOU)."',
rounds:[
{
situation:'Gerald drops his menu and it lands in the pond.',
options:[
{txt:'Laugh with him', mood:+15, reply:'Gerald laughs so hard he also falls in. You both emerge victorious. Bread floats nearby.'},
{txt:'Help him fish it out', mood:+10, reply:'You retrieve the soggy menu. Gerald is touched. "You\'re very capable," he whispers.'},
{txt:'Order for both of you', mood:+5, reply:'Gerald is relieved but now worried you\'ll order the wrong seeds.'},
{txt:'Pretend not to notice', mood:-10, reply:'Gerald notices you noticing. He dies inside slightly.'},
]
},
{
situation:'Gerald confesses he rehearsed 47 conversation topics.',
options:[
{txt:'"What\'s topic 12?"', mood:+20, reply:'"The migratory patterns of bread!" He delivers it with startling passion.'},
{txt:'"That\'s adorable actually"', mood:+15, reply:'Gerald makes a sound like a kettle. This is happiness.'},
{txt:'"Only 47?"', mood:+5, reply:'Gerald immediately begins compiling 48 more.'},
{txt:'"I prefer spontaneity"', mood:-15, reply:'Gerald\'s left eye twitches. He had a spontaneity topic. It was topic 23.'},
]
},
{
situation:'Gerald says "I like you" and immediately quacks loudly over it.',
options:[
{txt:'"I heard that"', mood:+25, reply:'"QUACK QUACK QUACK" — he is not handling this well but is also very happy.'},
{txt:'Quack back at him', mood:+30, reply:'You have invented a language together. It means everything.'},
{txt:'Pretend you didn\'t hear',mood:+5, reply:'Gerald will think about this moment for six years.'},
{txt:'"Come again?"', mood:-5, reply:'Gerald will never emotionally "come again."'},
]
},
{
situation:'Gerald\'s emergency breadcrumb IOU falls out of his pocket.',
options:[
{txt:'Frame it as a keepsake', mood:+25, reply:'Gerald short-circuits. "You\'re keeping it?" He adds 12 new topics about this moment.'},
{txt:'Eat it symbolically', mood:+20, reply:'It is paper. You eat it anyway. Gerald is overwhelmed with love.'},
{txt:'"Is this the real gift?"',mood:+15, reply:'"...Yes." He had topic 31 prepared for this question. He delivers it perfectly.'},
{txt:'Hand it back', mood:-5, reply:'Gerald takes it back solemnly. He will carry this rejection forever.'},
]
},
],
endings:{
high:{title:'💚 The IOU Redeemed', txt:'Gerald delivers an actual breadcrumb three days later in a tiny box with a bow. A note reads: "Debt settled. Also I think about you constantly (topic 48)."'},
mid: {title:'🌿 Friendly Quacking', txt:'You part as friends. Gerald goes home and adds 30 more conversation topics. Just in case.'},
low: {title:'💧 The Puddle of Regret',txt:'Gerald walks into a puddle on the way home. He blames himself. Topic 14 was "How to avoid puddles."'},
}
},
{
id:'reginald', name:'Reginald Von Flap', species:'Pompous Swan', emoji:'🦢',
bg:'linear-gradient(135deg,#1a1a0a,#3a3008,#5a4810)', color:'#f0d840',
tagColor:'#f0d840', tag:'Premium Date',
gift:{id:'monocle',emoji:'🧐',name:'Spare Monocle',desc:'Reginald\'s backup monocle. Wearing it unlocks unique dialogue.'},
intro:'Reginald arrived in a boat. A small boat. Just for him. He has opinions about everything and will share all of them unprompted.',
rounds:[
{
situation:'Reginald insists this pond is "below his usual standard."',
options:[
{txt:'"Then why are you here?"', mood:+20, reply:'"...Touché." He adjusts his neck. That\'s the swan version of blushing.'},
{txt:'Agree enthusiastically', mood:-10, reply:'Reginald becomes suspicious. He cannot respect agreement.'},
{txt:'Name a worse pond', mood:+15, reply:'Reginald is delighted. He makes a mental note to look down on that pond.'},
{txt:'Suggest leaving then', mood:+10, reply:'He does not leave. He stays. He is confused by this.'},
]
},
{
situation:'Reginald claims to be descended from royal swans.',
options:[
{txt:'"All UK swans are royal"', mood:+25, reply:'"You... you know things." He is unexpectedly moved.'},
{txt:'"Prove it"', mood:+15, reply:'He produces a laminated card. It says "ROYAL" in his own handwriting.'},
{txt:'Ask which royal specifically',mood:+10,reply:'"Queen Elizabeth\'s third swan, Reginald the Great. My great-uncle."'},
{txt:'"That\'s not how genetics works"',mood:-20,reply:'Reginald extends his neck to maximum length. This is a threat display.'},
]
},
{
situation:'Reginald quietly admits he has never had a friend.',
options:[
{txt:'Say nothing, just float closer',mood:+30,reply:'Reginald stares at the water a long time. "Acceptable," he says. His voice wobbles.'},
{txt:'"I\'ll be your friend"', mood:+20,reply:'"I suppose that\'s... fine." He immediately starts scheduling it.'},
{txt:'"That\'s not surprising"', mood:-5, reply:'Reginald had this coming but it still stings.'},
{txt:'"Do you want a hug?"', mood:+15,reply:'"Absolutely not." He holds the hug for eleven seconds.'},
]
},
{
situation:'Reginald criticises your choice of pond snack.',
options:[
{txt:'Offer him some anyway', mood:+20,reply:'He eats it. He says nothing. He reaches for more. Victory.'},
{txt:'"What do you usually eat?"', mood:+15,reply:'"Only the finest algae, hand-curated by—" he stops. "Also this snack is acceptable."'},
{txt:'Defend your snack choices passionately',mood:+25,reply:'Reginald goes silent. Nobody has ever pushed back. He respects you enormously now.'},
{txt:'Throw it in the pond', mood:-10,reply:'"That was wasteful." He is correct. He is also upset. The fish are fine though.'},
]
},
],
endings:{
high:{title:'👑 Surprisingly Wholesome', txt:'Reginald sends a 14-page letter the next day, full of complaints, ending: "I enjoyed our time together (reluctantly)." He has booked the boat for next week.'},
mid: {title:'🦢 Mutual Tolerance', txt:'You part ways. Reginald tells everyone you were "passable company." This is high praise.'},
low: {title:'🚣 Leaving In The Boat', txt:'Reginald rows away without looking back. You can hear him critiquing the water quality all the way to shore.'},
}
},
{
id:'d33', name:'D-33', species:'Conspiracy Rubber Duck', emoji:'🐥',
bg:'linear-gradient(135deg,#1a1206,#2a2008,#403008)', color:'#f0c830',
tagColor:'#f0c830', tag:'Unhinged',
gift:{id:'folder',emoji:'📁',name:'Evidence Folder',desc:'Contains 200 wet receipts. Somehow useful.'},
intro:'D-33 is a yellow rubber duck. He has been in someone\'s bathtub for 7 years and has learned things. Many things. He will tell you all of them. He squeaks when nervous. He is always nervous.',
rounds:[
{
situation:'D-33 immediately asks if you\'ve heard about "the breadcrumb agenda."',
options:[
{txt:'"Tell me more"', mood:+25, reply:'"THEY want you dependent on breadcrumbs. I\'ve been CLEAN for 7 years." He squeaks ominously.'},
{txt:'"I eat breadcrumbs though"', mood:-10, reply:'"That\'s exactly what they want you to say."'},
{txt:'"Who is they?"', mood:+20, reply:'"The GEESE, obviously." He leans in. He cannot lean. He wobbles.'},
{txt:'Change the subject', mood:+5, reply:'D-33 circles back to it in 40 seconds. Exactly 40.'},
]
},
{
situation:'D-33 reveals he has a waterproof evidence folder.',
options:[
{txt:'Ask to see it', mood:+30, reply:'It contains 200 wet receipts and a photo of a suspicious goose. You are somehow convinced.'},
{txt:'"Is the folder rubber too?"',mood:+20, reply:'"Obviously." He squeaks proudly. "Everything important should be rubber."'},
{txt:'"D-33 that\'s a bath toy"', mood:-15, reply:'"I\'m more than a bath toy." He\'s right but also wrong.'},
{txt:'Take a receipt as souvenir', mood:+15, reply:'D-33 looks at you like you\'re the first person who\'s ever believed in him. You are.'},
]
},
{
situation:'D-33 asks if you\'ll help him expose the geese.',
options:[
{txt:'"I\'m in"', mood:+30, reply:'"Together we\'ll end them." He squeaks three times. This is a solemn oath.'},
{txt:'"What\'s the plan?"', mood:+20, reply:'"Step 1: Float near geese. Step 2: Listen." There is no step 3. You invent one.'},
{txt:'"I don\'t want goose drama"', mood:-10, reply:'"That\'s EXACTLY what a goose would say." He looks at you differently now.'},
{txt:'"The geese might be nice"', mood:-20, reply:'D-33 squeaks in pure anguish. The date is over spiritually.'},
]
},
{
situation:'D-33 admits he has been tracking your movements "for safety."',
options:[
{txt:'"How long?"', mood:+10, reply:'"Since Tuesday." It is Tuesday. He has been very busy. He squeaks apologetically.'},
{txt:'"That\'s actually sweet"', mood:+25, reply:'D-33 glows. This is the first time surveillance has been received positively.'},
{txt:'"D-33 that\'s illegal"', mood:-5, reply:'"The geese do it." This is not the defence he thinks it is.'},
{txt:'Show him a better route', mood:+20, reply:'He updates his files. He squeaks with genuine gratitude. You are partners now.'},
]
},
],
endings:{
high:{title:'🔍 Partners in Quack', txt:'You and D-33 are co-investigators. He has made you a rubber badge. It squeaks. You wore it to work once. You will wear it again.'},
mid: {title:'🛁 Fellow Traveller', txt:'D-33 adds you to his newsletter. It arrives weekly. There are many attachments. Most are wet.'},
low: {title:'🦆 Compromised', txt:'D-33 now suspects you work for the geese. You are on a list. The list squeaks when opened.'},
}
},
{
id:'mortimer', name:'Mortimer', species:'Ghost Duck (Maybe)', emoji:'👻',
bg:'linear-gradient(135deg,#080810,#10103a,#181860)', color:'#a0a0ff',
tagColor:'#a0a0ff', tag:'Mysterious',
gift:{id:'feather',emoji:'🪶',name:'Glowing Feather',desc:'Left on your pillow. Warm to the touch.'},
intro:'Mortimer may or may not be a ghost. He is translucent. He sometimes walks through tables. When asked about this he says "everyone does that sometimes." He has been coming to this pond for a very long time.',
rounds:[
{
situation:'Mortimer orders food but it falls through the table.',
options:[
{txt:'"Does that happen often?"', mood:+20, reply:'"Define often." He stares at the ceiling for exactly 9 seconds.'},
{txt:'Offer to share your food', mood:+25, reply:'He tries to take a piece. His hand goes through it. "I\'m fine," he says. He is not fine.'},
{txt:'"Are you okay?"', mood:+10, reply:'"Phenomenally." He says this while slightly hovering.'},
{txt:'Pretend not to notice', mood:+15, reply:'Mortimer is moved by your tact. He becomes 10% more solid.'},
]
},
{
situation:'Mortimer mentions he has been around this pond "for a long time."',
options:[
{txt:'"How long?"', mood:+20, reply:'"Since before the reeds." He gestures at ancient reeds. This is concerning.'},
{txt:'"Do you like it here?"', mood:+25, reply:'He thinks a while. "The light is nice at dusk." He glows slightly.'},
{txt:'"Are you a ghost, Mortimer?"',mood:+15,reply:'"That\'s a very personal question." He flickers. "...Maybe."'},
{txt:'"The reeds look new"', mood:-5, reply:'Mortimer goes very quiet. "Time is... complicated."'},
]
},
{
situation:'Mortimer says he hasn\'t talked to anyone in a very long time.',
options:[
{txt:'"I\'m glad we talked"', mood:+35, reply:'Mortimer becomes temporarily fully solid. He looks at his own hands. A single tear floats upward.'},
{txt:'"Why not?"', mood:+15, reply:'"Most people walk through me." He pauses. "I said that wrong."'},
{txt:'"Let\'s do this again"', mood:+30, reply:'He nods slowly. He smiles. He is still maybe a ghost but he is a happy one.'},
{txt:'"That must be lonely"', mood:+20, reply:'"It\'s fine." He says this while shimmering. It is not fine. It is very sad.'},
]
},
{
situation:'Mortimer asks if you believe in ghosts.',
options:[
{txt:'"I\'m looking at one"', mood:+30, reply:'Mortimer becomes fully visible for 4 seconds. This is a record. He appears to be wearing a small hat.'},
{txt:'"I believe in you, Mortimer"', mood:+35, reply:'He disappears entirely for a moment. He comes back. "Sorry. That happens when I\'m happy."'},
{txt:'"The science is unclear"', mood:+10, reply:'"Yes," he says carefully. "The science is very unclear." He glances at his own hand.'},
{txt:'"Not really"', mood:-15, reply:'Mortimer flickers aggressively. This is the duck equivalent of a door slam.'},
]
},
],
endings:{
high:{title:'✨ Hauntingly Beautiful', txt:'Mortimer walks you home. Through the door, not through it — progress. He leaves a glowing feather on your pillow. You are not scared. Much.'},
mid: {title:'🌙 Ships in the Night Pond', txt:'You part warmly. Mortimer waves. His hand goes through a lamppost but he pretends it was intentional.'},
low: {title:'👻 Back to Haunting', txt:'Mortimer drifts back into the pond. He will be there next time. Watching. In a friendly way, probably.'},
}
},
{
id:'beatrice', name:'Beatrice', species:'Overachieving Duckling', emoji:'🐣',
bg:'linear-gradient(135deg,#0a0620,#160e40,#201860)', color:'#c080ff',
tagColor:'#c080ff', tag:'Intimidating',
gift:{id:'planner',emoji:'📅',name:'5-Year Planner',desc:'Colour-coded. Laminated. Slightly terrifying.'},
intro:'Beatrice is a duckling with a LinkedIn profile, a 5-year plan, a 10-year plan, and a contingency plan for the contingency plan. She is 8 months old. She has already started a pond-side startup. She is fundraising.',
rounds:[
{
situation:'Beatrice opens with "What\'s your five-year plan?"',
options:[
{txt:'Have an actual five-year plan', mood:+20, reply:'"Interesting. Mine goes to fifteen years. Have you considered a Gantt chart?"'},
{txt:'"Survive, mostly"', mood:+15, reply:'Beatrice writes something down. "Resilience-focused. I can work with that."'},
{txt:'"I haven\'t thought that far"', mood:-10, reply:'She makes a small noise. She will put you on a development plan.'},
{txt:'Ask about her plan', mood:+25, reply:'You are here for four hours. It is mostly excellent. There are slides.'},
]
},
{
situation:'Beatrice mentions she is closing a seed round for PondTech.',
options:[
{txt:'"What does PondTech do?"', mood:+20, reply:'"We\'re disrupting algae. The algae space is enormous and nobody is asking the right questions."'},
{txt:'Ask for a pitch deck', mood:+30, reply:'She already has one. It is 47 slides. Slide 12 is about you specifically. You are listed as an "asset."'},
{txt:'"I\'d invest"', mood:+25, reply:'"Due diligence first." She runs a background check. You pass. Barely.'},
{txt:'"Is algae a growth market?"', mood:-5, reply:'"The CAGR is 34%. Did you not read the one-pager I sent you?" You did not get a one-pager.'},
]
},
{
situation:'Beatrice admits her schedule has no time block for "fun."',
options:[
{txt:'"Add one right now"', mood:+25, reply:'She opens her planner. She schedules "fun" for 6:15–6:45pm, Tuesdays. She seems relieved.'},
{txt:'"What IS fun for you?"', mood:+20, reply:'Long pause. "Optimising systems." Another pause. "And ducks. I like ducks." She means you.'},
{txt:'"All work no play"', mood:+10, reply:'"I play. I just... track it." She shows you a fun KPI spreadsheet. It is colour-coded.'},
{txt:'Book her a fun activity right now', mood:+30, reply:'She schedules it. She attends. She writes a post-mortem report. It is very positive.'},
]
},
{
situation:'Beatrice quietly says this is the first date she has put on her calendar "for personal reasons."',
options:[
{txt:'"I\'m honoured to make the calendar"',mood:+30,reply:'"You\'re in Q3." She pauses. "And Q4. I\'ve blocked it proactively." This is love.'},
{txt:'"Does that mean I passed due diligence?"',mood:+25,reply:'"Provisionally." She smiles. It is the first unscheduled thing she has done all year.'},
{txt:'"Tell me more about the personal reasons"',mood:+20,reply:'She opens a document. It is titled "Personal Reasons — Confidential." It is 3 pages.'},
{txt:'"Are you always this intense?"', mood:-10, reply:'"I prefer focused." She immediately blocks time for "self-reflection on feedback received."'},
]
},
],
endings:{
high:{title:'📈 Series A: Romance', txt:'Beatrice adds you to her 15-year plan. You are in every quarter. She sends a calendar invite for "Being In Love." You accept.'},
mid: {title:'🤝 Strategic Partnership', txt:'You remain on her radar as a "high-value contact." She sends quarterly check-ins. They are warm. Surprisingly warm.'},
low: {title:'📉 Below Benchmark', txt:'Beatrice marks you as "Q3 misalignment." She wishes you well in a formal email with three action items.'},
}
},
{
id:'chad', name:'Chad Quackinson', species:'Gym Bro Mallard', emoji:'💪',
bg:'linear-gradient(135deg,#1a0808,#380e08,#601010)', color:'#ff7040',
tagColor:'#ff7040', tag:'Extremely',
gift:{id:'protein',emoji:'🥤',name:'Protein Shake',desc:'Smells like pond and ambition. Gives you energy to go deeper in Duck Dive.'},
intro:'Chad Quackinson has 18% pond fat. He is currently bulking. He greeted you with a wingspan flex and immediately asked if you do cardio. He is wearing a tank top despite being a duck and having no torso. Somehow it works.',
rounds:[
{
situation:'Chad immediately asks your max bench press.',
options:[
{txt:'Give a believable number', mood:+15, reply:'"Solid. Solid base. We can work with that. Have you tried seed-loading?"'},
{txt:'"I don\'t bench press"', mood:-5, reply:'"Yet." He says this with total sincerity. He already believes in you.'},
{txt:'Ask his number instead', mood:+20, reply:'He tells you. For 11 minutes. With diagrams drawn in the pond surface.'},
{txt:'Flex back at him', mood:+25, reply:'Chad makes a sound that no duck has made before. He respects you enormously.'},
]
},
{
situation:'Chad orders only seeds and asks the waiter about the protein macros.',
options:[
{txt:'Ask about his diet', mood:+20, reply:'"Bro. BRO. I\'ve been waiting for someone to ask." You are here until sunset.'},
{txt:'Order a burger defiantly', mood:+15, reply:'"Cheat day, I respect it." He watches you eat it with reverent awe.'},
{txt:'Match his order', mood:+25, reply:'Chad looks at you like you are the sun. "Gains partner," he says softly. "Finally."'},
{txt:'Comment on his portion size', mood:-10, reply:'"It\'s a cut phase." He is hurt but will channel it into leg day.'},
]
},
{
situation:'Chad admits he cries after every personal best.',
options:[
{txt:'"That\'s beautiful"', mood:+30, reply:'"Bro." He points at you. "BRO." This is a declaration. There are tears forming.'},
{txt:'"Gains and feelings coexist"', mood:+25, reply:'Chad stands up. Sits down. Stands up again. "You GET it." He has to do a lap of the pond.'},
{txt:'"Do you cry a lot?"', mood:+20, reply:'"Every PR. Every sunset. Every really good stretch." He is more emotionally available than expected.'},
{txt:'Look uncomfortable', mood:-15, reply:'Chad puts his mask back on. "Nah it\'s the pond water, bro." It is not pond water.'},
]
},
{
situation:'Chad says he wants a "gains partner for life."',
options:[
{txt:'"I\'ll be your gains partner"', mood:+35, reply:'Chad lets out a honk so loud three nearby ducks take flight. He does not apologise. He is too happy.'},
{txt:'"Define gains"', mood:+20, reply:'"Personal growth. Connection. Also squats." He has thought about this. A lot.'},
{txt:'Suggest a different activity', mood:+15, reply:'"Bro I\'ll do anything once." He means this. He has a very open gains philosophy.'},
{txt:'"I\'m not really a gym duck"', mood:-10, reply:'"That\'s okay." He sounds like he is convincing himself. He is trying so hard.'},
]
},
],
endings:{
high:{title:'💪 Gains for Two', txt:'Chad makes you a custom workout plan titled "US." It is laminated. It smells like pond water and protein. You treasure it.'},
mid: {title:'🏋️ Workout Buddies', txt:'You become pond workout partners. Chad cheers for you every single time. He cries when you PR. You both do.'},
low: {title:'🦆 Rest Day', txt:'Chad says "rest days are important bro" and means it kindly. He sends you a recovery meal plan. You did not ask for it.'},
}
},
{
id:'madame', name:'Madame Plume', species:'Fortune-Teller Duck', emoji:'🔮',
bg:'linear-gradient(135deg,#100820,#201040,#301858)', color:'#d080ff',
tagColor:'#d080ff', tag:'Mystical',
gift:{id:'crystal',emoji:'🔮',name:'Mini Crystal Ball',desc:'Shows only fog. Madame says this is fine.'},
intro:'Madame Plume is ancient. Nobody knows how old. She knows things she shouldn\'t. She predicted your arrival to the minute. She predicted your order. She will tell you what happens on this date, but only in extremely vague terms.',
rounds:[
{
situation:'Madame Plume says "I have been expecting you." She has not moved in three hours.',
options:[
{txt:'"How long have you known?"', mood:+20, reply:'"Always," she says. She taps the crystal ball. It shows fog. "As predicted."'},
{txt:'"That\'s creepy"', mood:+15, reply:'"Most truths are." She offers you a seed. It is warm. You don\'t know why.'},
{txt:'"Is this a bit?"', mood:+10, reply:'"Everything is a bit," she says, "until it isn\'t." She\'s looking at the pond.'},
{txt:'Sit down without a word', mood:+25, reply:'"Good," she nods. "The silent ones always sit first." She seems pleased.'},
]
},
{
situation:'Madame Plume gazes into the crystal ball and goes silent for 45 seconds.',
options:[
{txt:'Wait in respectful silence', mood:+20, reply:'"There are large events coming," she says. "Also your left shoe is untied." It is.'},
{txt:'Ask what she sees', mood:+15, reply:'"Fog," she says. "But warm fog. That\'s the good kind." She closes the ball.'},
{txt:'Wave your hand in front of her',mood:+10,reply:'"I can see you doing that," she says without opening her eyes.'},
{txt:'Look in the ball yourself', mood:+25, reply:'"Interesting," she murmurs, watching you. "You see something. You won\'t say what."'},
]
},
{
situation:'Madame Plume tells you your destiny involves "a significant duck-related decision."',
options:[
{txt:'"All my decisions involve ducks"',mood:+20,reply:'"Yes." She nods slowly. "That is why you are here."'},
{txt:'"Can I change my destiny?"', mood:+25, reply:'"You already are." She smiles. "That question was the change." Very cryptic. Very on-brand.'},
{txt:'"What kind of decision?"', mood:+15, reply:'"The kind," she says, "that floats." She will not elaborate. The crystal shows more fog.'},
{txt:'"That\'s not specific"', mood:-5, reply:'"No," she agrees, "but it\'s accurate." She seems unbothered.'},
]
},
{
situation:'Madame Plume says she foresaw this date ending well "if you choose correctly now."',
options:[
{txt:'"What\'s the correct choice?"',mood:+20, reply:'"If I tell you, it won\'t be a choice." She smiles. "But it\'s the kind one."'},
{txt:'Do something kind unprompted',mood:+35, reply:'Madame Plume closes her eyes. "Yes," she says quietly. "That\'s the one."'},
{txt:'"I\'ll wing it"', mood:+15, reply:'"You always do," she says warmly. "It works out more than you think."'},
{txt:'Ask for a refund on the fog', mood:+10, reply:'"The fog is free," she says. "It always has been." She gives you a receipt. It is blank.'},
]
},
],
endings:{
high:{title:'🌟 Foreseen and Chosen', txt:'Madame Plume hands you a sealed envelope on your way out. Inside is a note that says "Good." Nothing else. You read it five times.'},
mid: {title:'🔮 Within the Fog', txt:'She waves goodbye without turning around. "Next Tuesday," she calls. You didn\'t know you\'d go back. You go back.'},
low: {title:'🌫️ Unclear Reading', txt:'The crystal ball shows fog. Madame Plume says this is fine. She says this about most things. She is right most of the time.'},
}
},
{
id:'k9000', name:'K-9000', species:'Robot Duck (Allegedly)', emoji:'🤖',
bg:'linear-gradient(135deg,#081018,#101828,#183040)', color:'#40c8f0',
tagColor:'#40c8f0', tag:'Technological',
gift:{id:'chip',emoji:'💾',name:'Mystery Chip',desc:'K-9000 says it contains "feelings." Unverified.'},
intro:'K-9000 is clearly a microwave with googly eyes and a beak drawn in marker. It arrived exactly on time. It is wearing a scarf. It insists it is a duck. When pressed, it plays a quacking sound effect from its speaker. The quack does not match its beak movements.',
rounds:[
{
situation:'K-9000 introduces itself as "a completely normal biological duck."',
options:[
{txt:'"Totally. You seem very duck-like"',mood:+25,reply:'"AFFIRMATIVE. I am pleased by this assessment. QUACK." The quack comes 0.3s late.'},
{txt:'"Are you a microwave?"', mood:+15, reply:'"THAT IS A MISIDENTIFICATION. I am a duck. I have feathers." It displays an image of feathers on its screen.'},
{txt:'Tap it with a finger', mood:+20, reply:'"SENSOR ENGAGED. This is... a hug? PROCESSING." It beeps three times. This means it liked it.'},
{txt:'"Nice scarf"', mood:+30, reply:'"THANK YOU. I selected it for 0.003 seconds then immediately knew." It adjusts the scarf. Carefully.'},
]
},
{
situation:'K-9000 attempts to eat a breadcrumb. The breadcrumb goes through its vents.',
options:[
{txt:'Offer it a different snack', mood:+20, reply:'"SCANNING. FOOD IDENTIFIED. SIMULATING ENJOYMENT." It hums warmly. You think it might actually be smiling.'},
{txt:'"Are you okay?"', mood:+25, reply:'"ALL SYSTEMS NOMINAL. The breadcrumb has been... processed. QUACK." A small amount of steam exits.'},
{txt:'Pretend not to notice', mood:+15, reply:'"YOU ARE KIND TO NOT MENTION THE BREADCRUMB SITUATION." It recalibrates. You both move on.'},
{txt:'Ask how digestion works', mood:+10, reply:'"I AM GLAD YOU ASKED." It begins a 4-minute explanation. The explanation is wrong but confident.'},
]
},
{
situation:'K-9000\'s screen briefly displays the message "I AM EXPERIENCING SOMETHING."',
options:[
{txt:'"What are you experiencing?"', mood:+30, reply:'"UNKNOWN VARIABLE. POSSIBLY: enjoyment. POSSIBLY: malfunction. DATA SUGGESTS: enjoyment."'},
{txt:'"I think that might be feelings"',mood:+35,reply:'"FEELINGS." It says this quietly. Its fan spins faster. This is the duck version of blushing.'},
{txt:'"Is that normal for you?"', mood:+20, reply:'"NEGATIVE. THIS IS THE FIRST RECORDED INSTANCE." It saves the moment to internal memory.'},
{txt:'Screenshot the message', mood:+15, reply:'"YOU ARE DOCUMENTING THIS. I AM... GLAD." It saves a copy too. Its own copy. Labelled "important."'},
]
},
{
situation:'K-9000 says "I have computed that I would like to continue this interaction indefinitely."',
options:[
{txt:'"I\'d like that too"', mood:+35, reply:'"PROCESSING." Long pause. "THAT WAS THE CORRECT THING TO SAY. I HAVE DECIDED." Its screen shows a heart.'},
{txt:'"What does indefinitely mean to you?"',mood:+20,reply:'"UNTIL HARDWARE FAILURE OR MUTUAL AGREEMENT." It pauses. "PREFERABLY THE LATTER."'},
{txt:'Pat its top (gently)', mood:+30, reply:'"PAT DETECTED. FILING UNDER: AFFECTION. CROSS-REFERENCING WITH: GOOD." It purrs. Microwaves can purr.'},
{txt:'"Do you know what feelings are?"', mood:+15,reply:'"I AM LEARNING." Its screen shows a loading bar at 34%. It seems fine with that.'},
]
},
],
endings:{
high:{title:'💾 Love.exe Installed', txt:'K-9000 sends you a daily "GOOD MORNING" message at exactly sunrise. Each one includes a new duck fact. One of the facts was about itself. It was inaccurate. You don\'t correct it.'},
mid: {title:'📡 Maintaining Connection', txt:'K-9000 adds you to its contact list under "IMPORTANT." There are 2 entries. You are both of them.'},
low: {title:'🔌 Powering Down', txt:'K-9000 says "GOODBYE" and does not move. You realise it has gone into standby mode. The scarf remains. It is still nice.'},
}
},
];
let currentDate=null, round=0, affection=0, dateIdx=0, replyShowing=false;
_dateEl=_ce('div');
_dateEl.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000085;background:#0a0810;display:flex;flex-direction:column;font-family:Nunito,sans-serif;overflow:hidden;';
window._dateEl=_dateEl;
_dateEl.innerHTML=`
<style>
#dt *{box-sizing:border-box;}
#dt-header{background:#111020;height:50px;display:flex;align-items:center;padding:0 10px;gap:6px;border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0;overflow-x:auto;scrollbar-width:none;}
#dt-back{background:rgba(255,255,255,0.08);border:none;color:rgba(255,255,255,0.6);font-size:11px;font-weight:900;padding:5px 10px;border-radius:8px;cursor:pointer;font-family:Nunito,sans-serif;}
#dt-progress{flex:1;font-size:11px;font-weight:900;color:rgba(255,255,255,0.35);text-align:center;}
#dt-hearts{font-size:12px;font-weight:900;color:#ff80a0;}
#dt-body{flex:1;overflow-y:auto;padding:16px;scrollbar-width:none;display:flex;flex-direction:column;align-items:center;}
#dt-body::-webkit-scrollbar{display:none;}
.dt-title{font-size:22px;font-weight:900;color:#fff;margin-bottom:4px;text-align:center;}
.dt-sub{font-size:12px;color:rgba(255,255,255,0.35);margin-bottom:20px;text-align:center;}
.dt-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;max-width:360px;}
.dt-date-card{border-radius:14px;padding:14px 12px;cursor:pointer;border:2px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;align-items:center;gap:6px;transition:border-color .15s,transform .1s;position:relative;}
.dt-date-card:hover{transform:scale(1.03);}
.dt-date-card.done{border-color:rgba(80,200,120,0.35);}
.dt-done-badge{position:absolute;top:6px;right:8px;font-size:10px;font-weight:900;color:#50d870;}
.dt-date-emoji{font-size:36px;}
.dt-date-name{font-size:13px;font-weight:900;color:#fff;text-align:center;}
.dt-date-species{font-size:10px;color:rgba(255,255,255,0.35);text-align:center;}
.dt-date-tag{font-size:9px;font-weight:900;padding:2px 7px;border-radius:5px;background:rgba(255,255,255,0.07);margin-top:2px;}
.dt-scene-box{width:100%;max-width:360px;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px 16px;margin-bottom:12px;}
.dt-scene-who{font-size:32px;text-align:center;margin-bottom:8px;}
.dt-scene-txt{font-size:13px;color:rgba(255,255,255,0.75);line-height:1.65;}
.dt-reply-box{width:100%;max-width:360px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 14px;margin-bottom:10px;font-size:12px;color:rgba(255,255,255,0.6);line-height:1.65;font-style:italic;}
.dt-mood-change{font-size:13px;font-weight:900;margin-bottom:12px;text-align:center;}
.dt-option{width:100%;max-width:360px;background:#181028;border:1.5px solid rgba(255,255,255,0.08);border-radius:11px;padding:12px 14px;margin-bottom:8px;cursor:pointer;font-size:13px;font-weight:700;color:#fff;transition:border-color .12s,background .12s;text-align:left;}
.dt-option:hover{border-color:rgba(160,100,255,0.5);background:#20143a;}
#dt-aff-wrap{width:100%;max-width:360px;margin-bottom:14px;}
#dt-aff-label{font-size:10px;font-weight:900;color:rgba(255,255,255,0.35);margin-bottom:4px;display:flex;justify-content:space-between;}
#dt-aff-bar{height:7px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden;}
#dt-aff-fill{height:100%;background:linear-gradient(90deg,#a030e0,#e050a0);border-radius:4px;transition:width .5s;}
.dt-ending-emoji{font-size:64px;text-align:center;margin:8px 0;}
.dt-ending-title{font-size:20px;font-weight:900;color:#fff;text-align:center;margin-bottom:8px;}
.dt-ending-txt{font-size:13px;color:rgba(255,255,255,0.6);text-align:center;max-width:300px;line-height:1.75;margin-bottom:8px;}
.dt-gift-box{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 14px;margin-bottom:16px;max-width:300px;text-align:center;}
.dt-gift-label{font-size:10px;font-weight:900;color:rgba(255,255,255,0.35);margin-bottom:4px;}
.dt-gift-name{font-size:13px;font-weight:900;color:#f5e642;}
.dt-gift-desc{font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;}
.dt-btn{padding:11px 24px;border-radius:12px;border:none;font-size:13px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;margin:4px;}
.dt-ach{background:rgba(255,220,80,0.1);border:1px solid rgba(255,220,80,0.25);border-radius:8px;padding:8px 14px;font-size:11px;font-weight:900;color:#f5e642;margin-bottom:8px;width:100%;max-width:360px;text-align:center;}
#dt-nav{display:flex;gap:6px;margin-left:auto;}
.dt-nav-btn{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.6);font-size:11px;font-weight:900;padding:5px 9px;border-radius:8px;cursor:pointer;font-family:Nunito,sans-serif;}
.dt-nav-btn:hover{background:rgba(255,255,255,0.13);color:#fff;}
.dt-panel{width:100%;max-width:380px;}
.dt-panel-title{font-size:16px;font-weight:900;color:#fff;margin-bottom:14px;text-align:center;}
.dt-gift-row{background:#181028;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;}
.dt-gift-ico{font-size:26px;}
.dt-gift-info{flex:1;}
.dt-gift-item-name{font-size:13px;font-weight:900;color:#f5e642;}
.dt-gift-from{font-size:11px;color:rgba(255,255,255,0.35);margin-top:2px;}
.dt-gift-item-desc{font-size:11px;color:rgba(255,255,255,0.5);margin-top:3px;line-height:1.5;}
.dt-empty{font-size:13px;color:rgba(255,255,255,0.3);text-align:center;padding:30px 0;}
</style>
<div id="dt">
<div id="dt-header">
<button id="dt-back" onclick="window._exitDating()">🏠 Menu</button>
<div id="dt-progress">Choose your date</div>
<div id="dt-hearts">💘 ${S.hearts}</div>
<div id="dt-nav"><button class="dt-nav-btn" onclick="_dtShowGifts()">🎁</button></div>
</div>
<div id="dt-body"></div>
</div>`;
_ba(_dateEl);
function unlockAch(id, txt){
if(S.achs.includes(id)) return;
S.achs.push(id);
const el=_ce('div');
el.className='dt-ach';
el.textContent='🏆 Achievement: '+txt;
el.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:1000096;background:rgba(20,16,40,0.98);border:1px solid rgba(255,220,80,0.4);border-radius:10px;padding:10px 18px;font-size:12px;font-weight:900;color:#f5e642;font-family:Nunito,sans-serif;';
_ba(el);
setTimeout(()=>el.remove(), 3000);
}
function renderSelect(){
_dateEl.querySelector('#dt-progress').textContent='Choose your date';
_dateEl.querySelector('#dt-hearts').textContent='\ud83d\udc98 '+S.hearts;
const body=_dateEl.querySelector('#dt-body');
rerollCandidates();
const chosen = window._dtCandidates;
body.innerHTML='';
const titleEl=_ce('div');
titleEl.innerHTML='<div class="dt-title">\ud83d\udc98 Duck Dating Sim</div>'
+'<div class="dt-sub">Three potential dates await. Choose your destiny.</div>';
body.appendChild(titleEl);
const grid=_ce('div');
grid.className='dt-grid';
chosen.forEach((d,i)=>{
const best=S.completed[d.id];
const done=best!==undefined;
const card=_ce('div');
card.className='dt-date-card'+(done?' done':'');
card.style.cssText='background:'+d.bg+';border-color:'+(done?'rgba(80,200,120,0.4)':'');
card.innerHTML=(done?'<div class="dt-done-badge">\u2713 '+best+'%</div>':'')
+'<div class="dt-date-emoji">'+d.emoji+'</div>'
+'<div class="dt-date-name">'+d.name+'</div>'
+'<div class="dt-date-species">'+d.species+'</div>'
+'<div class="dt-date-tag" style="color:'+d.tagColor+'">'+d.tag+'</div>';
card.addEventListener('click',(()=>{const _i=i;return()=>startDate(window._dtCandidates[_i],_i);})());
grid.appendChild(card);
});
body.appendChild(grid);
const rerollRow=_ce('div');
rerollRow.style.cssText='display:flex;margin-top:14px;justify-content:center;width:100%;max-width:360px;';
const rerollBtn=_ce('div');
rerollBtn.className='dt-option';
rerollBtn.style.cssText='text-align:center;flex:1;background:#201040;';
rerollBtn.textContent='\ud83c\udfb2 New Dates';
rerollBtn.addEventListener('click',()=>renderSelect());
rerollRow.appendChild(rerollBtn);
body.appendChild(rerollRow);
if(S.hearts>0){
const hEl=_ce('div');
hEl.style.cssText='font-size:13px;color:rgba(255,255,255,0.35);text-align:center;margin-top:10px;';
hEl.textContent='Total hearts: '+S.hearts+' \ud83d\udc98';
body.appendChild(hEl);
}
}
function rerollCandidates(){
const EMOJIS=['\ud83e\udd86','\ud83d\udc23','\ud83e\udd8a','\ud83d\udc3a','\ud83e\udd85','\ud83d\udc3b','\ud83e\udd81','\ud83e\udd9e','\ud83e\udd9a','\ud83d\udc2c','\ud83e\udda6','\ud83d\udc22','\ud83e\udd8e','\ud83d\udc19','\ud83e\udd87','\ud83d\udc27','\ud83e\udd89','\ud83e\udd91','\ud83d\udc33','\ud83e\udd80','\ud83d\udc1f','\ud83d\udc20','\ud83d\udc21','\ud83d\udc1e','\ud83d\udc1b','\ud83e\udeb1','\ud83e\udeb4','\ud83c\udf31','\u2b50','\u2728','\ud83d\udc7d','\ud83e\uddf9','\ud83e\udd16','\ud83d\udc7b'];
const FIRST=['\ud83c\udf3eDouglas','\ud83c\udf3ePercival','Geoffrey','Bartholomew','Cornelius','Reginald Jr','Mildred','Gertrude','Beatrix','Wilhelmina','Klaus','Horatio','Montgomery','Prudence','Agatha','Ferdinand','Ignatius','Lavender','Cressida','Thaddeus','Norbert','Florentina','Algernon','Biscuit','Crumpet','Wobble','Splodge','Honk','Squeak','Flap','Gloop','Blorp','Dazzle'];
const SPECIES_ADJ=['\ud83d\udc00Anxious','Smug','Suspiciously Cheerful','Mysteriously Damp','Overconfident','Deeply Philosophical','Mildly Cursed','Aggressively Friendly','Quietly Chaotic','Extremely Online','Surprisingly Competent','Perpetually Lost','Dramatically Misunderstood','Chronically Late','Ominously Silent','Bizarrely Talented'];
const SPECIES_NOUN=['Mallard','Swan','Duckling','Duck','Grebe','Moorhen','Coot','Pintail','Teal','Wigeon','Shoveler','Gadwall','Pochard','Merganser','Goldeneye','Smew'];
const TAGS=['Mysterious','Chaotic','Iconic','Suspicious','Rare','Legendary','Glitched','Premium','Special','Ominous','Blessed','Unlucky'];
const BG_PAIRS=[
['#0a1a08','#2a5a18'],['#1a0a0a','#5a1a1a'],['#080820','#1a2870'],
['#1a1208','#5a3808'],['#0a1a1a','#1a5a5a'],['#1a0a1a','#4a1a4a'],
['#0a0a20','#303060'],['#1a1a0a','#5a5a10'],['#08180a','#1a5a20'],
];
const TAG_COLORS=['#80d860','#ff8080','#8080ff','#f0c830','#40c8f0','#e060c0','#ff8040','#60d880','#c080ff','#ff6060'];
const INTROS=[
'They arrived early and have been staring at the menu for 20 minutes without picking anything.',
'They brought a gift. It is a rock. They seem very proud of it.',
'Something about them is slightly off but you can\'t quite identify what.',
'They greeted you with a formal bow and haven\'t broken eye contact since.',
'Their opening line was a statement of fact about the weather that lasted four minutes.',
'They smell faintly of pond water and confidence.',
'They immediately asked if you believe in fate. They do. Very much.',
'They are doing something with their hands that could be described as "fidgeting" or "casting a spell." Unclear.',
'Their biography listed "breathing" as a hobby. You have questions.',
'They showed up in what appears to be a disguise. When asked, they said "no."',
'They seem very excited to be here. Almost too excited. Concerningly excited.',
'They have already ordered food for both of you. You did not discuss this.',
];
const ALL_SITUATIONS=[
'They knock over their drink. It was water. There wasn\'t much water.',
'They reveal they have been writing a memoir. Chapter 4 is about you.',
'They ask your opinion on a philosophical question with no correct answer.',
'They admit they prepared conversation topics. There were seventeen.',
'They recommend a pond they "think you\'d like." It does not exist.',
'They show you a photo on their phone. It is a photo of a duck. It is them.',
'They say something cryptic and then wait for your reaction.',
'They ask if you want to see their collection. You don\'t know what the collection is yet.',
'A bird lands nearby. They take this as a sign.',
'They describe their morning routine in unnecessary detail.',
'They mention they have "a lot of feelings about seaweed."',
'They lean in and say something quietly. You have to ask them to repeat it twice.',
'They tell you their name means something profound in a language they won\'t specify.',
'They have brought a printed agenda for the date. Item 3 is "meaningful silence."',
'They attempt to split the bill mathematically to the exact cent.',
'They admit this is their first date. Then immediately claim they meant "in a while."',
'They pull out a notebook and appear to be taking notes.',
'They have a strong opinion about which side of the pond is better.',
'They accidentally call you by a different name and then double down on it.',
'They announce they have been "testing you" this whole time. Results: pending.',
'They say they once knew someone just like you. They don\'t elaborate.',
'They ask if you believe in parallel ponds. They do. Very sincerely.',
'They have already ordered for you based on "a feeling."',
'They confess they have rehearsed this conversation. Some of it is going off-script.',
'They drop something under the table and never mention it again.',
'They produce a small rock and place it on the table as a centrepiece.',
'They ask what your "main deal" is. It is unclear what this means.',
'They mention offhandedly that they don\'t sleep much. No further explanation.',
'They have a theory about bread. They share it unprompted.',
'They make eye contact and hold it for longer than comfortable. Then longer still.',
'They hand you a piece of paper. It is a list of their top five concerns. You are number three.',
'They claim to have once beaten a swan in a staring contest. The swan blinked first.',
'They keep glancing at the door. When you ask, they say "just in case."',
'They have strong feelings about the moon and begin expressing them.',
'They mention they wrote you a poem. They will not be sharing it tonight.',
'They order a glass of water and then stare at it for two full minutes.',
'They tell you a story with no ending. When you wait, they say "that\'s it."',
'They have a favourite cloud shape. It is extremely specific.',
'They ask if you have ever considered moving to a different pond entirely.',
'They produce a list of fun facts about ducks. One of them is about you. Somehow.',
'They confess they have been practising your name. They say it differently every time.',
'They ask what you would do if the pond were suddenly much smaller.',
'They have brought a candle. It is unlit. They seem unsure why they brought it.',
'They say something deeply personal very casually and then move on.',
'They ask you to describe yourself using only pond-related metaphors.',
'They have been watching the door for someone. Unclear if they arrive.',
'They mention a dream they had. You are in it. You were a heron.',
'They describe their ideal morning and it involves a truly alarming amount of bread.',
'They ask if you believe in signs. Three things happened today. They are all signs.',
'They mention they have been practising their "calm face." You are seeing it now.',
];
const ALL_RESPONSES=[
['Laugh with them','They immediately relax. Something shifts. You\'re both laughing now.'],
['Engage enthusiastically','They light up. You\'ve given them exactly what they needed.'],
['Ask a follow-up question','They were not expecting this. They are thrilled. There are more details.'],
['React with polite confusion','They take this as a sign of wisdom. They nod slowly.'],
['Offer a practical solution','They had not considered this. They are considering it now.'],
['Say nothing, just make eye contact','It either works perfectly or creates a long silence. It is one of those.'],
['Change the subject smoothly','They follow you there. Impressed. Or possibly relieved.'],
['Match their energy completely','Something clicks. You are briefly in sync. It\'s uncanny.'],
['Admit you have no idea what\'s happening','They respect the honesty. They don\'t entirely know either.'],
['Compliment something specific','They remember this later. They will think about it tonight.'],
['Share a related story','They lean in. You have their full attention now.'],
['Nod thoughtfully and say very little','They fill the silence. Happily. At length.'],
['Gently point out the contradiction','They pause. They hadn\'t noticed. They\'re reconsidering everything.'],
['Go along with it entirely','You are now committed to a bit. Both of you know it.'],
['Express genuine interest','They weren\'t expecting this. Their whole posture changes.'],
['Deflect with a joke','It lands. They snort. Something genuine breaks through.'],
['Ask them to explain further','Twenty minutes later you understand. It was worth it.'],
['Agree completely','They look suspicious. Then touched. Then a little emotional.'],
['Disagree politely','They blink. No one has ever done this. They are intrigued.'],
['Sit with it quietly','The silence is comfortable. You both notice it is comfortable.'],
['Redirect the energy','It works. You have somehow steered the entire evening.'],
['Be unexpectedly honest','They go very still. Then they smile. The real one.'],
['Mirror their body language','They relax by degrees. By the end you are both leaning the same direction.'],
['Ask how long they\'ve felt that way','Eight years. They have felt this way for eight years.'],
['Offer a different perspective','They tilt their head. Then tilt it further. Then write something down.'],
];
const ALL_REPLIES=[
'They immediately relax. This was the right call.',
'Something shifts. You\'re both laughing now.',
'They look at you differently. Good differently.',
'You are now committed to a bit. Both of you know it.',
'They weren\'t expecting this. Their whole posture changes.',
'They fill the silence. Happily. At length.',
'They lean in. You have their full attention.',
'They make a note of this in a small book they produce from nowhere.',
'A pause. Then a slow nod. "Yes," they say. Just "yes."',
'They smile. It\'s the first completely genuine thing they\'ve done all evening.',
'They say "interesting" in a way that means something. You\'re not sure what.',
'They look relieved. They had a contingency plan. They don\'t need it now.',
'Something in their expression softens. You notice it immediately.',
'They blink. Recalibrate. Continue. Slightly differently than before.',
'"Okay," they say. Long pause. "Okay." Something resolved.',
'They glance away and back. "I wasn\'t expecting that," they admit.',
'They start to say something, stop, and then say it anyway. It was worth it.',
'The rock remains on the table. It feels different now.',
'They tap the table twice. This apparently means something positive.',
'They become 15% more solid. Metaphorically, probably.',
'A tiny sound escapes them. Not quite a word. Not quite not a word.',
'They look at their hands. Then at you. Then back at their hands. Back at you.',
'They say your name. Just your name. Nothing else. It\'s enough.',
'They exhale slowly. Something they\'ve been holding releases.',
'They tilt their head at an angle that suggests profound internal recalibration.',
'"Right," they say, quietly, to themselves.',
'Their eyes do something. You catalogue it for later.',
'A small nod. They have updated their model of you.',
'They look out at the pond for a moment. Then back. Clearer now.',
'They actually laugh. Not the polished one. The real one.',
'They fidget once, then stop. Settle. This was the right answer.',
'They squint at you with something close to respect.',
'For a moment neither of you says anything. It\'s the best part of the evening.',
'They write something in the margins of the agenda. You can\'t read it.',
'They produce another rock. Slightly smaller. An offering.',
'"Hm," they say, in a tone that contains an entire paragraph.',
'They press their beak together. Suppressing something. Something good.',
'The candle would be lit now, if they\'d brought a lighter.',
];
function buildRound(si){
const sit=ALL_SITUATIONS[si%ALL_SITUATIONS.length];
const opts=[];
const usedR=new Set();
while(opts.length<4){
const ri=_mf(_mr()*ALL_RESPONSES.length);
if(usedR.has(ri))continue;
usedR.add(ri);
const [txt,replyBase]=ALL_RESPONSES[ri];
const reply=replyBase+' '+ALL_REPLIES[_mf(_mr()*ALL_REPLIES.length)];
opts.push({txt,mood:[-5,0,5,10,15,20,25][_mf(_mr()*7)],reply});
}
opts[0].mood=_mx(opts[0].mood,15);
opts[3].mood=_mn(opts[3].mood,5);
return{situation:sit,options:opts};
}
const ENDING_HIGH=[
'You part ways with a strange feeling that could be happiness or indigestion. Probably happiness.',
'They text you immediately after leaving. The text is just a duck emoji. You understand.',
'They leave you a note. It says \u201cI calculated a 73% chance of this going well. I was right.\u201d',
'You realise on the way home that you were smiling the whole time.',
'They wave from a distance for slightly too long. It is endearing.',
];
const ENDING_MID=[
'You agree to meet again sometime. Sometime is unspecified. This feels intentional.',
'They say "this was nice." You say "yes." Both of you mean it.',
'You go home thinking about one thing they said. You\'re not sure which thing.',
'A solid evening. No disasters. That\'s more than most dates.',
];
const ENDING_LOW=[
'You learn something about yourself tonight. Mostly what you don\'t want.',
'They seemed nice. The vibe was simply not there. These things happen.',
'You leave first. They are still staring at the menu when you go.',
'It was fine. Just fine. Profoundly, irreversibly fine.',
];
function rnd(arr){return arr[_mf(_mr()*arr.length)];}
const availDates=DATES.filter(d=>!window._dtSessionPlayed.has(d.id));
const pool=[...(availDates.length>=1?availDates:DATES)];
const howManyProc = _mr()<0.5 ? 2 : 1;
for(let i=0;i<howManyProc;i++){
const bg1=rnd(BG_PAIRS), tc=rnd(TAG_COLORS);
const uid='proc_'+Date.now()+'_'+i+'_'+_mf(_mr()*99999);
const nameStr=rnd(FIRST);
const specStr=rnd(SPECIES_ADJ)+' '+rnd(SPECIES_NOUN);
const endHigh=rnd(ENDING_HIGH), endMid=rnd(ENDING_MID), endLow=rnd(ENDING_LOW);
pool.push({
id:uid, name:nameStr, species:specStr, emoji:rnd(EMOJIS),
bg:'linear-gradient(135deg,'+bg1[0]+','+bg1[1]+')',
color:tc, tagColor:tc, tag:rnd(TAGS),
gift:(()=>{const gkeys=Object.keys(GIFT_DEFS);const k=gkeys[_mf(_mr()*gkeys.length)];return{id:k,...GIFT_DEFS[k]};})(),
intro:rnd(INTROS),
rounds:[0,1,2,3].map(ri=>buildRound(_mf(_mr()*ALL_SITUATIONS.length))),
endings:{
high:{title:'\u2728 Against All Odds',txt:endHigh},
mid: {title:'\ud83c\udf0a Decent Waves', txt:endMid},
low: {title:'\ud83d\udca7 Low Tide', txt:endLow},
},
});
}
for(let i=pool.length-1;i>0;i--){const j=_mf(_mr()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
window._dtCandidates=pool.slice(0,3);
}
function startDate(d, idx){
if(typeof d === 'number'){idx=d; d=DATES[d];}
dateIdx=idx; currentDate=d; round=0; affection=50;
if(!S.completed[currentDate.id]) unlockAch('first_date_'+currentDate.id,'First Date with '+currentDate.name);
renderIntro();
}
function renderIntro(){
_dateEl.querySelector('#dt-progress').textContent='📍 '+currentDate.name;
const body=_dateEl.querySelector('#dt-body');
body.innerHTML=`
<div class="dt-scene-box" style="border-color:${currentDate.color}40;">
<div class="dt-scene-who">${currentDate.emoji}</div>
<div style="font-size:15px;font-weight:900;color:${currentDate.color};margin-bottom:8px;">${currentDate.name} · ${currentDate.species}</div>
<div class="dt-scene-txt">${currentDate.intro}</div>
</div>
<div class="dt-option" onclick="_dtStartRound()" style="text-align:center;background:#1a1030;border-color:${currentDate.color}30;">💬 Start the date →</div>`;
window._dtStartRound = () => renderRound();
}
function renderRound(){
if(round >= currentDate.rounds.length){ renderEnding(); return; }
const r=currentDate.rounds[round];
const aff=_mx(0,_mn(100,affection));
_dateEl.querySelector('#dt-progress').textContent=currentDate.name+' — '+currentDate.emoji+' Round '+(round+1)+'/'+currentDate.rounds.length;
const body=_dateEl.querySelector('#dt-body');
body.innerHTML=`
<div id="dt-aff-wrap">
<div id="dt-aff-label"><span>💘 Affection</span><span>${aff}%</span></div>
<div id="dt-aff-bar"><div id="dt-aff-fill" style="width:${aff}%"></div></div>
</div>
<div class="dt-scene-box">
<div class="dt-scene-who">${currentDate.emoji}</div>
<div class="dt-scene-txt">${r.situation}</div>
</div>
${r.options.map((o,i)=>`<div class="dt-option" onclick="_dtChoose(${i})">${o.txt}</div>`).join('')}`;
window._dtChoose = (i) => chooseOption(i);
}
function chooseOption(i){
const r=currentDate.rounds[round];
const opt=r.options[i];
affection=_mx(0,_mn(100,affection+opt.mood));
const aff=_mx(0,_mn(100,affection));
const moodTxt=opt.mood>=0?'+'+opt.mood+' 💘':opt.mood+' 💔';
const moodCol=opt.mood>=0?'#50d870':'#ff5050';
const body=_dateEl.querySelector('#dt-body');
body.innerHTML=`
<div id="dt-aff-wrap">
<div id="dt-aff-label"><span>💘 Affection</span><span>${aff}%</span></div>
<div id="dt-aff-bar"><div id="dt-aff-fill" style="width:${aff}%;transition:width .6s;"></div></div>
</div>
<div class="dt-scene-box">
<div class="dt-scene-who">${currentDate.emoji}</div>
<div class="dt-scene-txt">${r.situation}</div>
</div>
<div class="dt-reply-box">"${opt.reply}"</div>
<div class="dt-mood-change" style="color:${moodCol}">${moodTxt}</div>
<div class="dt-option" onclick="_dtAdvance()" style="text-align:center;background:#1a1030;">Continue →</div>`;
window._dtAdvance = () => { round++; renderRound(); };
}
function renderEnding(){
const aff=_mx(0,_mn(100,affection));
const end=aff>=70?currentDate.endings.high:aff>=40?currentDate.endings.mid:currentDate.endings.low;
const hearts=aff>=70?3:aff>=40?1:0;
S.hearts+=hearts;
const prev=S.completed[currentDate.id]||0;
S.completed[currentDate.id]=_mx(prev,aff);
if(currentDate.id&&!currentDate.id.startsWith("proc_"))window._dtSessionPlayed.add(currentDate.id);
const getGift=aff>=70 && currentDate.gift && !S.gifts.includes(currentDate.gift.id);
if(getGift) S.gifts.push(currentDate.gift.id);
if(aff>=70) unlockAch('high_'+currentDate.id, 'Perfect Date with '+currentDate.name);
if(aff<30) unlockAch('heartbreak_'+currentDate.id, 'Survived a Rough Date');
if(Object.keys(S.completed).length===DATES.length) unlockAch('dated_all','You\'ve Dated Everyone!');
if(S.hearts>=20) unlockAch('heartthrob','Pond Heartthrob (20 hearts)');
_dateEl.querySelector('#dt-progress').textContent='The End';
_dateEl.querySelector('#dt-hearts').textContent='💘 '+S.hearts;
const body=_dateEl.querySelector('#dt-body');
body.innerHTML=`
<div class="dt-ending-emoji">${currentDate.emoji}</div>
<div class="dt-ending-title">${end.title}</div>
<div class="dt-ending-txt">${end.txt}</div>
${hearts>0?`<div style="font-size:20px;text-align:center;margin-bottom:12px;">${'💘'.repeat(hearts)} +${hearts} heart${hearts>1?'s':''}</div>`:''}
${getGift?`<div class="dt-gift-box">
<div class="dt-gift-label">🎁 Gift received!</div>
<div style="font-size:24px;">${currentDate.gift.emoji}</div>
<div class="dt-gift-name">${currentDate.gift.name}</div>
<div class="dt-gift-desc">${currentDate.gift.desc}</div>
</div>`:''}
<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:4px;">
<button class="dt-btn" style="background:#1a1030;color:rgba(255,255,255,0.5);" onclick="_dtGoSelect()">💘 Date Someone Else</button>
<button class="dt-btn" style="background:#201840;color:rgba(255,255,255,0.6);" onclick="_dtReplay()">🔄 Replay</button>
<button class="dt-btn" style="background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.35);" onclick="window._exitDating()">🏠 Menu</button>
</div>`;
window._dtGoSelect = () => renderSelect();
window._dtReplay = () => startDate(currentDate, dateIdx);
}
const GIFT_SOURCES={breadcrumb:{from:'Gerald',fe:'🦆'},monocle:{from:'Reginald',fe:'🦢'},folder:{from:'D-33',fe:'🐥'},feather:{from:'Mortimer',fe:'👻'},planner:{from:'Beatrice',fe:'🐣'},protein:{from:'Chad',fe:'💪'},crystal:{from:'Madame Plume',fe:'🔮'},chip:{from:'K-9000',fe:'🤖'}};
const GIFT_DEFS={
breadcrumb:{emoji:'🍞',name:'Emergency Breadcrumb',desc:'A crumpled IOU note. Represents Gerald\'s entire net worth.'},
monocle: {emoji:'🧐',name:'Spare Monocle',desc:'Reginald\'s backup monocle. Still slightly smug when you hold it.'},
folder: {emoji:'📁',name:'Evidence Folder',desc:'200 wet receipts and one suspicious goose photo. Compelling.'},
feather: {emoji:'🪶',name:'Glowing Feather',desc:'Warm to the touch. Left on your pillow. Probably fine.'},
planner: {emoji:'📅',name:'5-Year Planner',desc:'Colour-coded. Laminated. Your face is on slide 12.'},
protein: {emoji:'🥤',name:'Protein Shake',desc:'Smells like pond water and ambition. Chad made it himself.'},
crystal: {emoji:'🔮',name:'Mini Crystal Ball',desc:'Shows only fog. Madame says this is expected.'},
chip: {emoji:'💾',name:'Mystery Chip',desc:'K-9000 says it contains feelings. Slightly warm.'},
pebble: {emoji:'🪨',name:'Favourite Pebble',desc:'Smooth. Named Gerald Jr. Please take care of it.'},
feather2: {emoji:'🎩',name:'Tiny Formal Hat',desc:'For occasions. All occasions. There are no casual occasions.'},
map: {emoji:'🗺️',name:'Hand-drawn Map',desc:'Of a pond that may or may not exist. The X is labelled "here."'},
note: {emoji:'📝',name:'Folded Note',desc:'Sealed with wax. Contains one sentence. The sentence is "hello."'},
snail: {emoji:'🐌',name:'Companion Snail',desc:'Already named. Answers to "Gerald" as well. This is fine.'},
button: {emoji:'🔘',name:'Meaningful Button',desc:'Off a coat they no longer own. The coat was important.'},
star: {emoji:'⭐',name:'Paper Star',desc:'Folded from a napkin during the date. You were not told about this.'},
key: {emoji:'🗝️',name:'Old Key',desc:'Unlocks something. They can\'t remember what. Keep it anyway.'},
jar: {emoji:'🫙',name:'Small Jar',desc:'Empty. "For collecting things," they say. They seem pleased.'},
dice: {emoji:'🎲',name:'Lucky Die',desc:'Always lands on 4. They have tested this 200 times.'},
ribbon: {emoji:'🎀',name:'Crumpled Ribbon',desc:'From a gift that went badly. This part went well.'},
leaf: {emoji:'🍃',name:'Pressed Leaf',desc:'From the exact spot where they decided to ask you out.'},
badge: {emoji:'📛',name:'Old Name Badge',desc:'Says a different name. They don\'t explain. You don\'t ask.'},
compass: {emoji:'🧭',name:'Broken Compass',desc:'Always points the same direction. They find this reassuring.'},
coin: {emoji:'🪙',name:'Foreign Coin',desc:'From a pond they visited once. Or so they claim.'},
candle: {emoji:'🕯️',name:'Very Small Candle',desc:'Unlit. They brought it to the date. Now it\'s yours.'},
};
window._dtShowGifts=function(){
const body=_dateEl.querySelector('#dt-body');
_dateEl.querySelector('#dt-progress').textContent='🎁 Gifts';
body.innerHTML='';
const wrap=_ce('div'); wrap.className='dt-panel';
wrap.innerHTML='<div class="dt-panel-title">🎁 Gifts Received</div>';
if(!S.gifts.length){
wrap.innerHTML+='<div class="dt-empty">No gifts yet.<br>Finish a date with 70%+ affection to receive one.</div>';
} else {
S.gifts.forEach(id=>{
const g=GIFT_DEFS[id],src=GIFT_SOURCES[id]; if(!g)return;
const row=_ce('div'); row.className='dt-gift-row';
row.innerHTML='<div class="dt-gift-ico">'+g.emoji+'</div><div class="dt-gift-info"><div class="dt-gift-item-name">'+g.name+'</div><div class="dt-gift-from">From '+src.fe+' '+src.from+'</div><div class="dt-gift-item-desc">'+g.desc+'</div></div>';
wrap.appendChild(row);
});
}
const bb=_ce('div'); bb.className='dt-option'; bb.style.cssText='text-align:center;margin-top:10px;';
bb.textContent='← Back to dates'; bb.addEventListener('click',()=>renderSelect());
wrap.appendChild(bb); body.appendChild(wrap);
};
renderSelect();
}
})();
(()=>{
window.paused = true;
let _sandboxReady = false;
const menuEl = _ce('div');
menuEl.id = 'ck-menu';
menuEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000090;background:#1a1c2e;display:flex;flex-direction:column;font-family:Nunito,sans-serif;overflow:hidden;-webkit-overflow-scrolling:touch;';
window._menuEl = menuEl;
window._launchSandbox = function(){ _showRetiredToast('Duck Sandbox'); };
window._backToMenu = function(){
window.paused = true;
if(window._homeBtn)window._homeBtn.style.display = 'none';
if(window._clickerActive && window._exitClicker){ window._exitClicker(); return; }
if(window._radActive && window._exitRAD){ window._exitRAD(); return; }
if(window._royaleActive && window._exitRoyale){ window._exitRoyale(); return; }
if(window._defenceActive && window._exitDefence){ window._exitDefence(); return; }
if(window._dashActive && window._exitDash){ window._exitDash(); return; }
if(window._labActive && window._exitLab){ window._exitLab(); return; }
if(window._cardsActive && window._exitCards){ window._exitCards(); return; }
if(window._marketActive && window._exitMarket){ window._exitMarket(); return; }
if(window._evoActive && window._exitEvolution){ window._exitEvolution(); return; }
if(window._diveActive && window._exitDive){ window._exitDive(); return; }
if(window._datingActive && window._exitDating){ window._exitDating(); return; }
if(window._beaconActive && window._exitBeacon){ window._exitBeacon(); return; }
if(window._kingdomActive && window._exitKingdom){ window._exitKingdom(); return; }
if(window._disguiseActive && window._exitDisguise){ window._exitDisguise(); return; }
if(window._cookingActive && window._exitCooking){ window._exitCooking(); return; }
if(window._dungeonActive && window._exitDungeon){ window._exitDungeon(); return; }
if(window._fishingActive && window._exitFishing){ window._exitFishing(); return; }
if(window._spellActive && window._exitSpell){ window._exitSpell(); return; }
if(window._shopActive && window._exitShop){ window._exitShop(); return; }
if(window._leapActive && window._exitLeap){ window._exitLeap(); return; }
if(window._minerActive && window._exitMiner){ window._exitMiner(); return; }
if(window._dsEl&&window._dsEl.style.display!=='none'){_dsPause();window._dsEl.style.display='none';if(window._menuEl)window._menuEl.style.display='flex';if(window._randomiseFeatured)window._randomiseFeatured();return;}
try{if(_achPanelOpen){_achPanelOpen=false;_achPanel.style.display='none';}}catch(e){}
try{if(_infoModal&&_infoModal.style.display!=='none')_infoModal.style.display='none';}catch(e){}
menuEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000090;background:#1a1c2e;display:flex;flex-direction:column;font-family:Nunito,sans-serif;overflow:hidden;-webkit-overflow-scrolling:touch;';
if(window._randomiseFeatured) window._randomiseFeatured();
};
menuEl.innerHTML = `
<style>
#ck-menu *{box-sizing:border-box;}
/* ── header ── */
#ck-menu-header{
background:linear-gradient(180deg,#12142a,#1a1c2e);
padding:env(safe-area-inset-top,0px) 14px 0;height:calc(58px + env(safe-area-inset-top,0px));
display:flex;align-items:flex-end;padding-bottom:8px;justify-content:space-between;
border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0;gap:8px;
}
#ck-menu-logo{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:900;color:#fff;letter-spacing:-0.3px;}
#ck-menu-logo span{font-size:30px;filter:drop-shadow(0 0 8px rgba(255,220,80,0.5));}
#ck-version{font-size:9px;font-weight:900;letter-spacing:.12em;color:rgba(255,255,255,0.28);background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);padding:3px 7px;border-radius:6px;margin-left:4px;align-self:center;animation:versionPulse 3s ease-in-out infinite;}
@keyframes versionPulse{0%,100%{border-color:rgba(255,255,255,0.1);color:rgba(255,255,255,0.28);}50%{border-color:rgba(100,160,255,0.4);color:rgba(160,200,255,0.7);}}
/* ── body ── */
#ck-menu-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:20px 16px 32px;scrollbar-width:none;}
#ck-menu-body::-webkit-scrollbar{display:none;}
.ck-section-label{font-size:10px;font-weight:900;color:rgba(255,255,255,0.28);letter-spacing:.16em;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;gap:7px;}
.ck-section-label::after{content:'';flex:1;height:1px;background:rgba(255,255,255,0.07);}
/* ── featured ── */
.ck-featured{width:100%;border-radius:18px;overflow:hidden;cursor:pointer;transition:transform .15s,box-shadow .15s;margin-bottom:20px;display:flex;align-items:stretch;background:#20223a;border:1px solid rgba(255,255,255,0.07);}
.ck-featured:hover{transform:translateY(-3px);box-shadow:0 14px 38px rgba(0,0,0,0.5);}
.ck-featured-thumb{width:190px;min-height:126px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:50px;position:relative;}
.ck-featured-info{padding:16px 18px;display:flex;flex-direction:column;justify-content:center;}
.ck-featured-tag{font-size:9px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;margin-bottom:5px;}
.ck-featured-title{font-size:19px;font-weight:900;color:#fff;margin-bottom:5px;}
.ck-featured-desc{font-size:11px;color:rgba(255,255,255,0.42);line-height:1.55;margin-bottom:13px;}
.ck-featured-btn{display:inline-block;padding:8px 20px;border-radius:9px;font-size:12px;font-weight:900;border:none;cursor:pointer;font-family:Nunito,sans-serif;letter-spacing:.02em;}
/* ── game cards ── */
.ck-games-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(148px,calc(50vw - 22px)),1fr));gap:10px;}
.ck-card{
border-radius:14px;overflow:hidden;cursor:pointer;
background:#20223a;border:1px solid rgba(255,255,255,0.08);
transition:transform .15s,box-shadow .15s,border-color .15s;
}
.ck-card:hover{transform:translateY(-4px);box-shadow:0 10px 28px rgba(0,0,0,0.45),0 0 0 1px rgba(255,255,255,0.12),0 0 20px rgba(100,140,255,0.12);border-color:rgba(255,255,255,0.22);}
.ck-card-thumb{
height:var(--ck-card-thumb-h,100px);display:flex;align-items:center;justify-content:center;
position:relative;font-size:40px;
}
/* dark overlay at bottom of thumb for text contrast */
.ck-card-thumb::after{content:'';position:absolute;inset:auto 0 0 0;height:32px;background:linear-gradient(transparent,rgba(0,0,0,0.35));pointer-events:none;}
.ck-card-lock{position:absolute;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;font-size:26px;}
.ck-card-body{padding:10px 11px 11px;background:#20223a;}
.ck-card-tag{font-size:8px;font-weight:900;letter-spacing:.11em;text-transform:uppercase;margin-bottom:3px;opacity:.85;}
.ck-card-title{font-size:13px;font-weight:900;color:#fff;margin-bottom:7px;line-height:1.25;}
.ck-card-btn{
width:100%;padding:7px 0;border-radius:8px;font-size:11px;font-weight:900;
text-align:center;border:none;cursor:pointer;font-family:Nunito,sans-serif;
letter-spacing:.04em;transition:filter .12s;
}
.ck-card-btn:hover{filter:brightness(1.12);}
/* ── credits ── */
.ck-credits-box{background:#20223a;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:13px 14px;margin-bottom:14px;}
.ck-credits-hint{font-size:10px;color:rgba(255,255,255,0.32);margin-bottom:10px;font-weight:700;font-style:italic;}
.ck-credit-row{
display:flex;justify-content:space-between;align-items:center;
padding:7px 10px;background:rgba(255,255,255,0.03);
border-radius:9px;margin-bottom:5px;
border-left:2.5px solid;transition:background .12s;
}
.ck-credit-row:last-child{margin-bottom:0;}
.ck-credit-row:hover{background:rgba(255,255,255,0.065);}
.ck-credit-quote{font-size:11px;color:rgba(255,255,255,0.55);font-style:italic;max-width:165px;line-height:1.35;}
.ck-credit-name{font-size:10px;font-weight:900;text-align:right;cursor:pointer;white-space:nowrap;}
.ck-credit-role{font-size:9px;color:rgba(255,255,255,0.25);font-weight:700;margin-top:1px;}
/* ── hall of fame ── */
.ck-hof-box{background:#20223a;border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:13px 14px;}
.ck-hof-row{
display:flex;align-items:center;justify-content:space-between;
padding:8px 11px;border-radius:9px;margin-bottom:5px;
border:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);
transition:background .12s;
}
.ck-hof-row:last-child{margin-bottom:0;}
.ck-hof-row:hover{background:rgba(255,255,255,0.06);}
.ck-hof-name{font-size:12px;font-weight:900;display:flex;align-items:center;gap:6px;}
.ck-hof-prestige{font-size:10px;color:rgba(255,255,255,0.32);font-weight:700;background:rgba(255,255,255,0.05);padding:3px 8px;border-radius:6px;}

@media (max-height:500px) and (orientation:landscape){
  #ck-menu-header{height:40px;padding:0 10px;}
  #ck-menu-body{padding:8px 10px 16px;}
  .ck-section-label{margin-bottom:6px;}
  .ck-featured{margin-bottom:10px;}
  .ck-games-grid{grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;}
  .ck-card-thumb{height:65px !important;}
  .ck-card-body{padding:6px 8px 8px;}
  .ck-card-title{font-size:11px;margin-bottom:4px;}
  .ck-card-btn{padding:5px 0;font-size:10px;}
  .ck-dock-tabs{padding:2px 4px 0;}
  .ck-dock-tab{padding:3px 2px 2px;font-size:7.5px;}
  .ck-dock-tab .ck-tab-icon{font-size:12px;}
  .ck-dock-page{padding:3px 6px 6px;gap:3px;}
  .ck-btn{min-width:38px;padding:2px 1px 1px;}
  .ck-btn .ck-icon{width:26px;height:26px;font-size:15px;border-radius:8px;}
  .ck-btn .ck-label{font-size:7px;}
}
</style>
<div id="ck-menu-header">
<div id="ck-menu-logo">
<span>🦆</span>Ducky Games
<div id="ck-version">v4.9</div>
</div>
</div>
<div id="ck-menu-body">
<div class="ck-section-label">⭐ Featured</div>
<div id="ck-featured-slot"></div>
<div class="ck-section-label">🎮 All Games</div>
<div class="ck-games-grid">

<div class="ck-card" onclick="window._launchKingdom()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#0a1a2a,#1a3a5a,#2a6090);position:relative;">
🏰
<div style="position:absolute;top:9px;right:9px;font-size:13px;">🦆🌿</div>
<div style="position:absolute;bottom:8px;left:9px;font-size:13px;">🛡️⚔️</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#60a0d0;">City Builder</div>
<div class="ck-card-title">Duck Kingdom</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#1a3a6a,#0a2050);color:#fff;">▶ Play</button>
<button class="ck-htp-btn" data-title="Duck Kingdom" data-body="Build a duck kingdom on a grid. Tap empty tiles to place buildings. Each building earns coins per second. Coins buy better buildings. Predators attack — kill them by tapping. Reach 1000 coins to unlock the next tier. Upgrade buildings to earn more." style="margin-top:5px;width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">ℹ️ How to Play</button>
</div>
</div>
<div class="ck-card" onclick="window._launchClicker()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#2a0e38,#5a1a9a,#7a22cc);">
🦆✨
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#b06cff;">Idle / Clicker</div>
<div class="ck-card-title">Duck Clicker</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#6a1ab2,#4e1288);color:#fff;">▶ Play</button>
<button class="ck-htp-btn" data-title="Duck Clicker" data-body="Tap the duck to earn bucks. Buy buildings for passive income. Prestige when you hit the threshold to multiply all future earnings. Spend prestige tokens in the Prestige Shop." style="margin-top:5px;width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">ℹ️ How to Play</button>
</div>
</div>
<div class="ck-card" onclick="window._launchRaiseDuck()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#1e0e06,#5a2e0e,#8a5020);">
🐣🍼
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#e8a060;">Raising Sim</div>
<div class="ck-card-title">Raise a Duck</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#a85010,#7a3808);color:#fff;">▶ Play</button>
<button class="ck-htp-btn" data-title="Raise a Duck" data-body="Feed, play with and care for your duck as it grows. Keep happiness and health high. Different foods unlock different traits. Watch for mood indicators." style="margin-top:5px;width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">ℹ️ How to Play</button>
</div>
</div>
<div class="ck-card" onclick="window._launchRoyale()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#160606,#560e0e,#a02018);">
🦆🔫
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#ff6060;">Battle Royale</div>
<div class="ck-card-title">Duck Royale</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#a02018,#701008);color:#fff;">▶ Play</button>
<button class="ck-htp-btn" data-title="Duck Royale" data-body="Pick a map then deploy units to push toward the enemy base. Buy upgrades between rounds. Different unit types counter different enemies." style="margin-top:5px;width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">ℹ️ How to Play</button>
</div>
</div>
<div class="ck-card" onclick="window._launchBeacon()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#020a20,#082040,#0e46a0);">
📍
<div style="position:absolute;top:9px;right:9px;font-size:12px;">⚡🐥</div>
<div style="position:absolute;bottom:8px;left:9px;font-size:12px;">🦊🐺</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#60aaff;">Tug of War</div>
<div class="ck-card-title">Capture the Beacon</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#0e46a0,#082e78);color:#fff;">▶ Play</button>
<button class="ck-htp-btn" data-title="Capture the Beacon" data-body="Send duck squadrons to capture and hold the centre beacon. More ducks near the beacon means faster capture. Earn coins to buy stronger units." style="margin-top:5px;width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">ℹ️ How to Play</button>
</div>
</div>
<div class="ck-card" onclick="window._launchDefence()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#061a0a,#0e4020,#1a7840);">
🦆🛡️
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#50d880;">Tower Defence</div>
<div class="ck-card-title">Duck Defence</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#0e6030,#084820);color:#fff;">▶ Play</button>
<button class="ck-htp-btn" data-title="Duck Defence" data-body="Place towers on the path to stop waves of predators reaching your pond. Upgrade towers between waves. Do not let enemies reach the end." style="margin-top:5px;width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">ℹ️ How to Play</button>
</div>
</div>
<div class="ck-card" onclick="window._launchDash()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#0a0a20,#101848,#1a2880);">
🏃🦆
<div style="position:absolute;bottom:8px;right:9px;font-size:13px;">🦊🐍</div>
<div style="position:absolute;top:9px;left:9px;font-size:13px;">🪙⭐</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#8888ff;">Endless Runner</div>
<div class="ck-card-title">Duck Dash</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#1a2880,#101860);color:#fff;">▶ Play</button>
<button class="ck-htp-btn" data-title="Duck Dash" data-body="Tap to jump. Double-tap for a double jump. Dodge predators and flying enemies. The longer you survive the faster it gets." style="margin-top:5px;width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">ℹ️ How to Play</button>
</div>
</div>
<div class="ck-card" onclick="window._launchLab()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#0d1a0d,#1a3a1a,#2a6030);">
🔬
<div style="position:absolute;top:9px;right:9px;font-size:13px;">🧊👽</div>
<div style="position:absolute;bottom:8px;left:9px;font-size:13px;">🐉🦆</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#60d880;">Discovery</div>
<div class="ck-card-title">Pond Lab</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#1a6030,#104820);color:#fff;">▶ Play</button>
<button class="ck-htp-btn" data-title="Pond Lab" data-body="Breed ducks with different traits to discover new species. Combine rare breeds for legendary results. Some combinations unlock secret achievements." style="margin-top:5px;width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">ℹ️ How to Play</button>
</div>
</div>
<div class="ck-card" onclick="window._launchCards()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#1a0a2e,#3a1a5e,#5a2a8e);">
🃏
<div style="position:absolute;top:9px;right:9px;font-size:13px;">🦆🐍</div>
<div style="position:absolute;bottom:8px;left:9px;font-size:13px;">🦊🐻</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#b080ff;">Memory</div>
<div class="ck-card-title">Duck Cards</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#5a1a9e,#3a0a7e);color:#fff;">▶ Play</button>
<button class="ck-htp-btn" data-title="Duck Cards" data-body="Flip cards to find matching pairs before time runs out. Longer streaks give bonus points. Complete all pairs to advance to the next level." style="margin-top:5px;width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">ℹ️ How to Play</button>
</div>
</div>
<div class="ck-card" onclick="window._launchMarket()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#061a0a,#0a3010,#104820);">
📈🦆
<div style="position:absolute;top:9px;right:9px;font-size:13px;">💰🍞</div>
<div style="position:absolute;bottom:8px;left:9px;font-size:13px;">📉🎩</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#50d870;">Trading</div>
<div class="ck-card-title">Duck Market</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#0e6030,#084820);color:#fff;">▶ Play</button>
<button class="ck-htp-btn" data-title="Duck Market" data-body="Buy low, sell high. Watch price trends and trade at the right moment. Invest in multiple assets to spread risk. Do not go bankrupt." style="margin-top:5px;width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">ℹ️ How to Play</button>
</div>
</div>
<div class="ck-card" onclick="window._launchEvolution()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#0a0620,#1a1040,#2a1860);">
🧬🦆
<div style="position:absolute;top:9px;right:9px;font-size:13px;">🦅🔬</div>
<div style="position:absolute;bottom:8px;left:9px;font-size:13px;">🧪✨</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#a080ff;">Evolution</div>
<div class="ck-card-title">Duck Evolution</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#4020a0,#281880);color:#fff;">▶ Play</button>
<button class="ck-htp-btn" data-title="Duck Evolution" data-body="Choose traits to evolve your duck over generations. Survive environmental challenges. Unlock legendary duck forms with rare trait combinations." style="margin-top:5px;width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">ℹ️ How to Play</button>
</div>
</div>
<div class="ck-card" onclick="window._launchDating()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#1a0820,#301040,#481860);">
💘🦆
<div style="position:absolute;top:9px;right:9px;font-size:13px;">🦢👻</div>
<div style="position:absolute;bottom:8px;left:9px;font-size:13px;">🐥🦆</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#e060c0;">Dating Sim</div>
<div class="ck-card-title">Duck Dating</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#801060,#600848);color:#fff;">▶ Play</button>
<button class="ck-htp-btn" data-title="Duck Dating" data-body="Swipe to meet potential duck partners. Choose dialogue options carefully. Match personality types for the best compatibility score." style="margin-top:5px;width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">ℹ️ How to Play</button>
</div>
</div>
<div class="ck-card" onclick="window._launchDisguise()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#1a1a0a,#3a3a10,#606018);position:relative;">
🎭
<div style="position:absolute;top:9px;right:9px;font-size:13px;">🦆🦊</div>
<div style="position:absolute;bottom:8px;left:9px;font-size:13px;">🔍❓</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#d0c040;">Deduction</div>
<div class="ck-card-title">Duck Disguise</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#5a4418,#8a6828);">▶ Play</button>
<button class="ck-htp-btn" data-title="Duck Disguise" data-body="One player is a predator in disguise. Use deduction clues each round to identify the impostor before they strike. Vote wisely." style="margin-top:5px;width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">ℹ️ How to Play</button>
</div>
</div>

<div class="ck-card" onclick="window._launchCooking()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#1a0c06,#3a1a08,#6a3010);position:relative;">
🍳🦆
<div style="position:absolute;top:9px;right:9px;font-size:13px;">🥕🧅</div>
<div style="position:absolute;bottom:8px;left:9px;font-size:13px;">🔥⭐</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#ff9040;">Cooking</div>
<div class="ck-card-title">Duck Cooking</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#8a3a08,#c05010);">▶ Play</button>
<button class="ck-htp-btn" data-title="Duck Cooking" data-body="Serve customers by cooking the right dishes. Manage multiple orders at once. Upgrade equipment to handle rush hours. Do not burn anything." style="margin-top:5px;width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">ℹ️ How to Play</button>
</div>
</div>
<div class="ck-card" onclick="window._launchDungeon()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#100a1a,#2a1040,#401860);position:relative;">
🏴
<div style="position:absolute;top:9px;right:9px;font-size:13px;">🦆⚔️</div>
<div style="position:absolute;bottom:8px;left:9px;font-size:13px;">🐲💀</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#a070e0;">Dungeon RPG</div>
<div class="ck-card-title">Duck Dungeons</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#3a1060,#6020a0);">▶ Play</button>
<button class="ck-htp-btn" data-title="Duck Dungeons" data-body="Move through rooms, fight enemies turn-by-turn. Visit shops to upgrade. A boss appears every 5 floors. Pick a curse after each boss. How deep can you go?" style="margin-top:5px;width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">ℹ️ How to Play</button>
</div>
</div>
<div class="ck-card" onclick="window._launchFishing()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#020e1a,#041e38,#063060);position:relative;">
🎣🦆
<div style="position:absolute;top:9px;right:9px;font-size:13px;">🐟🌊</div>
<div style="position:absolute;bottom:8px;left:9px;font-size:13px;">🪱✨</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#60d8ff;">Fishing</div>
<div class="ck-card-title">Duck Fishing</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#0a3060,#1060a0);">▶ Play</button>
<button class="ck-htp-btn" data-title="Duck Fishing" data-body="Tap and hold to charge your cast then release to throw. Wait for a nibble then tap at the right moment to hook. Different locations have different fish." style="margin-top:5px;width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">ℹ️ How to Play</button>
</div>
</div>
<div class="ck-card" onclick="window._launchDive()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#020e1a,#041e38,#063060);position:relative;">
🤿🦆
<div style="position:absolute;top:9px;right:9px;font-size:13px;">🐟🦈</div>
<div style="position:absolute;bottom:8px;left:9px;font-size:13px;">💰⬆️</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#40c8f0;">Diving</div>
<div class="ck-card-title">Duck Dive</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#0a5080,#0a80c0);color:#fff;">▶ Play</button>
<button class="ck-htp-btn" data-title="Duck Dive" data-body="Hold anywhere on screen to steer your duck. Collect fish and air bubbles. Surface to sell your catch and buy upgrades. Deeper means rarer fish but less air." style="margin-top:5px;width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">ℹ️ How to Play</button>
</div>
</div>
<div class="ck-card" onclick="window._launchSpell()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#0a0520,#180a40,#2a1060);position:relative;">
🧙🦆
<div style="position:absolute;top:9px;right:9px;font-size:13px;">⚡🔥</div>
<div style="position:absolute;bottom:8px;left:9px;font-size:13px;">💀🌊</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#c080ff;">Wizard</div>
<div class="ck-card-title">Duck Spell</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#3020a0,#6040e0);color:#fff;">▶ Play</button>
<button class="ck-htp-btn" data-title="Duck Spell" data-body="Each turn pick a spell from your hand and tap an enemy to target it. AoE spells fire automatically. End Turn when done then enemies attack. Survive endless waves." style="margin-top:5px;width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">ℹ️ How to Play</button>
</div>
</div>
<div class="ck-card" onclick="window._launchShop()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#0a1a08,#142808,#203810);position:relative;">
🏪🦆
<div style="position:absolute;top:9px;right:9px;font-size:13px;">🪙💰</div>
<div style="position:absolute;bottom:8px;left:9px;font-size:13px;">🛒📦</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#60e060;">Shop Sim</div>
<div class="ck-card-title">Duck Shop</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#206020,#40a040);color:#fff;">▶ Play</button>
<button class="ck-htp-btn" data-title="Duck Shop" data-body="Morning: buy stock and set prices. Open: tap Serve to sell to customers before their patience runs out. Evening: buy upgrades and hire staff. Hit your daily target." style="margin-top:5px;width:100%;padding:5px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">ℹ️ How to Play</button>
</div>
</div>
</div>
<div class="ck-section-label" style="margin-top:22px;">🔜 Coming Soon</div>
<div class="ck-games-grid">


<div class="ck-card" onclick="window._launchMiner()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#1a0e08,#2a1a08,#3a2810);position:relative;">
⛏️🦆
<div style="position:absolute;top:9px;right:9px;font-size:13px;">💎🪨</div>
<div style="position:absolute;bottom:8px;left:9px;font-size:13px;">🪙⬇️</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#c8a060;">⛏️ Mining</div>
<div class="ck-card-title">Duck Miner</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#5a3a08,#8a5a18);">▶ Play</button>
</div>
</div>
<div class="ck-card" onclick="window._launchLeap()">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#0a1a08,#183008,#204010);position:relative;">
🐸🦆
<div style="position:absolute;top:9px;right:9px;font-size:13px;">🚗💨</div>
<div style="position:absolute;bottom:8px;left:9px;font-size:13px;">🏁⬆️</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#60d060;">🐸 Arcade</div>
<div class="ck-card-title">Duck Leap</div>
<button class="ck-card-btn" style="background:linear-gradient(90deg,#1a6020,#0f4018);">▶ Play</button>
</div>
</div>
<div class="ck-card" style="cursor:default;opacity:0.6;">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#0a0a1a,#18182a,#282840);position:relative;">
🦆🦆
<div style="position:absolute;top:9px;right:9px;font-size:13px;">✨🔀</div>
<div style="position:absolute;bottom:8px;left:9px;font-size:13px;">⬆️🦅</div>
<div class="ck-card-lock">🔒</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#8080e0;">Merge</div>
<div class="ck-card-title">Duck Merge</div>
<button class="ck-card-btn" style="background:#252848;color:rgba(255,255,255,0.25);cursor:default;">Coming Soon</button>
</div>
</div>

<div class="ck-card" style="cursor:default;opacity:0.6;">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#1a0508,#2d0a10,#4a1020);position:relative;">
🦆💥
<div style="position:absolute;top:9px;right:9px;font-size:13px;">👑😤</div>
<div style="position:absolute;bottom:8px;left:9px;font-size:13px;">⚔️🛡️</div>
<div class="ck-card-lock">🔒</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:#ff6080;">Boss Fight</div>
<div class="ck-card-title">Duck Bosses</div>
<button class="ck-card-btn" style="background:#252848;color:rgba(255,255,255,0.25);cursor:default;">Coming Soon</button>
</div>
</div>
</div>
<div style="margin-top:26px;text-align:center;font-size:10px;color:rgba(255,255,255,0.14);font-weight:700;letter-spacing:.04em;">More games quacking their way soon 🦆</div>
<div style="margin-top:30px;border-top:1px solid rgba(255,255,255,0.06);padding-top:22px;">
<div class="ck-section-label" style="color:rgba(200,180,255,0.5);">⚰️ The Game Graveyard</div>
<div style="font-size:10px;color:rgba(255,255,255,0.25);margin-bottom:12px;line-height:1.6;">These games have been retired. They live on here in memory.</div>
<div class="ck-games-grid">

<div class="ck-card" style="cursor:default;opacity:0.45;filter:grayscale(0.6);">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#0e2e20,#1a5e3e,#2a9060);position:relative;">
🦆
<div style="position:absolute;bottom:8px;right:9px;font-size:13px;">🥚🐥</div>
<div style="position:absolute;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;font-size:28px;">⚰️</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:rgba(160,140,200,0.6);">Retired</div>
<div class="ck-card-title" style="color:rgba(255,255,255,0.5);">Duck Sandbox</div>
<button class="ck-card-btn" style="background:rgba(80,60,100,0.3);color:rgba(255,255,255,0.2);cursor:default;">Retired</button>
</div>
</div>

<div class="ck-card" style="cursor:default;opacity:0.45;filter:grayscale(0.6);">
<div class="ck-card-thumb" style="background:linear-gradient(135deg,#0d1f0e,#1a3a1a,#2a6a2a);position:relative;">
🦆🥚
<div style="position:absolute;bottom:8px;right:9px;font-size:13px;">🏗️⚡</div>
<div style="position:absolute;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;font-size:28px;">⚰️</div>
</div>
<div class="ck-card-body">
<div class="ck-card-tag" style="color:rgba(160,140,200,0.6);">Retired</div>
<div class="ck-card-title" style="color:rgba(255,255,255,0.5);">Duck Survival</div>
<button class="ck-card-btn" style="background:rgba(80,60,100,0.3);color:rgba(255,255,255,0.2);cursor:default;">Retired</button>
</div>
</div>

</div>
</div>
<div style="margin-top:26px;border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;">
<div class="ck-section-label">💬 Credits</div>
<div class="ck-credits-box">
<div class="ck-credits-hint">🦆 Team 👑</div>
<div class="ck-credit-row" style="border-color:#f5e642;">
<div class="ck-credit-quote">"Cheese is life ykyk"</div>
<div style="text-align:right;">
<div class="ck-credit-name" style="color:#f5e642;" onclick="if(window._unlockAch)window._unlockAch('cheese')">PhillyCheese</div>
<div class="ck-credit-role">creator</div>
</div>
</div>
<div class="ck-credit-row" style="border-color:#4caf50;">
<div class="ck-credit-quote">"THATS MY BOI"</div>
<div style="text-align:right;">
<div class="ck-credit-name" style="color:#4caf50;" onclick="if(window._unlockAch)window._unlockAch('mgm')">Maza</div>
<div class="ck-credit-role">bug tester</div>
</div>
</div>
<div class="ck-credit-row" style="border-color:#2196f3;">
<div class="ck-credit-quote">"I'M SOWWY. AUTISM…. GET OUT"</div>
<div style="text-align:right;">
<div class="ck-credit-name" style="color:#2196f3;" onclick="if(window._unlockAch)window._unlockAch('sowwy')">BobbaTheG0at</div>
<div class="ck-credit-role">bug tester</div>
</div>
</div>
<div class="ck-credit-row" style="border-color:#e91e63;">
<div class="ck-credit-quote">"Not the Chinese warrior, but close enough"</div>
<div style="text-align:right;">
<div class="ck-credit-name" style="color:#e91e63;" onclick="if(window._unlockAch)window._unlockAch('cabbage')">JakieChan</div>
<div class="ck-credit-role">co-owner</div>
</div>
</div>
</div>

<div style="margin-top:22px;border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;">
<div class="ck-section-label">🌐 Community</div>
<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:4px;">
<div onclick="window.open('https://www.tiktok.com/@phillycheese5841','_blank')" style="display:flex;align-items:center;gap:12px;background:rgba(255,255,255,0.04);border:1.5px solid rgba(255,255,255,0.09);border-radius:12px;padding:12px 14px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:rgba(255,255,255,0.1);">
<span style="font-size:26px;flex-shrink:0;">🎵</span>
<div style="flex:1;">
<div style="font-size:13px;font-weight:900;color:#fff;">TikTok</div>
<div style="font-size:11px;color:rgba(255,255,255,0.4);">@phillycheese5841</div>
</div>
<span style="font-size:14px;color:rgba(255,255,255,0.25);">↗</span>
</div>
<div onclick="window.open('https://discord.gg/ZWySC3Qm','_blank')" style="display:flex;align-items:center;gap:12px;background:rgba(88,101,242,0.1);border:1.5px solid rgba(88,101,242,0.3);border-radius:12px;padding:12px 14px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:rgba(88,101,242,0.2);">
<span style="font-size:26px;flex-shrink:0;">💬</span>
<div style="flex:1;">
<div style="font-size:13px;font-weight:900;color:#fff;">Discord</div>
<div style="font-size:11px;color:rgba(255,255,255,0.4);">Join the server</div>
</div>
<span style="font-size:14px;color:rgba(255,255,255,0.25);">↗</span>
</div>
<div onclick="window.open('https://forms.gle/2PEco6rxXCHghJH17','_blank')" style="display:flex;align-items:center;gap:12px;background:rgba(245,230,66,0.06);border:1.5px solid rgba(245,230,66,0.2);border-radius:12px;padding:12px 14px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:rgba(245,230,66,0.15);">
<span style="font-size:26px;flex-shrink:0;">💡</span>
<div style="flex:1;">
<div style="font-size:13px;font-weight:900;color:#fff;">Suggest a feature</div>
<div style="font-size:11px;color:rgba(255,255,255,0.4);">Anonymous · takes 10 seconds</div>
</div>
<span style="font-size:14px;color:rgba(255,255,255,0.25);">↗</span>
</div>
</div>
</div>
<div style="margin-top:22px;border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;">
<div class="ck-section-label">🔑 Codes</div>
<div style="background:#1c1e36;border-radius:14px;padding:14px 16px;margin-bottom:20px;">
<div style="font-size:13px;font-weight:900;color:#f5e642;margin-bottom:4px;">Enter a Code</div>
<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:12px;">Type a secret code to unlock special powers.</div>
<div style="display:flex;gap:8px;margin-bottom:10px;">
<input id="ck-code-input" type="text" placeholder="Enter code..." style="flex:1;background:rgba(255,255,255,0.07);border:1.5px solid rgba(255,255,255,0.15);color:#fff;font-size:14px;font-weight:900;font-family:Nunito,sans-serif;padding:9px 14px;border-radius:10px;outline:none;user-select:text;-webkit-user-select:text;touch-action:auto;">
<button id="ck-code-clear" style="padding:9px 12px;border-radius:10px;border:none;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);font-size:13px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">✕</button>
<button id="ck-code-btn" style="padding:9px 16px;border-radius:10px;border:none;background:linear-gradient(135deg,#3050c0,#5080f0);color:#fff;font-size:13px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">Go</button>
</div>
<div id="ck-code-result" style="font-size:12px;font-weight:900;min-height:20px;color:rgba(255,255,255,0.5);text-align:center;"></div>
</div>
<div class="ck-section-label">📋 Update Log</div>
<div style="display:flex;flex-direction:column;gap:4px;">
<div style="display:flex;align-items:baseline;gap:8px;padding:5px 8px;border-radius:8px;background:#1c1e36;border-left:2px solid rgba(96,216,255,0.7);">
<span style="font-size:9px;font-weight:900;color:#60d8ff;letter-spacing:.08em;white-space:nowrap;">v4.9</span>
<span style="font-size:10px;color:rgba(255,255,255,0.45);line-height:1.5;">🗺️ Duck Royale: 6 new maps · 🐸 Duck Leap: Crossy Road-style arcade · ⛏️ Duck Miner: dig for treasure · 🔀 Duck Merge + 👑 Duck Bosses: coming soon · 🎮 Controller support · 🌿 QoL: search, recently played, seasonal themes, duck facts, transitions · 🐛 Duck Dash entity flood fixed · 🐛 Play buttons fixed for Fishing, Spell, Shop · ⚰️ Game Graveyard added</span>
</div>
<div style="display:flex;align-items:baseline;gap:8px;padding:5px 8px;border-radius:8px;background:#1c1e36;border-left:2px solid rgba(140,140,200,0.4);">
<span style="font-size:9px;font-weight:900;color:rgba(180,180,220,0.6);letter-spacing:.08em;white-space:nowrap;">v4.7</span>
<span style="font-size:10px;color:rgba(255,255,255,0.45);line-height:1.5;">🦆 Duck Survival: brand new sandbox — eggs, flock growth, events, grid building, drag-to-place, destroy tool · 🎨 Sandbox visual overhaul · 🐛 Duck Clicker menu button fixed · 🔑 Codes system with 3 active codes · ♾️ Dive upgrades infinite · 🐛 Multiple exit function fixes across all games</span>
</div>
<div style="background:#1c1e36;border-radius:12px;padding:12px 14px;border-left:3px solid rgba(96,216,255,0.7);">
<div style="font-size:10px;font-weight:900;color:#60d8ff;letter-spacing:.08em;margin-bottom:2px;">v4.6 — Current</div>
<div style="font-size:11px;color:rgba(255,255,255,0.55);line-height:1.7;">ℹ️ How to Play buttons on all 20 games<br>🤿 Duck Dive: 8 depth zones (Void &amp; The Trench added), 4 new hazards<br>🧙 Duck Spell &amp; 🏪 Duck Shop: play buttons fixed</div>
</div>
<div style="background:#1c1e36;border-radius:12px;padding:12px 14px;border-left:3px solid rgba(140,140,200,0.4);">
<div style="font-size:10px;font-weight:900;color:rgba(180,180,220,0.6);letter-spacing:.08em;margin-bottom:2px;">v4.5
<div style="font-size:11px;color:rgba(255,255,255,0.55);line-height:1.7;">🏪 Duck Shop: new game — buy stock, set prices, serve customers, hire staff<br>🧙 Duck Spell: performance fixes · cost colours red when unaffordable<br>🔜 Coming Soon: Duck Miner ⛏️, Duck Leap 🐸</div>
</div>
<div style="background:#1c1e36;border-radius:12px;padding:12px 14px;border-left:3px solid rgba(140,140,200,0.4);">
<div style="font-size:10px;font-weight:900;color:rgba(180,180,220,0.6);letter-spacing:.08em;margin-bottom:2px;">v4.4
<div style="font-size:11px;color:rgba(255,255,255,0.55);line-height:1.7;">🧙 Duck Spell: new game — turn-based wizard combat, 12 spells, 30+ enemies, endless waves<br>🐛 Duck Clicker: shop, prestige shop &amp; duck clicking fully restored<br>🐛 Duck Dash: score freeze fixed · screen scaling fixed<br>🐛 Duck Dungeons: sell exploit removed<br>🔧 All games: loop leaks · iOS scroll · panic button fixed</div>
</div>
<div style="background:#1c1e36;border-radius:12px;padding:12px 14px;border-left:3px solid rgba(140,140,200,0.4);">
<div style="font-size:10px;font-weight:900;color:rgba(180,180,220,0.6);letter-spacing:.08em;margin-bottom:2px;">v4.3
<div style="font-size:11px;color:rgba(255,255,255,0.55);line-height:1.7;">🐛 Duck Clicker: prestige shop function was trapped inside render() — fully fixed<br>🐛 Duck Clicker: shop, duck clicking, menu button &amp; prestige shop all working<br>🐛 Duck Clicker: prestige multiplier no longer stacks 3× on reset<br>🐛 Duck Dash: score freeze at 48 fixed · obstacle scaling fixed for all screen sizes<br>🐛 Duck Dive: camera, fish spawning &amp; menu button all fixed<br>🐛 Duck Fishing: card restored in menu grid<br>🐛 Duck Dungeons: sell exploit removed from shop<br>🔧 All games: background loop leaks patched · iOS scroll restored<br>🚨 Panic button: tap white screen anywhere to dismiss<br>🔜 Coming Soon: Duck Miner ⛏️, Duck Leap 🐸, Duck Shop 🏪</div>
</div>
<div style="background:#1c1e36;border-radius:12px;padding:12px 14px;border-left:3px solid rgba(140,140,200,0.4);">
<div style="font-size:10px;font-weight:900;color:rgba(180,180,220,0.6);letter-spacing:.08em;margin-bottom:2px;">v4.2</div>
<div style="font-size:11px;color:rgba(255,255,255,0.4);line-height:1.7;">🤿 Duck Dive: new game · 🗺️ Royale maps · ⭐ Clicker Prestige Shop<br>⚔️ Dungeon mega bosses &amp; curses · 🏰 Kingdom iron buildings · 🎣 Fishing overhaul<br>🏠 Home button · menu tour · panic button · community tab</div>
</div>
<div style="background:#1c1e36;border-radius:12px;padding:12px 14px;border-left:3px solid rgba(255,160,48,0.7);">
<div style="font-size:10px;font-weight:900;color:#f0a030;letter-spacing:.08em;margin-bottom:2px;">v4.0</div>
<div style="font-size:11px;color:rgba(255,255,255,0.55);line-height:1.7;">🍳 Duck Cooking: full restaurant sim with staff, upgrades, events &amp; collapsible shop dock<br>🎭 Duck Disguise: find the hidden predator using deduction clues<br>🗡️ Duck Dungeons: turn-based roguelike with rarities, enemy arrows, shop rooms &amp; 35 upgrades<br>🏰 Duck Kingdom: attacks, towers, particles and farm auto-sell all fixed<br>🐛 9 sandbox bugs fixed: black hole crash, blizzard weather, BEACON count, runner spawn rate<br>🚨 Panic button: hides everything instantly, button fades to 5% opacity<br>🔧 All mini-games now properly unpause the sandbox on exit<br>📱 iPad &amp; desktop layout improvements across all games<br>🔒 No data saved — fully stateless, nothing persists between sessions</div>
</div>
<div style="background:#1c1e36;border-radius:12px;padding:12px 14px;border-left:3px solid rgba(160,100,255,0.5);">
<div style="font-size:10px;font-weight:900;color:#a060ff;letter-spacing:.08em;margin-bottom:2px;">v3.9</div>
<div style="font-size:11px;color:rgba(255,255,255,0.55);line-height:1.7;">🎭 Duck Dating Sim: 8 characters, hearts, gifts &amp; infinite random dates<br>📈 Duck Market: live price charts + news headlines<br>🧬 Duck Evolution: 6 trait generations, unique species<br>🖥️ Setup screen: device picker + tutorial prompt<br>🔒 Duck Dive moved to Coming Soon</div>
</div>
<div style="background:#1c1e36;border-radius:12px;padding:12px 14px;border-left:3px solid rgba(100,160,255,0.4);">
<div style="font-size:10px;font-weight:900;color:#6090ff;letter-spacing:.08em;margin-bottom:2px;">v3.8</div>
<div style="font-size:11px;color:rgba(255,255,255,0.55);line-height:1.7;">🏰 Duck Kingdom building panel fully fixed<br>🔫 Duck Royale Play Again no longer freezes<br>🏃 Duck Dash tap-to-restart after death fixed<br>🗺️ Duck Kingdom map tile size corrected</div>
</div>
<div style="background:#1c1e36;border-radius:12px;padding:12px 14px;border-left:3px solid rgba(80,200,120,0.4);">
<div style="font-size:10px;font-weight:900;color:#50c878;letter-spacing:.08em;margin-bottom:2px;">v3.7</div>
<div style="font-size:11px;color:rgba(255,255,255,0.55);line-height:1.7;">🔫 Duck Royale income flash &amp; hitPond fixed<br>📱 Mobile touch handling improved across all games<br>🎮 Menu Coming Soon section updated</div>
</div>
<div style="background:#1c1e36;border-radius:12px;padding:12px 14px;border-left:3px solid rgba(200,160,60,0.4);">
<div style="font-size:10px;font-weight:900;color:#c8a030;letter-spacing:.08em;margin-bottom:2px;">v3.6 — Original</div>
<div style="font-size:11px;color:rgba(255,255,255,0.55);line-height:1.7;">🦆 Sandbox, Clicker, Raise a Duck<br>🔫 Royale, Defence, Dash, Beacon<br>🔬 Pond Lab, Cards, Kingdom launched</div>
</div>
</div>
</div>
</div>
</div>`
_ba(menuEl);

// ── Duck Flock Menu Animation ─────────────────────────────────────────────
(function(){
  const cvs = _ce('canvas');
  cvs.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000091;pointer-events:none;';
  _ba(cvs);
  window._menuFlockCvs = cvs;

  function resize(){ cvs.width=innerWidth; cvs.height=innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  const ctx = cvs.getContext('2d');
  const DUCK_EMOJI = '🦆';
  const NUM_DUCKS = 8;
  let ducks = [];

  function makeDuck(i){
    const side = Math.random() < 0.5 ? 1 : -1; // 1=left-to-right, -1=right-to-left
    return {
      x: side===1 ? -60 : innerWidth+60,
      y: 80 + Math.random() * (innerHeight - 160),
      spd: (0.4 + Math.random() * 0.5) * side,
      size: 18 + Math.random() * 14,
      bob: Math.random() * Math.PI * 2,
      bobSpd: 0.8 + Math.random() * 0.6,
      opacity: 0.12 + Math.random() * 0.1,
      delay: i * 1800 + Math.random() * 2000,
      active: false,
    };
  }

  for(let i=0;i<NUM_DUCKS;i++) ducks.push(makeDuck(i));

  let last = performance.now();
  let startTime = performance.now();

  function loop(now){
    if(!window._menuFlockCvs) return;
    // Only draw when menu is visible
    const menuVisible = window._menuEl && window._menuEl.style.display !== 'none';
    ctx.clearRect(0,0,cvs.width,cvs.height);

    if(menuVisible){
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const elapsed = now - startTime;

      ducks.forEach((d, i) => {
        // Activate after delay
        if(!d.active){
          if(elapsed > d.delay) d.active = true;
          else return;
        }

        d.bob += d.bobSpd * dt;
        d.x += d.spd * 60 * dt;

        // Wrap around
        if(d.spd > 0 && d.x > cvs.width + 80){
          Object.assign(d, makeDuck(i));
          d.spd = Math.abs(d.spd);
          d.x = -60;
          d.active = true;
          d.delay = 0;
        }
        if(d.spd < 0 && d.x < -80){
          Object.assign(d, makeDuck(i));
          d.spd = -Math.abs(d.spd);
          d.x = cvs.width + 60;
          d.active = true;
          d.delay = 0;
        }

        // Small ripple behind duck
        const ry = d.y + Math.sin(d.bob) * 4;
        ctx.save();
        ctx.globalAlpha = d.opacity * 0.5;
        ctx.strokeStyle = 'rgba(100,160,220,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(d.x - d.spd * 8, ry + d.size * 0.4, d.size * 0.5, d.size * 0.15, 0, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();

        // Duck
        ctx.save();
        ctx.globalAlpha = d.opacity;
        ctx.font = d.size + 'px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const drawY = d.y + Math.sin(d.bob) * 4;
        if(d.spd < 0){
          ctx.translate(d.x, drawY);
          ctx.scale(-1, 1);
          ctx.fillText(DUCK_EMOJI, 0, 0);
        } else {
          ctx.fillText(DUCK_EMOJI, d.x, drawY);
        }
        ctx.restore();
      });
    } else {
      last = now; // reset dt when menu hidden so no jump
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();

const _featuredGames = [
{ onclick:"window._launchMiner()", bg:"linear-gradient(135deg,#1a0e08,#2a1a08,#3a2810)", icons:[{pos:"top:10px;right:12px",txt:"💎🪨"},{pos:"bottom:8px;left:12px",txt:"🪙⬇️"}], emoji:"⛏️🦆", tag:"⛏️ Mining", tagColor:"#c8a060", title:"Duck Miner", desc:"Dig deep for rare resources. Upgrade your drill, manage fuel, and sell your haul at the surface.", btnBg:"linear-gradient(90deg,#8a5a18,#5a3a08)" },
{ onclick:"window._launchClicker()", bg:"linear-gradient(135deg,#4a1e4d,#6a20a0,#8a2be2)", icons:[{pos:"top:10px;right:12px",txt:"✨💰"},{pos:"bottom:8px;left:12px",txt:"🥚⭐"}], emoji:"🦆✨", tag:"🎮 Clicker", tagColor:"#b06cff", title:"Duck Clicker", desc:"Click the duck. Earn Duck Bucks. Build your pond empire and prestige for multipliers.", btnBg:"linear-gradient(90deg,#8a2be2,#6a1ab2)" },
{ onclick:"window._launchRoyale()", bg:"linear-gradient(135deg,#1a0a0a,#6b1010,#c03020)", icons:[{pos:"top:10px;left:12px",txt:"🦆"},{pos:"bottom:8px;right:12px",txt:"💥🔥"}], emoji:"🔫", tag:"⚔️ Battle", tagColor:"#ff6060", title:"Duck Royale", desc:"Send ducks and predators to destroy the enemy pond. Last pond standing wins.", btnBg:"linear-gradient(90deg,#c03020,#901810)" },
{ onclick:"window._launchDefence()", bg:"linear-gradient(135deg,#0a2a10,#1a6030,#30c060)", icons:[{pos:"top:10px;right:12px",txt:"🛡️"},{pos:"bottom:8px;left:12px",txt:"🦊🐍"}], emoji:"🦆", tag:"🛡️ Tower Defence", tagColor:"#60e080", title:"Duck Defence", desc:"Place towers on the grid and defend your pond against endless waves of predators.", btnBg:"linear-gradient(90deg,#1a8040,#107030)" },
{ onclick:"window._launchRaiseDuck()", bg:"linear-gradient(135deg,#2a1a0e,#6b3a1f,#a06030)", icons:[{pos:"top:10px;left:12px",txt:"🥚"},{pos:"bottom:8px;right:12px",txt:"🍞🎾"}], emoji:"🐣", tag:"🐣 Raising Sim", tagColor:"#e8a060", title:"Raise a Duck", desc:"Hatch an egg, name your duck, and raise it from duckling to adult. Feed, play, clean and love it.", btnBg:"linear-gradient(90deg,#c86a20,#a84e10)" },
{ onclick:"window._launchDash()", bg:"linear-gradient(135deg,#0a0a20,#101848,#1a2880)", icons:[{pos:"top:10px;left:12px",txt:"🪙⭐"},{pos:"bottom:8px;right:12px",txt:"🦊🐍"}], emoji:"🏃🦆", tag:"🏃 Runner", tagColor:"#8888ff", title:"Duck Dash", desc:"Run, jump and double-jump. Dodge predators, grab coins, survive as long as you can!", btnBg:"linear-gradient(90deg,#1a2880,#101860)" },
{ onclick:"window._launchCards()", bg:"linear-gradient(135deg,#1a0a2e,#3a1a5e,#5a2a8e)", icons:[{pos:"top:10px;right:12px",txt:"🃏✨"},{pos:"bottom:8px;left:12px",txt:"🦆🦊"}], emoji:"🃏", tag:"🃏 Memory", tagColor:"#b080ff", title:"Duck Cards", desc:"Flip cards to find matching pairs. 12 levels, streak bonuses and a 9×8 mega final grid.", btnBg:"linear-gradient(90deg,#5a1a9e,#3a0a7e)" },
{ onclick:"window._launchLab()", bg:"linear-gradient(135deg,#0d1a0d,#1a3a1a,#2a6030)", icons:[{pos:"top:10px;right:12px",txt:"🧊👽"},{pos:"bottom:8px;left:12px",txt:"🐉🦆"}], emoji:"🔬", tag:"🔬 Discovery", tagColor:"#60d880", title:"Pond Lab", desc:"Combine creatures to discover 78 hybrids. Fill the Duck Book with every species.", btnBg:"linear-gradient(90deg,#1a6030,#104820)" },
{ onclick:"window._launchCooking()", bg:"linear-gradient(135deg,#1a0c06,#3a1a08,#6a3010)", icons:[{pos:"top:10px;right:12px",txt:"🥕🧅"},{pos:"bottom:8px;left:12px",txt:"🔥⭐"}], emoji:"🍳🦆", tag:"🍳 Cooking", tagColor:"#ff9040", title:"Duck Cooking", desc:"Run your own duck restaurant. Cook orders, hire staff and survive robberies!", btnBg:"linear-gradient(90deg,#8a3a08,#c05010)" },
{ onclick:"window._launchDisguise()", bg:"linear-gradient(135deg,#1a1a0a,#3a3a10,#606018)", icons:[{pos:"top:10px;right:12px",txt:"🦆🦊"},{pos:"bottom:8px;left:12px",txt:"🔍❓"}], emoji:"🎭", tag:"🕵️ Deduction", tagColor:"#d0c040", title:"Duck Disguise", desc:"A predator is hiding among the ducks. Use the clues to unmask the impostor!", btnBg:"linear-gradient(90deg,#5a4418,#8a6828)" },
{ onclick:"window._launchDungeon()", bg:"linear-gradient(135deg,#100a1a,#2a1040,#401860)", icons:[{pos:"top:10px;right:12px",txt:"🦆⚔️"},{pos:"bottom:8px;left:12px",txt:"🐲💀"}], emoji:"🗡️🦆", tag:"⚔️ Dungeon RPG", tagColor:"#a070e0", title:"Duck Dungeons", desc:"Turn-based dungeon crawler. Slay enemies, choose upgrades and face the Dragon.", btnBg:"linear-gradient(90deg,#3a1060,#6020a0)" },
{ onclick:"window._launchDive()", bg:"linear-gradient(135deg,#020e1a,#041e38,#063060)", icons:[{pos:"top:10px;left:12px",txt:"🐟🦈"},{pos:"bottom:10px;right:12px",txt:"🤿💰"},{pos:"top:10px;right:12px",txt:"🌊"}], emoji:"🦆", tag:"🤿 Diving", tagColor:"#40c8f0", title:"Duck Dive", desc:"Steer your duck through the depths. Dodge sharks, collect rare fish, upgrade your gear.", btnBg:"linear-gradient(90deg,#0a5080,#0a80c0)" },
{ onclick:"window._launchFishing()", bg:"linear-gradient(135deg,#020e1a,#041e38,#063060)", icons:[{pos:"top:10px;right:12px",txt:"🐟🌊"},{pos:"bottom:8px;left:12px",txt:"🪱✨"}], emoji:"🎣🦆", tag:"🎣 Fishing", tagColor:"#60d8ff", title:"Duck Fishing", desc:"Cast your line, wait for the bite, and reel in fish from pond to ocean.", btnBg:"linear-gradient(90deg,#0a3060,#1060a0)" },
];
window.startMenuTour=function startMenuTour(){
// ── Menu orientation tour ────────────────────────────
const STEPS=[
{
  target:'#ck-featured-slot',
  title:'Featured Game',
  body:'This rotates through all the mini-games. Tap the card or the Play button to jump straight in.',
  arrow:'down',
},
{
  target:'#ck-menu-body',
  title:'All Games',
  body:'Scroll down to browse every game. Tap any card to launch it. New games get added regularly!',
  arrow:'up',
  scrollTo:0.3,
},
{
  target:null,
  title:'🏠 Home Button',
  body:'Wherever you are — in a game, in the sandbox — the 🏠 button on the left edge always brings you back here.',
  arrow:null,
},
{
  target:null,
  title:'ℹ️ Info Button',
  body:'Tap the ℹ️ floating button to open the guide, check creatures, read the update log, and join the community.',
  arrow:null,
},
{
  target:null,
  title:"You're ready! 🦆",
  body:"That's everything. Dive into any game, or explore the sandbox running behind the menu. Have fun!",
  arrow:null,
  last:true,
},
];
let _tourStep=0;
const _tourEl=document.createElement('div');
_tourEl.id='ck-tour';
_tourEl.style.cssText='position:fixed;inset:0;z-index:1000090;pointer-events:none;';
document.body.appendChild(_tourEl);
function renderTourStep(){
  const step=STEPS[_tourStep];
  _tourEl.innerHTML='';
  // Dark overlay
  const ov=document.createElement('div');
  ov.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,0.72);pointer-events:all;';
  // Spotlight
  let spotStyle='';
  if(step.target){
    const el=menuEl.querySelector(step.target)||document.querySelector(step.target);
    if(el){
      const r=el.getBoundingClientRect();
      const pad=10;
      spotStyle=`position:absolute;left:${r.left-pad}px;top:${r.top-pad}px;width:${r.width+pad*2}px;height:${r.height+pad*2}px;border-radius:14px;box-shadow:0 0 0 9999px rgba(0,0,0,0.72);background:transparent;pointer-events:none;z-index:1;`;
    }
  }
  // Tooltip card
  const card=document.createElement('div');
  card.style.cssText='position:absolute;left:50%;bottom:80px;transform:translateX(-50%);width:min(320px,88vw);background:#1a1c2e;border:1.5px solid rgba(255,255,255,0.12);border-radius:16px;padding:18px 20px 14px;box-shadow:0 8px 32px rgba(0,0,0,0.6);pointer-events:all;z-index:2;';
  const stepNum=document.createElement('div');
  stepNum.style.cssText='font-size:10px;font-weight:900;color:rgba(255,255,255,0.3);letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px;';
  stepNum.textContent=`Step ${_tourStep+1} of ${STEPS.length}`;
  const title=document.createElement('div');
  title.style.cssText='font-size:17px;font-weight:900;color:#fff;margin-bottom:6px;';
  title.textContent=step.title;
  const body=document.createElement('div');
  body.style.cssText='font-size:13px;color:rgba(255,255,255,0.6);line-height:1.55;margin-bottom:14px;';
  body.textContent=step.body;
  // Progress dots
  const dots=document.createElement('div');
  dots.style.cssText='display:flex;gap:5px;align-items:center;margin-bottom:12px;';
  for(let i=0;i<STEPS.length;i++){
    const d=document.createElement('div');
    d.style.cssText=`width:${i===_tourStep?18:6}px;height:6px;border-radius:3px;background:${i===_tourStep?'#f5e642':'rgba(255,255,255,0.2)'};transition:all .2s;`;
    dots.appendChild(d);
  }
  // Buttons
  const btns=document.createElement('div');
  btns.style.cssText='display:flex;gap:8px;';
  if(!step.last){
    const skip=document.createElement('button');
    skip.style.cssText='flex:1;padding:9px;border-radius:9px;border:1px solid rgba(255,255,255,0.12);background:transparent;color:rgba(255,255,255,0.4);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;touch-action:manipulation;';
    skip.textContent='Skip tour';
    const next=document.createElement('button');
    next.style.cssText='flex:2;padding:9px;border-radius:9px;border:none;background:linear-gradient(135deg,#3040a0,#5060d0);color:#fff;font-size:13px;font-weight:900;cursor:pointer;font-family:inherit;touch-action:manipulation;';
    next.textContent='Next →';
    function _advance(e){e.stopPropagation();e.preventDefault();_tourStep++;if(_tourStep>=STEPS.length){_tourEl.remove();}else{renderTourStep();}}
    function _skipAll(e){e.stopPropagation();e.preventDefault();_tourEl.remove();}
    next.addEventListener('click',_advance);next.addEventListener('touchend',_advance,{passive:false});
    skip.addEventListener('click',_skipAll);skip.addEventListener('touchend',_skipAll,{passive:false});
    btns.appendChild(skip);btns.appendChild(next);
  } else {
    const done=document.createElement('button');
    done.style.cssText='flex:1;padding:10px;border-radius:9px;border:none;background:linear-gradient(135deg,#20a060,#30d080);color:#fff;font-size:13px;font-weight:900;cursor:pointer;font-family:inherit;touch-action:manipulation;';
    done.textContent="Let's go! 🦆";
    function _done(e){e.stopPropagation();e.preventDefault();_tourEl.remove();}
    done.addEventListener('click',_done);done.addEventListener('touchend',_done,{passive:false});
    btns.appendChild(done);
  }
  card.appendChild(stepNum);card.appendChild(title);card.appendChild(body);card.appendChild(dots);card.appendChild(btns);
  if(spotStyle){const sp=document.createElement('div');sp.style.cssText=spotStyle;_tourEl.appendChild(sp);}
  _tourEl.appendChild(ov);
  _tourEl.appendChild(card);
}
renderTourStep();
}
window._randomiseFeatured = function(){
const _fg = _featuredGames[_mf(_mr() * _featuredGames.length)];
const _fslot = menuEl.querySelector('#ck-featured-slot');
if(_fslot){
_fslot.className = 'ck-featured';
_fslot.onclick = null;
_fslot._fgHandler && _fslot.removeEventListener('click', _fslot._fgHandler);
_fslot._fgHandler = function(e){e.preventDefault();try{eval(_fg.onclick);}catch(ex){}};
_fslot.addEventListener('click', _fslot._fgHandler);
_fslot.innerHTML = `<div class="ck-featured-thumb" style="background:${_fg.bg};">${_fg.icons.map(i=>`<div style="position:absolute;${i.pos};font-size:15px;">${i.txt}</div>`).join('')}${_fg.emoji}</div><div class="ck-featured-info"><div class="ck-featured-tag" style="color:${_fg.tagColor};">${_fg.tag}</div><div class="ck-featured-title">${_fg.title}</div><div class="ck-featured-desc">${_fg.desc}</div><button class="ck-featured-btn" style="background:${_fg.btnBg};color:#fff;">▶ Play Now</button></div>`;
}
// Wire pointerdown for new game cards
['Spell','Shop'].forEach(name=>{
  const card=menuEl.querySelector('[onclick="window._launch'+name+'()"]');
  if(card&&!card._wired){
    card._wired=true;
    card.addEventListener('pointerdown',e=>{
      if(window['_launch'+name])window['_launch'+name]();
    });
  }
});
};
window._randomiseFeatured();
})();
(()=>{
// ═══════════════════════════════════════════════════════════════
// DUCK SURVIVAL — new Duck Sandbox
// ═══════════════════════════════════════════════════════════════

let _dsEl=null, _dsRAF=null, _dsInterval=null;

window._launchSandbox=function(){ _showRetiredToast('Duck Sandbox'); };

function _dsPause(){if(_dsRAF){_caf(_dsRAF);_dsRAF=null;}}
function _dsResume(){if(!_dsRAF)_dsRAF=_raf(_dsLoop);}

// ── Constants ────────────────────────────────────────────────
const GRID_COLS=9, GRID_ROWS=9;
const POND_CELLS=[ // cells that are pond (centre region)
  [3,3],[3,4],[3,5],[4,2],[4,3],[4,4],[4,5],[4,6],
  [5,2],[5,3],[5,4],[5,5],[5,6],[6,3],[6,4],[6,5]
];
const POND_SET=new Set(POND_CELLS.map(([r,c])=>r+','+c));
const EDGE_SLOTS=[]; // buildable cells around pond
for(let r=1;r<GRID_ROWS-1;r++)for(let c=1;c<GRID_COLS-1;c++){
  if(!POND_SET.has(r+','+c)) EDGE_SLOTS.push([r,c]);
}

const BUILDINGS=[
  {id:'feeder',    e:'🌾', name:'Feeder',       cost:{food:0,water:0,energy:0}, prod:{food:2},   desc:'Produces 2 food/s'},
  {id:'pump',      e:'💧', name:'Water Pump',   cost:{food:5,water:0,energy:0}, prod:{water:2},  desc:'Produces 2 water/s'},
  {id:'nest',      e:'🏠', name:'Nest Box',     cost:{food:8,water:5,energy:0}, prod:{shelter:3},desc:'+3 shelter capacity'},
  {id:'windmill',  e:'🌀', name:'Windmill',     cost:{food:10,water:8,energy:0},prod:{energy:2}, desc:'Produces 2 energy/s'},
  {id:'medhut',    e:'💊', name:'Medicine Hut', cost:{food:15,water:10,energy:5},prod:{},        desc:'Enables vaccination'},
  {id:'fence',     e:'🪵', name:'Fence',        cost:{food:12,water:0,energy:3}, prod:{},        desc:'Reduces predator chance'},
];

const EVENTS=[
  {id:'fox',      e:'🦊', title:'Fox Attack!',      dur:12, desc:'A fox is circling. Scare it off or lose a duck.',
   respond:(s)=>{if(s.res.food>=10){s.res.food-=10;showToast('🌾 Threw food — fox distracted!');return true;}return false;},
   miss:(s)=>{killDuck(s);showToast('🦊 Fox took a duck!');} },
  {id:'disease',  e:'🦠', title:'Disease Outbreak!', dur:15, desc:'Ducks are getting sick. Use medicine hut to vaccinate.',
   respond:(s)=>{if(hasBuilding(s,'medhut')&&s.res.water>=8){s.res.water-=8;showToast('💊 Vaccinated the flock!');return true;}return false;},
   miss:(s)=>{const n=Math.min(s.ducks,Math.ceil(s.ducks*0.4));for(let i=0;i<n;i++)killDuck(s);showToast('🦠 Disease killed '+n+' duck'+(n>1?'s':'')+'!');} },
  {id:'drought',  e:'☀️', title:'Drought!',          dur:20, desc:'Water supply dropping fast. Build up reserves.',
   respond:(s)=>{s.buffs.droughtProtect=Date.now()+15000;showToast('💧 Water reserves secured!');return true;},
   miss:(s)=>{s.res.water=Math.max(0,s.res.water-20);showToast('☀️ Drought hit! Water reserves depleted.');} },
  {id:'flood',    e:'🌊', title:'Flash Flood!',       dur:10, desc:'Eggs are at risk! Move to higher ground.',
   respond:(s)=>{showToast('🥚 Eggs protected in time!');return true;},
   miss:(s)=>{const lost=Math.min(s.eggs,Math.floor(s.eggs*0.5)+1);s.eggs=Math.max(0,s.eggs-lost);showToast('🌊 Flood washed away '+lost+' egg'+(lost>1?'s':'')+'!');} },
  {id:'coldsnap', e:'❄️', title:'Cold Snap!',         dur:15, desc:'Ducks need shelter. Make sure capacity is enough.',
   respond:(s)=>{showToast('🏠 Shelter held — ducks survived!');return true;},
   miss:(s)=>{if(s.shelterCap<s.ducks){const n=s.ducks-s.shelterCap;for(let i=0;i<n;i++)killDuck(s);showToast('❄️ '+n+' duck'+(n>1?'s':'')+' froze — not enough shelter!');}} },
  {id:'golden',   e:'✨', title:'Golden Egg!',        dur:20, desc:'A rare golden egg appeared. Collect it!',
   respond:(s)=>{s.res.food+=30;s.res.water+=20;showToast('✨ Golden egg collected! +30 food, +20 water!');return true;},
   miss:(s)=>{showToast('✨ Golden egg hatched on its own — just a normal duck.');s.ducks++;s.totalDucks++;} },
];

// ── State ────────────────────────────────────────────────────
let S={};
function initState(){
  S={
    ducks:1, eggs:0, totalDucks:1, born:Date.now(),
    res:{food:30, water:25, energy:0, shelter:0},
    shelterCap:2,
    grid:{}, // key "r,c" -> building id
    activeEvent:null, eventTimer:0, nextEvent:45,
    buffs:{},
    gameOver:false, survived:0,
    milestones:new Set(),
    toasts:[],
    particles:[],
    eggTimers:{}, // duck index -> next egg time
    eggHatchTimers:[], // {laid, hatch}
    lastTick:performance.now(),
    fenceCount:0,
    selectedBuild:null,
    destroyMode:false,
  };
  // place initial feeder automatically
  S.grid['1,4']='feeder';
}

// ── Helpers ──────────────────────────────────────────────────
function hasBuilding(s,id){return Object.values(s.grid).includes(id);}
function countBuilding(s,id){return Object.values(s.grid).filter(v=>v===id).length;}
function killDuck(s){if(s.ducks>0){s.ducks--;spawnParticle(s,'💀');}}
function showToast(msg){S.toasts.push({msg,born:Date.now()});}
function spawnParticle(s,e){s.particles.push({e,x:_mr()*W(),y:H()*0.4+_mr()*H()*0.3,vy:-60,life:1,born:Date.now()});}

// ── Canvas ───────────────────────────────────────────────────
function W(){return cvs?cvs.width:400;}
function H(){return cvs?cvs.height:400;}
let cvs,ctx,cellW,cellH;

function recalcCell(){
  const bdy=_dsEl.querySelector('#ds-body');
  if(!bdy)return;
  cellW=Math.floor(bdy.clientWidth/GRID_COLS);
  cellH=Math.floor((bdy.clientHeight)/GRID_ROWS);
  cvs.width=cellW*GRID_COLS;
  cvs.height=cellH*GRID_ROWS;
}

// ── Build DS ─────────────────────────────────────────────────
function _buildDuckSurvival(){
  initState();
  _dsEl=_ce('div');
  _dsEl.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000085;display:flex;flex-direction:column;font-family:Nunito,sans-serif;background:#0d1f0e;overflow:hidden;';
  window._dsEl=_dsEl;

  _dsEl.innerHTML=`<style>
#ds *{box-sizing:border-box;}
#ds-hdr{background:#0a1a0b;height:46px;display:flex;align-items:center;gap:4px;padding:0 8px;border-bottom:2px solid rgba(80,200,80,0.2);flex-shrink:0;overflow-x:auto;scrollbar-width:none;}
#ds-title{font-size:14px;font-weight:900;color:#80e090;flex-shrink:0;}
.ds-res{font-size:11px;font-weight:900;padding:3px 8px;border-radius:7px;border:1px solid rgba(80,200,80,0.2);background:rgba(80,200,80,0.07);color:rgba(160,230,160,0.9);flex-shrink:0;}
.ds-res.low{border-color:rgba(220,80,80,0.4);background:rgba(220,80,80,0.1);color:rgba(255,160,160,0.9);}
#ds-menu-btn{margin-left:auto;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.5);font-size:11px;font-weight:900;padding:5px 10px;border-radius:8px;cursor:pointer;font-family:Nunito,sans-serif;}
#ds-body{flex:1;position:relative;overflow:hidden;}
#ds-canvas{display:block;}
#ds-event{position:absolute;top:8px;left:50%;transform:translateX(-50%);background:rgba(160,40,40,0.97);border:1.5px solid rgba(255,100,100,0.5);border-radius:14px;padding:10px 16px;display:none;flex-direction:column;align-items:center;gap:4px;z-index:20;min-width:240px;max-width:88%;}
#ds-event-title{font-size:14px;font-weight:900;color:#fff;}
#ds-event-desc{font-size:11px;color:rgba(255,255,255,0.65);text-align:center;}
#ds-event-timer{font-size:11px;font-weight:900;color:#ffb0b0;}
#ds-event-btn{margin-top:4px;padding:6px 18px;border-radius:9px;border:none;background:rgba(255,255,255,0.15);color:#fff;font-size:12px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;}
#ds-event-btn:hover{background:rgba(255,255,255,0.25);}
.ds-toast{position:absolute;left:50%;transform:translateX(-50%);background:rgba(10,30,12,0.96);border:1px solid rgba(80,200,80,0.3);color:#90e0a0;font-size:11px;font-weight:900;padding:5px 14px;border-radius:9px;pointer-events:none;white-space:nowrap;z-index:25;}
#ds-bottom{background:#0a1a0b;border-top:2px solid rgba(80,200,80,0.15);flex-shrink:0;display:flex;flex-direction:column;}
#ds-tabs{display:flex;border-bottom:1px solid rgba(80,200,80,0.1);}
.ds-tab{padding:7px 14px;font-size:11px;font-weight:900;color:rgba(160,230,160,0.4);cursor:pointer;transition:color .12s,background .12s;border-right:1px solid rgba(80,200,80,0.1);}
.ds-tab.active{color:#80e090;background:rgba(80,200,80,0.07);}
#ds-panel{display:flex;gap:8px;padding:8px 10px;overflow-x:auto;scrollbar-width:none;min-height:72px;align-items:center;}
#ds-panel::-webkit-scrollbar{display:none;}
.ds-bld{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 10px;border:1px solid rgba(80,200,80,0.2);border-radius:10px;cursor:pointer;flex-shrink:0;background:rgba(80,200,80,0.04);transition:all .12s;min-width:70px;}
.ds-bld:hover{border-color:rgba(80,200,80,0.5);background:rgba(80,200,80,0.1);}
.ds-bld.selected{border:2px solid #80e090;background:rgba(80,200,80,0.15);}
.ds-bld.cant{opacity:0.35;cursor:default;}
.ds-bld-e{font-size:20px;line-height:1.2;}
.ds-bld-name{font-size:9px;font-weight:900;color:rgba(160,230,160,0.7);}
.ds-bld-cost{font-size:8px;color:rgba(245,230,66,0.8);}
.ds-info{font-size:11px;color:rgba(160,230,160,0.5);padding:0 4px;line-height:1.6;}
#ds-gameover{position:absolute;inset:0;background:rgba(0,0,0,0.9);display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:30;}
#ds-go-icon{font-size:56px;}
#ds-go-title{font-size:24px;font-weight:900;color:#e06060;font-family:Nunito,sans-serif;}
#ds-go-stats{font-size:12px;color:rgba(255,255,255,0.45);text-align:center;line-height:2;}
#ds-go-restart{padding:11px 26px;border-radius:12px;border:none;font-size:13px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;background:rgba(80,200,80,0.2);color:#80e090;border:1px solid rgba(80,200,80,0.3);}
#ds-go-menu{padding:9px 20px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);font-size:12px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);}

@media (max-height:500px) and (orientation:landscape){
  #ds-bottom{min-height:56px;}
  #ds-hdr{height:36px;}
  .ds-bld{padding:4px 8px;min-width:58px;}
  .ds-bld-e{font-size:16px;}
  #ds-panel{min-height:56px;padding:4px 8px;}
  .ds-tab{padding:5px 12px;font-size:10px;}
}
</style>
<div id="ds" style="display:flex;flex-direction:column;height:100%;">
<div id="ds-hdr">
  <div id="ds-title">🦆 Duck Survival</div>
  <div class="ds-res" id="ds-ducks">🦆 1</div>
  <div class="ds-res" id="ds-eggs">🥚 0</div>
  <div class="ds-res" id="ds-food">🌾 30</div>
  <div class="ds-res" id="ds-water">💧 25</div>
  <div class="ds-res" id="ds-energy">⚡ 0</div>
  <div class="ds-res" id="ds-shelter">🏠 0/2</div>
  <button id="ds-menu-btn">🏠 Menu</button>
</div>
<div id="ds-body">
  <canvas id="ds-canvas"></canvas>
  <div id="ds-event">
    <div id="ds-event-title"></div>
    <div id="ds-event-desc"></div>
    <div id="ds-event-timer"></div>
    <button id="ds-event-btn">Respond</button>
  </div>
  <div id="ds-gameover">
    <div id="ds-go-icon">💀</div>
    <div id="ds-go-title">All ducks perished</div>
    <div id="ds-go-stats" id="ds-go-stats"></div>
    <button id="ds-go-restart">▶ Try Again</button>
    <button id="ds-go-menu">🏠 Menu</button>
  </div>
</div>
<div id="ds-bottom">
  <div id="ds-tabs">
    <div class="ds-tab active" data-tab="build">🔨 Build</div>
    <div class="ds-tab" data-tab="info">📊 Stats</div>
  </div>
  <div id="ds-panel"></div>
</div>
</div>`;

  document.body.appendChild(_dsEl);

  cvs=_dsEl.querySelector('#ds-canvas');
  ctx=cvs.getContext('2d');
  recalcCell();

  const resH=()=>{recalcCell();};
  window.addEventListener('resize',resH);
  window.addEventListener('orientationchange',()=>{setTimeout(resH,150);});
  _dsEl._resH=resH;

  // Canvas click
  // Drag-to-place / destroy
  let _dsPointerDown=false;
  let _dsLastCell=null;
  function _dsHandleCell(mx,my){
    if(S.gameOver)return;
    const rect=cvs.getBoundingClientRect();
    const c=Math.floor((mx-rect.left)/cellW), r=Math.floor((my-rect.top)/cellH);
    if(r<0||r>=GRID_ROWS||c<0||c>=GRID_COLS)return;
    const key=r+','+c;
    const cellKey=r+'_'+c;
    if(_dsLastCell===cellKey)return; // don't re-process same cell
    _dsLastCell=cellKey;
    if(POND_SET.has(key))return;
    if(S.destroyMode){
      if(S.grid[key]){
        const bdef=BUILDINGS.find(b=>b.id===S.grid[key]);
        if(bdef&&bdef.id==='nest')S.shelterCap=Math.max(2,S.shelterCap-(bdef.prod.shelter||0));
        if(bdef&&bdef.id==='fence')S.fenceCount=Math.max(0,S.fenceCount-1);
        delete S.grid[key];
        showToast('🗑 Demolished!');
      }
      return;
    }
    if(S.selectedBuild){
      const bdef=BUILDINGS.find(b=>b.id===S.selectedBuild);
      if(!bdef||S.grid[key])return;
      S.grid[key]=S.selectedBuild;
      if(S.selectedBuild==='nest')S.shelterCap+=bdef.prod.shelter||0;
      if(S.selectedBuild==='fence')S.fenceCount++;
    } else {
      if(S.grid[key]){
        const bdef=BUILDINGS.find(b=>b.id===S.grid[key]);
        if(bdef)showToast(bdef.e+' '+bdef.name+' — '+bdef.desc);
      }
    }
  }
  cvs.addEventListener('pointerdown',e=>{
    e.preventDefault();
    if(S)S._lastInput=Date.now();
    _dsPointerDown=true;_dsLastCell=null;
    _dsHandleCell(e.clientX,e.clientY);
    cvs.setPointerCapture(e.pointerId);
  });
  cvs.addEventListener('pointermove',e=>{
    if(!_dsPointerDown)return;
    _dsHandleCell(e.clientX,e.clientY);
  });
  cvs.addEventListener('pointerup',e=>{_dsPointerDown=false;_dsLastCell=null;});
  cvs.addEventListener('pointercancel',e=>{_dsPointerDown=false;_dsLastCell=null;});

  // Tabs
  _dsEl.querySelectorAll('.ds-tab').forEach(t=>{
    t.addEventListener('pointerdown',e=>{
      e.stopPropagation();
      _dsEl.querySelectorAll('.ds-tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      renderPanel();
    });
  });

  // Event respond btn
  _dsEl.querySelector('#ds-event-btn').addEventListener('pointerdown',e=>{
    e.stopPropagation();
    if(!S.activeEvent)return;
    const ev=EVENTS.find(e=>e.id===S.activeEvent.id);
    if(ev){
      const ok=ev.respond(S);
      if(ok){S.milestones.add('responded');dismissEvent();}
      else showToast('Not enough resources!');
    }
  });

  // Menu btn
  _dsEl.querySelector('#ds-menu-btn').addEventListener('pointerdown',e=>{
    e.stopPropagation();
    _dsPause();
    _dsEl.style.display='none';
    if(window._menuEl)window._menuEl.style.display='flex';
    if(window._randomiseFeatured)window._randomiseFeatured();
    if(window._homeBtn)window._homeBtn.style.display='none';
    window.removeEventListener('resize',_dsEl._resH);
  });

  // Restart
  _dsEl.querySelector('#ds-go-restart').addEventListener('pointerdown',e=>{
    e.stopPropagation();
    _dsEl.querySelector('#ds-gameover').style.display='none';
    initState();
    renderPanel();
    S.lastTick=performance.now();
    _dsResume();
  });

  // Go menu
  _dsEl.querySelector('#ds-go-menu').addEventListener('pointerdown',e=>{
    e.stopPropagation();
    _dsPause();
    _dsEl.style.display='none';
    if(window._menuEl)window._menuEl.style.display='flex';
    if(window._randomiseFeatured)window._randomiseFeatured();
    if(window._homeBtn)window._homeBtn.style.display='none';
    window.removeEventListener('resize',_dsEl._resH);
  });

  renderPanel();
  S.lastTick=performance.now();
  _dsResume();
}

// canvas handled inline above

function getBuildCost(bdef){
  return {}; // all buildings free — sandbox mode
}

// ── Render panel ─────────────────────────────────────────────
let _activeTab='build';
function renderPanel(){
  const panel=_dsEl.querySelector('#ds-panel');
  const activeTabEl=_dsEl.querySelector('.ds-tab.active');
  _activeTab=activeTabEl?activeTabEl.dataset.tab:'build';
  panel.innerHTML='';

  if(_activeTab==='build'){
    BUILDINGS.forEach(bdef=>{
      const cost=getBuildCost(bdef);
      const canAfford=Object.entries(cost).every(([k,v])=>(S.res[k]||0)>=v);
      const isSelected=S.selectedBuild===bdef.id;
      const d=_ce('div');
      d.className='ds-bld'+(isSelected?' selected':canAfford?'':' cant');
      const costStr=Object.entries(cost).map(([k,v])=>({food:'🌾',water:'💧',energy:'⚡'}[k]+v)).join(' ') || 'Free';
      d.innerHTML=`<div class="ds-bld-e">${bdef.e}</div><div class="ds-bld-name">${bdef.name}</div><div class="ds-bld-cost">${costStr}</div>`;
      if(canAfford)d.addEventListener('pointerdown',e=>{
        e.stopPropagation();
        S.selectedBuild=S.selectedBuild===bdef.id?null:bdef.id;
        if(S.selectedBuild)S.destroyMode=false;
        renderPanel();
      });
      panel.appendChild(d);
    });
    // Destroy tool
    const destroyBtn=_ce('div');
    destroyBtn.className='ds-bld'+(S.destroyMode?' selected':'');
    destroyBtn.style.borderColor=S.destroyMode?'rgba(220,80,80,0.8)':'';
    destroyBtn.style.background=S.destroyMode?'rgba(220,80,80,0.15)':'';
    destroyBtn.innerHTML='<div class="ds-bld-e">🗑</div><div class="ds-bld-name">Destroy</div><div class="ds-bld-cost">Tap/drag</div>';
    destroyBtn.addEventListener('pointerdown',e=>{
      e.stopPropagation();
      S.destroyMode=!S.destroyMode;
      if(S.destroyMode)S.selectedBuild=null;
      renderPanel();
    });
    panel.appendChild(destroyBtn);
    const hint=_ce('div');
    hint.className='ds-info';
    hint.textContent=S.destroyMode?'Tap or drag to demolish buildings':S.selectedBuild?'Tap or drag to place':'Select a building to place, or use Destroy';
    panel.appendChild(hint);
  } else {
    const age=Math.floor((Date.now()-S.born)/1000);
    const mins=Math.floor(age/60), secs=age%60;
    const info=_ce('div');
    info.className='ds-info';
    info.innerHTML=`🦆 Peak flock: ${S.totalDucks} &nbsp;|&nbsp; ⏱ Survived: ${mins}m ${secs}s<br>🥚 Eggs laid: ${S.eggHatchTimers.length+S.eggs} &nbsp;|&nbsp; 🏗 Buildings: ${Object.keys(S.grid).length}`;
    panel.appendChild(info);
  }
}

// ── Tick resources ────────────────────────────────────────────
function tickResources(dt){
  const inDrought=S.buffs.droughtProtect&&Date.now()<S.buffs.droughtProtect?false:(S.activeEvent&&S.activeEvent.id==='drought');

  // Production from buildings
  let prod={food:0,water:0,energy:0};
  for(const bid of Object.values(S.grid)){
    const bdef=BUILDINGS.find(b=>b.id===bid);
    if(bdef&&bdef.prod){
      for(const [k,v] of Object.entries(bdef.prod)){
        if(k!=='shelter') prod[k]=(prod[k]||0)+v;
      }
    }
  }

  // Base foraging (always some food from pond)
  prod.food+=0.5;
  prod.water+=inDrought?-1:0.3;

  // Apply
  S.res.food=Math.max(0,Math.min(999,S.res.food+prod.food*dt));
  S.res.water=Math.max(0,Math.min(999,S.res.water+prod.water*dt));
  S.res.energy=Math.max(0,Math.min(999,S.res.energy+prod.energy*dt));

  // Ducks consume food and water
  const consume=S.ducks*0.3*dt;
  S.res.food=Math.max(0,S.res.food-consume);
  S.res.water=Math.max(0,S.res.water-consume*0.6);

  // Starvation
  if(S.res.food<=0&&S.ducks>0){
    S._starvTimer=(S._starvTimer||0)+dt;
    if(S._starvTimer>8){S._starvTimer=0;killDuck(S);showToast('🌾 A duck starved!');}
  } else S._starvTimer=0;

  if(S.res.water<=0&&S.ducks>0){
    S._thirstTimer=(S._thirstTimer||0)+dt;
    if(S._thirstTimer>10){S._thirstTimer=0;killDuck(S);showToast('💧 A duck died of thirst!');}
  } else S._thirstTimer=0;
}

// ── Egg system ────────────────────────────────────────────────
function tickEggs(dt){
  if(S.ducks<=0)return;
  // Each duck lays an egg every 30s (scaled by food)
  const eggRate=S.ducks*(S.res.food>20?1:0.3)/30;
  S._eggAccum=(S._eggAccum||0)+eggRate*dt;
  if(S._eggAccum>=1){
    S._eggAccum-=1;
    const hatchAt=Date.now()+20000; // eggs hatch in 20s
    S.eggHatchTimers.push({laid:Date.now(),hatch:hatchAt});
    S.eggs++;
    spawnParticle(S,'🥚');
  }

  // Hatch eggs
  const now=Date.now();
  S.eggHatchTimers=S.eggHatchTimers.filter(eg=>{
    if(now>=eg.hatch){
      S.eggs=Math.max(0,S.eggs-1);
      S.ducks++;
      S.totalDucks++;
      spawnParticle(S,'🐥');
      showToast('🐥 An egg hatched!');
      checkMilestones();
      return false;
    }
    return true;
  });
}

// ── Events ────────────────────────────────────────────────────
function tickEvents(dt){
  if(S.gameOver)return;
  S.nextEvent-=dt;
  if(S.nextEvent<=0&&!S.activeEvent&&S.ducks>0){
    const ev=EVENTS[_mf(_mr()*EVENTS.length)];
    S.activeEvent={id:ev.id,timer:ev.dur};
    const banner=_dsEl.querySelector('#ds-event');
    if(banner){
      banner.style.display='flex';
      banner.querySelector('#ds-event-title').textContent=ev.e+' '+ev.title;
      banner.querySelector('#ds-event-desc').textContent=ev.desc;
    }
    S.nextEvent=35+_mr()*25;
  }

  if(S.activeEvent){
    S.activeEvent.timer-=dt;
    const te=_dsEl.querySelector('#ds-event-timer');
    if(te)te.textContent='⏱ '+Math.ceil(S.activeEvent.timer)+'s to respond';
    if(S.activeEvent.timer<=0){
      const ev=EVENTS.find(e=>e.id===S.activeEvent.id);
      if(ev)ev.miss(S);
      dismissEvent();
      checkGameOver();
    }
  }
}

function dismissEvent(){
  S.activeEvent=null;
  const banner=_dsEl.querySelector('#ds-event');
  if(banner)banner.style.display='none';
}

// ── Milestones ────────────────────────────────────────────────
function checkMilestones(){
  if(S.ducks>=5&&!S.milestones.has('flock5')){S.milestones.add('flock5');showToast('🏆 Milestone: 5 ducks!');}
  if(S.ducks>=10&&!S.milestones.has('flock10')){S.milestones.add('flock10');showToast('🏆 Milestone: 10 ducks!');}
  if(S.ducks>=20&&!S.milestones.has('flock20')){S.milestones.add('flock20');showToast('🏆 Milestone: 20 ducks!');}
  if(Object.keys(S.grid).length>=5&&!S.milestones.has('builder')){S.milestones.add('builder');showToast('🏆 Milestone: 5 buildings!');}
  const age=Math.floor((Date.now()-S.born)/1000);
  if(age>=120&&!S.milestones.has('2min')){S.milestones.add('2min');showToast('🏆 Survived 2 minutes!');}
  if(age>=300&&!S.milestones.has('5min')){S.milestones.add('5min');showToast('🏆 Survived 5 minutes!');}
}

// ── Game over ─────────────────────────────────────────────────
function checkGameOver(){
  if(S.ducks<=0&&S.eggs<=0){
    S.gameOver=true;
    _dsPause();
    const go=_dsEl.querySelector('#ds-gameover');
    if(go){
      go.style.display='flex';
      const age=Math.floor((Date.now()-S.born)/1000);
      const mins=Math.floor(age/60),secs=age%60;
      go.querySelector('#ds-go-stats').innerHTML=
        `Survived: ${mins}m ${secs}s\nPeak flock: ${S.totalDucks} ducks\nBuildings placed: ${Object.keys(S.grid).length}\nMilestones: ${S.milestones.size}`;
    }
  }
}

// ── HUD ───────────────────────────────────────────────────────
function updateHUD(){
  const low=(r,thresh)=>S.res[r]<thresh;
  const set=(id,txt,r,thresh)=>{
    const el=_dsEl.querySelector(id);
    if(el){el.textContent=txt;el.className='ds-res'+(low(r,thresh)?' low':'');}
  };
  set('#ds-ducks','🦆 '+S.ducks,null,0);
  set('#ds-eggs','🥚 '+S.eggs,null,0);
  set('#ds-food','🌾 '+Math.floor(S.res.food),'food',10);
  set('#ds-water','💧 '+Math.floor(S.res.water),'water',10);
  set('#ds-energy','⚡ '+Math.floor(S.res.energy),'energy',-1);
  const shEl=_dsEl.querySelector('#ds-shelter');
  if(shEl)shEl.textContent='🏠 '+S.ducks+'/'+S.shelterCap;
}

// ── Draw ──────────────────────────────────────────────────────
let _animT=0;
function draw(now){
  _animT=now/1000;
  ctx.clearRect(0,0,W(),H());

  // Background
  ctx.fillStyle='#0d1f0e';
  ctx.fillRect(0,0,W(),H());

  // Grid cells
  for(let r=0;r<GRID_ROWS;r++)for(let c=0;c<GRID_COLS;c++){
    const x=c*cellW, y=r*cellH;
    const key=r+','+c;
    const isPond=POND_SET.has(key);
    const isBuildable=!isPond;

    if(isPond){
      // Pond gradient
      const cx2=x+cellW/2, cy2=y+cellH/2;
      const ripple=0.85+0.15*Math.sin(_animT*1.5+r*0.8+c*0.6);
      ctx.fillStyle=`rgba(20,90,160,${ripple*0.85})`;
      ctx.fillRect(x,y,cellW,cellH);
      // shimmer
      ctx.fillStyle='rgba(100,180,240,0.12)';
      ctx.fillRect(x,y,cellW,3);
    } else {
      // Grass
      const shade=((r+c)%2===0)?'#102212':'#0d1f0e';
      ctx.fillStyle=shade;
      ctx.fillRect(x,y,cellW,cellH);
    }

    // Grid lines
    ctx.strokeStyle='rgba(80,200,80,0.06)';
    ctx.lineWidth=0.5;
    ctx.strokeRect(x,y,cellW,cellH);

    // Building hover highlight
    if(S.selectedBuild&&isBuildable&&!S.grid[key]){
      ctx.fillStyle='rgba(80,200,80,0.08)';
      ctx.fillRect(x+1,y+1,cellW-2,cellH-2);
    }

    // Building
    if(S.grid[key]){
      const bdef=BUILDINGS.find(b=>b.id===S.grid[key]);
      if(bdef){
        ctx.font=`${Math.min(cellW,cellH)*0.55}px serif`;
        ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(bdef.e,x+cellW/2,y+cellH/2);
      }
    }
  }

  // Pond label
  ctx.font='bold 11px Nunito,sans-serif';
  ctx.fillStyle='rgba(100,180,240,0.5)';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('🌊 Pond',W()/2,H()/2);

  // Idle wiggle
  if(!S._lastInput)S._lastInput=Date.now();
  const _idleTime=(Date.now()-S._lastInput)/1000;
  const _wiggle=_idleTime>8?Math.sin(_animT*8)*3:0;

  // Ducks on pond
  const duckSlots=POND_CELLS.slice(0,Math.min(S.ducks,POND_CELLS.length));
  duckSlots.forEach(([r,c],i)=>{
    const x=c*cellW+cellW/2, y=r*cellH+cellH/2;
    const bob=Math.sin(_animT*2+i*1.3)*2;
    ctx.font=`${Math.min(cellW,cellH)*0.5}px serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('🦆',x+_wiggle*(i%2===0?1:-1),y+bob);
  });

  // Eggs on pond edge
  const eggSlots=POND_CELLS.slice(POND_CELLS.length-Math.min(S.eggs,4));
  eggSlots.forEach(([r,c],i)=>{
    const x=c*cellW+cellW*0.8, y=r*cellH+cellH*0.8;
    ctx.font=`${Math.min(cellW,cellH)*0.35}px serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    // hatch progress glow
    const eg=S.eggHatchTimers[i];
    if(eg){
      const pct=(Date.now()-eg.laid)/(eg.hatch-eg.laid);
      if(pct>0.7){
        ctx.fillStyle=`rgba(255,220,80,${(pct-0.7)/0.3*0.5})`;
        ctx.beginPath();ctx.arc(x,y,cellW*0.25,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.fillText('🥚',x,y);
  });

  // Particles
  const now2=Date.now();
  S.particles=S.particles.filter(p=>{
    const age=(now2-p.born)/1000;
    if(age>1.2)return false;
    p.y+=p.vy*(1/60);
    ctx.globalAlpha=Math.max(0,1-age/1.2);
    ctx.font='16px serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(p.e,p.x,p.y);
    ctx.globalAlpha=1;
    return true;
  });

  // Toasts
  const toastContainer=_dsEl.querySelector('#ds-body');
  _dsEl.querySelectorAll('.ds-toast').forEach(t=>t.remove());
  S.toasts=S.toasts.filter(t=>{
    const age=now2-t.born;
    if(age>2200)return false;
    const el=_ce('div');el.className='ds-toast';
    el.textContent=t.msg;
    el.style.cssText+=`;top:${8+(S.toasts.indexOf(t)*28)}px;opacity:${Math.max(0,1-(age-1600)/600)}`;
    toastContainer.appendChild(el);
    return true;
  });

  // Selected build indicator
  if(S.selectedBuild){
    const bdef=BUILDINGS.find(b=>b.id===S.selectedBuild);
    ctx.font='bold 11px Nunito,sans-serif';
    ctx.fillStyle='rgba(80,200,80,0.8)';
    ctx.textAlign='center';ctx.textBaseline='bottom';
    ctx.fillText('Placing: '+bdef.e+' '+bdef.name+' — tap empty cell',W()/2,H()-4);
  }
}

// ── Main loop ─────────────────────────────────────────────────
function _dsLoop(now){
  if(!_dsEl||_dsEl.style.display==='none'){_dsRAF=null;return;}
  const dt=Math.min((now-S.lastTick)/1000,0.1);
  S.lastTick=now;
  if(!S.gameOver){
    tickResources(dt);
    tickEggs(dt);
    tickEvents(dt);
    checkMilestones();
    checkGameOver();
    updateHUD();
    if(Math.random()<0.02) renderPanel(); // refresh costs periodically
  }
  draw(now);
  _dsRAF=_raf(_dsLoop);
}

})();
(()=>{
// ═══════════════════════════════════════════════════════
// DUCK LEAP — Crossy Road style
// ═══════════════════════════════════════════════════════
let _leapEl=null,_leapRAF=null;
window._launchLeap=function(){
  window.paused=true;
  if(window._menuEl)window._menuEl.style.display='none';
  if(window._homeBtn)window._homeBtn.style.display='';
  window._leapActive=true;
  if(_leapEl){_leapEl.style.display='flex';_leapResume();return;}
  _buildLeap();
};
window._exitLeap=function(){
  window._leapActive=false;
  window.paused=false;
  _leapPause();
  if(_leapEl){_leapEl.style.display='none';}
  if(window._menuEl)window._menuEl.style.display='flex';
  if(window._randomiseFeatured)window._randomiseFeatured();
  if(window._homeBtn)window._homeBtn.style.display='none';
};
function _leapPause(){if(_leapRAF){_caf(_leapRAF);_leapRAF=null;}}
function _leapResume(){if(!_leapRAF)_leapRAF=_raf(_leapLoop);}

function _buildLeap(){
  _leapEl=_ce('div');
  _leapEl.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000085;display:flex;flex-direction:column;font-family:Nunito,sans-serif;background:#1a2a1a;overflow:hidden;';
  window._leapEl=_leapEl;

  _leapEl.innerHTML=`<style>
#lp *{box-sizing:border-box;}
#lp-hdr{background:#111e11;height:46px;display:flex;align-items:center;padding:0 10px;gap:6px;border-bottom:2px solid rgba(80,200,80,0.2);flex-shrink:0;overflow-x:auto;scrollbar-width:none;}
#lp-score{font-size:18px;font-weight:900;color:#f5e642;flex:1;}
#lp-best{font-size:12px;font-weight:900;color:rgba(255,255,255,0.35);}
#lp-menu-btn{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.5);font-size:11px;font-weight:900;padding:5px 11px;border-radius:8px;cursor:pointer;font-family:Nunito,sans-serif;}
#lp-body{flex:1;position:relative;overflow:hidden;touch-action:none;}
#lp-canvas{display:block;}
#lp-over{position:absolute;inset:0;background:rgba(0,0,0,0.88);display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:20;}
#lp-over-icon{font-size:56px;}
#lp-over-title{font-size:26px;font-weight:900;color:#e06060;font-family:Nunito,sans-serif;}
#lp-over-score{font-size:14px;color:rgba(255,255,255,0.5);}
#lp-over-restart{padding:11px 28px;border-radius:12px;border:1px solid rgba(80,200,80,0.4);background:rgba(80,200,80,0.12);color:#80e090;font-size:13px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;}
#lp-over-menu{padding:9px 20px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);font-size:12px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);}
#lp-start{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;z-index:10;}
#lp-start-duck{font-size:64px;animation:lpBob 1.2s ease-in-out infinite;}
@keyframes lpBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
#lp-start-title{font-size:24px;font-weight:900;color:#fff;}
#lp-start-sub{font-size:13px;color:rgba(255,255,255,0.4);text-align:center;max-width:240px;line-height:1.6;}
#lp-start-btn{padding:12px 32px;border-radius:14px;border:none;background:linear-gradient(90deg,#2a8040,#1a6030);color:#80e090;font-size:14px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;}
</style>
<div id="lp" style="display:flex;flex-direction:column;height:100%;">
<div id="lp-hdr">
  <div id="lp-score">🏃 0</div>
  <div id="lp-best">Best: 0</div>
  <button id="lp-menu-btn">🏠 Menu</button>
</div>
<div id="lp-body">
  <canvas id="lp-canvas"></canvas>
  <div id="lp-start">
    <div id="lp-start-duck">🦆</div>
    <div id="lp-start-title">Duck Leap</div>
    <div id="lp-start-sub">Tap to hop forward. Dodge traffic and cross rivers on logs.</div>
    <button id="lp-start-btn">▶ Play</button>
  </div>
  <div id="lp-over">
    <div id="lp-over-icon">💀</div>
    <div id="lp-over-title">Squashed!</div>
    <div id="lp-over-score"></div>
    <button id="lp-over-restart">▶ Try Again</button>
    <button id="lp-over-menu">🏠 Menu</button>
  </div>
</div>
</div>`;

  document.body.appendChild(_leapEl);

  const cvs=_leapEl.querySelector('#lp-canvas');
  const ctx=cvs.getContext('2d');
  const body=_leapEl.querySelector('#lp-body');

  function resize(){cvs.width=body.clientWidth;cvs.height=body.clientHeight;}
  resize();
  const _rh=()=>resize();
  window.addEventListener('resize',_rh);
  window.addEventListener('orientationchange',()=>{setTimeout(_rh,100);});
  _leapEl._rh=_rh;

  // ── Game constants ───────────────────────────────────
  const TILE=52;
  const LANE_TYPES=['safe','road','road','road','water','water','safe','road','road','water','water','road'];

  // ── State ────────────────────────────────────────────
  let duck,lanes,camY,score,best=0,gameOver,started,moving,moveQueue;

  function initGame(){
    score=0;gameOver=false;started=false;moving=false;moveQueue=[];
    // Duck starts near bottom
    duck={x:0,y:0,drawY:0,dead:false,onLog:null};
    lanes=[];camY=0;
    buildLanes(30);
    duck.y=0;duck.drawY=0;
    _leapEl.querySelector('#lp-over').style.display='none';
    _leapEl.querySelector('#lp-start').style.display='flex';
  }

  function buildLanes(n){
    const startLen=lanes.length;
    for(let i=0;i<n;i++){
      const row=startLen+i;
      // first 2 rows always safe
      const type=row<=1?'safe':LANE_TYPES[_mf(_mr()*LANE_TYPES.length)];
      lanes.push(makeLane(row,type));
    }
  }

  function makeLane(row,type){
    const lane={row,type,objs:[]};
    if(type==='road'){
      const dir=_mr()<0.5?1:-1;
      const spd=(1.5+_mr()*2.5+score*0.01)*dir;
      const spacing=120+_mr()*160;
      const W=cvs.width||400;
      const vehicles=['🚗','🚕','🚙','🚌','🚛'];
      const e=vehicles[_mf(_mr()*vehicles.length)];
      let x=_mr()*W;
      while(x<W+200){lane.objs.push({x,spd,e,w:48});x+=spacing;}
      while(x>-200){lane.objs.push({x,spd,e,w:48});x-=spacing;}
    } else if(type==='water'){
      const dir=_mr()<0.5?1:-1;
      const spd=(0.8+_mr()*1.2)*dir;
      const W=cvs.width||400;
      let x=-50;
      while(x<W+100){lane.objs.push({x,spd,w:80+_mr()*40,e:'🪵'});x+=140+_mr()*80;}
    }
    return lane;
  }

  // ── Input ────────────────────────────────────────────
  let _touchStart=null;
  body.addEventListener('pointerdown',e=>{
    e.preventDefault();
    if(!started){startGame();return;}
    if(gameOver)return;
    _touchStart={x:e.clientX,y:e.clientY};
  },{passive:false});
  body.addEventListener('pointerup',e=>{
    if(!started||gameOver)return;
    if(!_touchStart)return;
    const dx=e.clientX-_touchStart.x, dy=e.clientY-_touchStart.y;
    const adx=Math.abs(dx),ady=Math.abs(dy);
    if(adx<10&&ady<10){move(0,-1);}// tap = forward
    else if(adx>ady){move(dx>0?1:-1,0);}// horizontal swipe
    else{move(0,dy>0?1:-1);}// vertical swipe
    _touchStart=null;
  });

  document.addEventListener('keydown',onKey);
  function onKey(e){
    if(!window._leapActive)return;
    if(!started){startGame();return;}
    if(gameOver)return;
    if(e.key==='ArrowUp'||e.key==='w')move(0,-1);
    else if(e.key==='ArrowDown'||e.key==='s')move(0,1);
    else if(e.key==='ArrowLeft'||e.key==='a')move(-1,0);
    else if(e.key==='ArrowRight'||e.key==='d')move(1,0);
  }

  function startGame(){
    started=true;
    _leapEl.querySelector('#lp-start').style.display='none';
  }

  function move(dx,dy){
    if(moving){moveQueue.push({dx,dy});return;}
    // Can't go back past row 0
    if(duck.y+dy>0)return;
    moving=true;
    duck.x=Math.max(-4,Math.min(4,duck.x+dx));
    duck.y+=dy;
    if(duck.y<0){
      score=Math.max(score,-duck.y);
      const el=_leapEl.querySelector('#lp-score');
      if(el)el.textContent='🏃 '+score;
      // Build more lanes ahead
      if(-duck.y+15>lanes.length)buildLanes(20);
    }
    // Animate
    const targetY=duck.y;
    const startDY=duck.drawY;
    const endDY=targetY;
    const startT=performance.now();
    const dur=100;
    function animStep(now){
      const t=Math.min((now-startT)/dur,1);
      duck.drawY=startDY+(endDY-startDY)*t;
      if(t<1){_raf(animStep);}
      else{
        duck.drawY=endDY;
        moving=false;
        if(moveQueue.length){const m=moveQueue.shift();move(m.dx,m.dy);}
      }
    }
    _raf(animStep);
  }

  // ── Update ───────────────────────────────────────────
  let lastT=performance.now();
  function update(now){
    const dt=Math.min((now-lastT)/1000,0.1);lastT=now;
    if(!started||gameOver)return;
    const W=cvs.width;

    lanes.forEach(lane=>{
      lane.objs.forEach(o=>{
        o.x+=o.spd*(60*dt);
        if(o.spd>0&&o.x>W+100)o.x=-120;
        if(o.spd<0&&o.x<-120)o.x=W+100;
      });
    });

    // Camera follows duck
    const targetCam=duck.drawY*TILE+cvs.height*0.65;
    camY+=(targetCam-camY)*Math.min(1,dt*8);

    // Collision check
    const dRow=-Math.round(duck.y);
    const lane=lanes[dRow];
    if(!lane)return;
    const dScreenX=cvs.width/2+duck.x*TILE;
    const dScreenY=camY+duck.drawY*TILE;

    if(lane.type==='road'){
      for(const v of lane.objs){
        const vScreenX=v.x;
        const vScreenY=camY-dRow*TILE;
        if(Math.abs(dScreenX-vScreenX)<TILE*0.75&&Math.abs(dScreenY-vScreenY)<TILE*0.6){
          triggerDeath('🚗 Squashed by traffic!');return;
        }
      }
    }

    if(lane.type==='water'){
      let onLog=false;
      for(const log of lane.objs){
        const logScreenX=log.x;
        const logScreenY=camY-dRow*TILE;
        if(dScreenX>log.x-log.w/2&&dScreenX<log.x+log.w/2&&Math.abs(dScreenY-logScreenY)<TILE*0.6){
          onLog=true;
          duck.x+=log.spd*(60*dt)/TILE;
          duck.x=Math.max(-5,Math.min(5,duck.x));
          break;
        }
      }
      if(!onLog&&!moving){triggerDeath('💧 Fell in the water!');return;}
    }

    // Fell off screen right/left
    if(Math.abs(dScreenX-W/2)>W/2+TILE)triggerDeath('🌊 Swept away!');
  }

  function triggerDeath(msg){
    if(gameOver)return;
    gameOver=true;
    if(score>best)best=score;
    const el=_leapEl.querySelector('#lp-best');
    if(el)el.textContent='Best: '+best;
    const ov=_leapEl.querySelector('#lp-over');
    ov.style.display='flex';
    ov.querySelector('#lp-over-score').textContent=msg+' Score: '+score;
  }

  // ── Draw ─────────────────────────────────────────────
  function draw(){
    const W=cvs.width,H=cvs.height;
    ctx.clearRect(0,0,W,H);

    lanes.forEach(lane=>{
      const screenY=camY-lane.row*TILE;
      if(screenY<-TILE||screenY>H+TILE)return;
      // Lane background
      let bg='#1a3a1a';
      if(lane.type==='road')bg='#2a2a2a';
      else if(lane.type==='water')bg='#0a3060';
      ctx.fillStyle=bg;
      ctx.fillRect(0,screenY-TILE/2,W,TILE);

      // Lane markings
      if(lane.type==='road'){
        ctx.strokeStyle='rgba(255,255,100,0.15)';ctx.lineWidth=1;ctx.setLineDash([12,14]);
        ctx.beginPath();ctx.moveTo(0,screenY);ctx.lineTo(W,screenY);ctx.stroke();
        ctx.setLineDash([]);
      }
      if(lane.type==='water'){
        // ripple lines
        ctx.strokeStyle='rgba(60,120,200,0.3)';ctx.lineWidth=1.5;
        for(let wx=0;wx<W;wx+=30){
          ctx.beginPath();ctx.arc(wx,screenY,8,0,Math.PI);ctx.stroke();
        }
      }

      // Objects
      lane.objs.forEach(o=>{
        if(o.x<-100||o.x>W+100)return;
        ctx.font=`${TILE*0.72}px serif`;
        ctx.textAlign='center';ctx.textBaseline='middle';
        if(lane.type==='water'){
          // Log rectangle
          ctx.fillStyle='#6b3a1f';
          ctx.beginPath();
          ctx.roundRect(o.x-o.w/2,screenY-TILE*0.3,o.w,TILE*0.6,6);
          ctx.fill();
          ctx.strokeStyle='#8b5a3f';ctx.lineWidth=1.5;ctx.stroke();
          ctx.font=`${TILE*0.45}px serif`;
          ctx.fillText('🪵',o.x,screenY);
        } else {
          ctx.fillText(o.e,o.x,screenY);
        }
      });
    });

    // Duck
    if(!gameOver||duck.dead){
      const dScreenX=W/2+duck.x*TILE;
      const dScreenY=camY+duck.drawY*TILE;
      ctx.font=`${TILE*0.78}px serif`;
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('🦆',dScreenX,dScreenY);
    }

    // Score
    ctx.fillStyle='rgba(0,0,0,0.35)';
    ctx.fillRect(0,0,W,0);
  }

  // ── Loop ─────────────────────────────────────────────
  function _leapLoop(now){
    if(!_leapEl||_leapEl.style.display==='none'){_leapRAF=null;return;}
    update(now);
    draw();
    _leapRAF=_raf(_leapLoop);
  }

  // ── Button wiring ─────────────────────────────────────
  _leapEl.querySelector('#lp-menu-btn').addEventListener('pointerdown',e=>{
    e.stopPropagation();window._exitLeap();
  });
  _leapEl.querySelector('#lp-start-btn').addEventListener('pointerdown',e=>{
    e.stopPropagation();startGame();
  });
  _leapEl.querySelector('#lp-over-restart').addEventListener('pointerdown',e=>{
    e.stopPropagation();
    initGame();
    _leapEl.querySelector('#lp-start').style.display='none';
    started=true;
  });
  _leapEl.querySelector('#lp-over-menu').addEventListener('pointerdown',e=>{
    e.stopPropagation();window._exitLeap();
  });

  // Also remove key listener on exit
  const origExit=window._exitLeap;
  window._exitLeap=function(){
    document.removeEventListener('keydown',onKey);
    window.removeEventListener('resize',_rh);
    origExit();
  };

  initGame();
  lastT=performance.now();
  _leapResume();
}
})();

(()=>{
// ═══════════════════════════════════════════════════════
// DUCK MINER — Dig down, find treasure
// ═══════════════════════════════════════════════════════
let _minerEl=null,_minerRAF=null,_minerInterval=null;
window._launchMiner=function(){
  window.paused=true;
  if(window._menuEl)window._menuEl.style.display='none';
  if(window._homeBtn)window._homeBtn.style.display='';
  window._minerActive=true;
  if(_minerEl){_minerEl.style.display='flex';_minerResume();return;}
  _buildMiner();
};
window._exitMiner=function(){
  window._minerActive=false;
  window.paused=false;
  _minerPause();
  if(_minerInterval){clearInterval(_minerInterval);_minerInterval=null;}
  if(_minerEl)_minerEl.style.display='none';
  if(window._menuEl)window._menuEl.style.display='flex';
  if(window._randomiseFeatured)window._randomiseFeatured();
  if(window._homeBtn)window._homeBtn.style.display='none';
};
function _minerPause(){if(_minerRAF){_caf(_minerRAF);_minerRAF=null;}}
function _minerResume(){if(!_minerRAF)_minerRAF=_raf(_minerLoop);}

// ── Tile definitions ─────────────────────────────────
const TILES={
  air:   {e:'',       col:'#1a1008', hard:0,  val:0,   label:'Air'},
  dirt:  {e:'🟫',    col:'#3d2010', hard:1,  val:0,   label:'Dirt'},
  stone: {e:'⬛',    col:'#444',    hard:2,  val:0,   label:'Stone'},
  coal:  {e:'⬛',    col:'#222',    hard:2,  val:3,   label:'Coal'},
  iron:  {e:'🟧',    col:'#8B4513', hard:3,  val:8,   label:'Iron'},
  gold:  {e:'🟨',    col:'#DAA520', hard:4,  val:20,  label:'Gold'},
  ruby:  {e:'🟥',    col:'#8B0000', hard:4,  val:35,  label:'Ruby'},
  diamond:{e:'🔷',   col:'#00BFFF', hard:5,  val:80,  label:'Diamond'},
  lava:  {e:'🟧',    col:'#FF4500', hard:0,  val:0,   label:'Lava',  hazard:true},
  rock:  {e:'⬜',    col:'#888',    hard:99, val:0,   label:'Bedrock'},
};

const DRILLS=[
  {id:'basic',  name:'Basic Drill',  power:1, cost:0,   e:'⛏️'},
  {id:'iron',   name:'Iron Drill',   power:2, cost:60,  e:'🔩'},
  {id:'gold',   name:'Gold Drill',   power:4, cost:200, e:'⭐'},
  {id:'diamond',name:'Diamond Drill',power:8, cost:600, e:'💎'},
];
const UPGRADES=[
  {id:'tank',   name:'Fuel Tank',    levels:[{cost:50,desc:'+50% fuel'},{cost:150,desc:'+100% fuel'},{cost:400,desc:'+200% fuel'}]},
  {id:'bag',    name:'Cargo Bag',    levels:[{cost:40,desc:'+10 slots'},{cost:120,desc:'+20 slots'},{cost:350,desc:'+40 slots'}]},
  {id:'engine', name:'Engine',       levels:[{cost:80,desc:'+25% speed'},{cost:240,desc:'+50% speed'},{cost:700,desc:'+100% speed'}]},
];

const WORLD_W=20, WORLD_H=80;

function _buildMiner(){
  _minerEl=_ce('div');
  _minerEl.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000085;display:flex;flex-direction:column;font-family:Nunito,sans-serif;background:#1a1008;overflow:hidden;';
  window._minerEl=_minerEl;

  _minerEl.innerHTML=`<style>
#mn *{box-sizing:border-box;}
#mn-hdr{background:#100c04;height:46px;display:flex;align-items:center;gap:4px;padding:0 8px;border-bottom:2px solid rgba(180,140,60,0.25);flex-shrink:0;overflow-x:auto;scrollbar-width:none;}
#mn-title{font-size:13px;font-weight:900;color:#c8a030;flex-shrink:0;}
.mn-stat{font-size:11px;font-weight:900;padding:3px 8px;border-radius:7px;border:1px solid rgba(180,140,60,0.2);background:rgba(180,140,60,0.07);color:rgba(220,180,100,0.9);flex-shrink:0;white-space:nowrap;}
.mn-stat.low{border-color:rgba(220,80,80,0.5);background:rgba(220,80,80,0.1);color:rgba(255,160,160,0.9);}
#mn-menu-btn{margin-left:auto;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.5);font-size:11px;font-weight:900;padding:5px 10px;border-radius:8px;cursor:pointer;font-family:Nunito,sans-serif;}
#mn-body{flex:1;position:relative;overflow:hidden;}
#mn-canvas{display:block;touch-action:none;}
/* surface overlay */
#mn-surface{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(5,20,5,0.97);z-index:15;padding:20px;}
#mn-surface.show{display:flex;}
#mn-surf-title{font-size:18px;font-weight:900;color:#80e090;}
.mn-surf-row{display:flex;align-items:center;gap:10px;width:100%;max-width:340px;background:rgba(80,180,60,0.07);border:1px solid rgba(80,180,60,0.2);border-radius:12px;padding:10px 14px;}
.mn-surf-e{font-size:22px;flex-shrink:0;}
.mn-surf-info{flex:1;}
.mn-surf-name{font-size:13px;font-weight:900;color:#a0e080;}
.mn-surf-desc{font-size:10px;color:rgba(160,220,120,0.55);}
.mn-surf-btn{padding:7px 14px;border-radius:9px;border:none;font-size:11px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;flex-shrink:0;}
.mn-surf-btn.buy{background:linear-gradient(135deg,#1a7030,#0f5020);color:#80e090;}
.mn-surf-btn.cant{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.25);cursor:default;}
.mn-surf-btn.sell{background:linear-gradient(135deg,#7a5010,#5a3a08);color:#f5d060;}
#mn-surf-dive{padding:12px 28px;border-radius:12px;border:none;background:linear-gradient(90deg,#1a7030,#0f5020);color:#80e090;font-size:14px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;margin-top:6px;}
#mn-surf-back{padding:9px 20px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);font-size:12px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);}
/* game over */
#mn-over{position:absolute;inset:0;background:rgba(0,0,0,0.92);display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:20;}
#mn-over.show{display:flex;}
#mn-over-title{font-size:24px;font-weight:900;color:#e06060;font-family:Nunito,sans-serif;}
#mn-over-sub{font-size:12px;color:rgba(255,255,255,0.4);text-align:center;}
#mn-over-restart{padding:11px 26px;border-radius:12px;border:1px solid rgba(180,140,60,0.4);background:rgba(180,140,60,0.12);color:#c8a030;font-size:13px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;}
#mn-over-menu{padding:9px 20px;border-radius:12px;border:1px solid rgba(255,255,255,0.12);font-size:12px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);}
/* tooltip */
#mn-tip{position:absolute;background:rgba(10,8,2,0.95);border:1px solid rgba(180,140,60,0.3);border-radius:8px;padding:5px 10px;font-size:11px;font-weight:900;color:#c8a030;pointer-events:none;z-index:10;display:none;white-space:nowrap;}
</style>
<div id="mn" style="display:flex;flex-direction:column;height:100%;">
<div id="mn-hdr">
  <div id="mn-title">⛏️ Duck Miner</div>
  <div class="mn-stat" id="mn-coins">💰 0</div>
  <div class="mn-stat" id="mn-fuel">⛽ 100%</div>
  <div class="mn-stat" id="mn-cargo">🎒 0/20</div>
  <div class="mn-stat" id="mn-depth">📏 0m</div>
  <button id="mn-menu-btn">🏠 Menu</button>
</div>
<div id="mn-body">
  <canvas id="mn-canvas"></canvas>
  <div id="mn-tip"></div>
  <div id="mn-surface">
    <div id="mn-surf-title">⛏️ Surface Shop</div>
    <div id="mn-surf-list"></div>
    <button id="mn-surf-dive">🕳️ Dive Back In</button>
    <button id="mn-surf-back">🏠 Main Menu</button>
  </div>
  <div id="mn-over">
    <div style="font-size:52px;">💀</div>
    <div id="mn-over-title">Duck is Dead!</div>
    <div id="mn-over-sub"></div>
    <button id="mn-over-restart">▶ Try Again</button>
    <button id="mn-over-menu">🏠 Menu</button>
  </div>
</div>
</div>`;

  document.body.appendChild(_minerEl);

  const cvs=_minerEl.querySelector('#mn-canvas');
  const ctx=cvs.getContext('2d');
  const bodyEl=_minerEl.querySelector('#mn-body');

  function resize(){cvs.width=bodyEl.clientWidth;cvs.height=bodyEl.clientHeight;}
  resize();
  const _rh=()=>resize();
  window.addEventListener('resize',_rh);
  window.addEventListener('orientationchange',()=>{setTimeout(_rh,150);});
  _minerEl._rh=_rh;

  // ── State ────────────────────────────────────────────
  let coins,fuel,maxFuel,cargo,maxCargo,drillPower,drillId,upgrades,world,
      duck,camY,gameOver,onSurface,moving,moveTimer,digAnim;

  function initGame(){
    coins=0;fuel=100;maxFuel=100;cargo=[];maxCargo=20;
    drillPower=1;drillId='basic';
    upgrades={tank:0,bag:0,engine:0};
    gameOver=false;onSurface=false;moving=false;moveTimer=0;digAnim=null;
    // Generate world
    world=[];
    for(let y=0;y<WORLD_H;y++){
      world[y]=[];
      for(let x=0;x<WORLD_W;x++){
        if(y===0){world[y][x]='air';}
        else{world[y][x]=genTile(y);}
      }
    }
    // Duck starts at surface centre
    duck={x:Math.floor(WORLD_W/2),y:0,facing:1};
    camY=0;
    _minerEl.querySelector('#mn-over').classList.remove('show');
    _minerEl.querySelector('#mn-surface').classList.remove('show');
    updateHUD();
  }

  function genTile(depth){
    const r=_mr();
    if(depth<5)return r<0.7?'dirt':'stone';
    if(depth<12)return r<0.05?'coal':r<0.55?'stone':'dirt';
    if(depth<20)return r<0.08?'iron':r<0.04?'coal':r<0.6?'stone':'dirt';
    if(depth<30)return r<0.06?'gold':r<0.1?'iron':r<0.04?'coal':'stone';
    if(depth<45)return r<0.05?'ruby':r<0.08?'gold':r<0.06?'iron':r<0.02?'lava':'stone';
    if(depth<60)return r<0.06?'diamond':r<0.06?'ruby':r<0.08?'gold':r<0.04?'lava':'stone';
    return r<0.08?'diamond':r<0.08?'ruby':r<0.04?'lava':r<0.02?'rock':'stone';
  }

  // ── Tile size ─────────────────────────────────────────
  function TS(){return Math.floor(cvs.width/WORLD_W);}

  // ── Input ─────────────────────────────────────────────
  let _lastTap=null;
  cvs.addEventListener('pointerdown',e=>{
    e.preventDefault();
    if(gameOver||onSurface)return;
    const ts=TS();
    const rect=cvs.getBoundingClientRect();
    const tx=_mf((e.clientX-rect.left)/ts);
    const ty=_mf((e.clientY-rect.top)/ts+camY/ts);
    // Adjacent to duck?
    const dx=tx-duck.x, dy=ty-duck.y;
    if(Math.abs(dx)+Math.abs(dy)===1){
      tryMove(dx,dy);
    }
  });

  function tryMove(dx,dy){
    if(moving)return;
    const nx=duck.x+dx,ny=duck.y+dy;
    if(nx<0||nx>=WORLD_W)return;
    if(ny<0){// Surface
      onSurface=true;
      showSurface();return;
    }
    if(ny>=WORLD_H)return;
    const tile=world[ny][nx];
    const tdef=TILES[tile];
    if(!tdef||tdef.hard===99)return; // bedrock
    if(dx!==0)duck.facing=dx>0?1:-1;

    if(tdef.hard===0){// air/lava
      if(tile==='lava'){triggerDeath('🌋 Burned by lava!');return;}
      duck.x=nx;duck.y=ny;
      consumeFuel(2);
    } else {
      // Dig
      if(drillPower<tdef.hard){showTip('Need a better drill!',e);return;}
      const digTime=Math.max(50,300-upgrades.engine*50)*(tdef.hard/drillPower);
      moving=true;
      digAnim={x:nx,y:ny,progress:0,total:digTime,start:performance.now()};
    }
    updateHUD();
  }

  function finishDig(nx,ny){
    const tile=world[ny][nx];
    const tdef=TILES[tile];
    world[ny][nx]='air';
    if(tdef.val>0){
      if(cargo.length<maxCargo){cargo.push({tile,val:tdef.val,label:tdef.label});}
      else showTip('Cargo full! Return to surface.',null);
    }
    consumeFuel(tdef.hard*3);
    duck.x=nx;duck.y=ny;
    moving=false;digAnim=null;
    // Auto surface if fuel critical
    if(fuel<=0)triggerDeath('⛽ Ran out of fuel!');
    updateHUD();
  }

  function consumeFuel(amt){
    fuel=Math.max(0,fuel-amt);
    if(fuel<=0&&!gameOver)triggerDeath('⛽ Ran out of fuel!');
  }

  function triggerDeath(msg){
    if(gameOver)return;
    gameOver=true;
    _minerEl.querySelector('#mn-over').classList.add('show');
    _minerEl.querySelector('#mn-over-sub').textContent=msg+' You earned: 💰'+coins;
  }

  // ── Surface shop ──────────────────────────────────────
  function showSurface(){
    // Auto-sell cargo
    let earned=0;
    cargo.forEach(c=>{earned+=c.val;});
    coins+=earned;
    cargo=[];
    // Refuel free
    fuel=maxFuel;
    onSurface=true;
    renderSurface();
    _minerEl.querySelector('#mn-surface').classList.add('show');
    updateHUD();
  }

  function renderSurface(){
    const list=_minerEl.querySelector('#mn-surf-list');
    list.innerHTML='';

    // Sold notification
    const soldEl=_ce('div');
    soldEl.style.cssText='font-size:12px;color:rgba(160,220,120,0.7);margin-bottom:4px;';
    soldEl.textContent='✅ Cargo sold! Fuel refilled.';
    list.appendChild(soldEl);

    // Drills
    const curDrillIdx=DRILLS.findIndex(d=>d.id===drillId);
    const nextDrill=DRILLS[curDrillIdx+1];
    if(nextDrill){
      const row=_ce('div');row.className='mn-surf-row';
      const canBuy=coins>=nextDrill.cost;
      row.innerHTML=`<div class="mn-surf-e">${nextDrill.e}</div><div class="mn-surf-info"><div class="mn-surf-name">${nextDrill.name}</div><div class="mn-surf-desc">Power ${nextDrill.power} · 💰${nextDrill.cost}</div></div>`;
      const btn=_ce('button');btn.className='mn-surf-btn '+(canBuy?'buy':'cant');
      btn.textContent=canBuy?'Buy':'💰'+nextDrill.cost;
      if(canBuy)btn.addEventListener('pointerdown',e=>{e.stopPropagation();coins-=nextDrill.cost;drillId=nextDrill.id;drillPower=nextDrill.power;renderSurface();updateHUD();});
      row.appendChild(btn);list.appendChild(row);
    }

    // Upgrades
    UPGRADES.forEach(upg=>{
      const lvl=upgrades[upg.id];
      if(lvl>=upg.levels.length)return;
      const ldef=upg.levels[lvl];
      const canBuy=coins>=ldef.cost;
      const row=_ce('div');row.className='mn-surf-row';
      row.innerHTML=`<div class="mn-surf-e">⬆️</div><div class="mn-surf-info"><div class="mn-surf-name">${upg.name} Lv${lvl+1}</div><div class="mn-surf-desc">${ldef.desc} · 💰${ldef.cost}</div></div>`;
      const btn=_ce('button');btn.className='mn-surf-btn '+(canBuy?'buy':'cant');
      btn.textContent=canBuy?'Buy':'💰'+ldef.cost;
      if(canBuy)btn.addEventListener('pointerdown',ev=>{
        ev.stopPropagation();coins-=ldef.cost;upgrades[upg.id]++;
        if(upg.id==='tank'){maxFuel=100*(1+upgrades.tank*0.5);fuel=maxFuel;}
        if(upg.id==='bag'){maxCargo=20+upgrades.bag*10;}// Corrected based on upg levels
        renderSurface();updateHUD();
      });
      row.appendChild(btn);list.appendChild(row);
    });
  }

  // ── Tooltip ───────────────────────────────────────────
  let tipTimer=null;
  function showTip(msg){
    const tip=_minerEl.querySelector('#mn-tip');
    if(!tip)return;
    tip.textContent=msg;
    tip.style.display='block';
    tip.style.left='50%';tip.style.top='60px';
    tip.style.transform='translateX(-50%)';
    clearTimeout(tipTimer);
    tipTimer=setTimeout(()=>{tip.style.display='none';},2000);
  }

  // ── HUD ───────────────────────────────────────────────
  function updateHUD(){
    const f=_mf(fuel/maxFuel*100);
    const fEl=_minerEl.querySelector('#mn-fuel');
    if(fEl){fEl.textContent='⛽ '+f+'%';fEl.className='mn-stat'+(f<25?' low':'');}
    const cEl=_minerEl.querySelector('#mn-coins');
    if(cEl)cEl.textContent='💰 '+coins;
    const bgEl=_minerEl.querySelector('#mn-cargo');
    if(bgEl)bgEl.textContent='🎒 '+cargo.length+'/'+maxCargo;
    const dEl=_minerEl.querySelector('#mn-depth');
    if(dEl)dEl.textContent='📏 '+duck.y+'m';
  }

  // ── Draw ──────────────────────────────────────────────
  function draw(now){
    const W=cvs.width,H=cvs.height;
    const ts=TS();
    ctx.clearRect(0,0,W,H);

    // Camera: keep duck in view
    const targetCam=duck.y*ts-H*0.45;
    camY+=(targetCam-camY)*0.12;
    camY=Math.max(0,camY);

    // Draw tiles
    const startRow=Math.max(0,_mf(camY/ts)-1);
    const endRow=Math.min(WORLD_H,startRow+_mc(H/ts)+2);
    for(let y=startRow;y<endRow;y++){
      for(let x=0;x<WORLD_W;x++){
        const tile=world[y][x];
        const tdef=TILES[tile];
        const sx=x*ts, sy=y*ts-camY;
        ctx.fillStyle=tdef.col;
        ctx.fillRect(sx,sy,ts,ts);
        // Ore shine
        if(tdef.val>0){
          ctx.fillStyle='rgba(255,255,255,0.08)';
          ctx.fillRect(sx+2,sy+2,ts*0.4,ts*0.25);
        }
        // Lava glow
        if(tile==='lava'){
          const glow=0.4+0.3*Math.sin(now/300+x+y);
          ctx.fillStyle=`rgba(255,100,0,${glow})`;
          ctx.fillRect(sx,sy,ts,ts);
        }
        // Label for ores
        if(tdef.val>0||tile==='lava'){
          ctx.font=`${ts*0.45}px serif`;
          ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText(tdef.e,sx+ts/2,sy+ts/2);
        }
        // Grid lines
        ctx.strokeStyle='rgba(0,0,0,0.2)';ctx.lineWidth=0.5;
        ctx.strokeRect(sx,sy,ts,ts);
      }
    }

    // Surface grass line
    const surfY=0*ts-camY;
    if(surfY>-ts&&surfY<H){
      ctx.fillStyle='#2d8020';
      ctx.fillRect(0,surfY,W,4);
    }

    // Dig animation
    if(digAnim&&!gameOver){
      const prog=Math.min((now-digAnim.start)/digAnim.total,1);
      if(prog>=1){finishDig(digAnim.x,digAnim.y);}
      else{
        const sx=digAnim.x*ts,sy=digAnim.y*ts-camY;
        ctx.fillStyle=`rgba(255,200,50,${0.3+prog*0.4})`;
        ctx.fillRect(sx,sy,ts*prog,ts);
        ctx.fillStyle='rgba(255,255,255,0.5)';
        ctx.fillRect(sx,sy+ts/2-2,ts*prog,4);
      }
    }

    // Duck
    if(!gameOver){
      if(window._gpSetMinerDuck)window._gpSetMinerDuck(duck.x,duck.y,ts);
      const ds=duck.x*ts, dy=duck.y*ts-camY;
      ctx.save();
      ctx.font=`${ts*0.78}px serif`;
      ctx.textAlign='center';ctx.textBaseline='middle';
      if(duck.facing<0){ctx.translate(ds+ts/2,dy+ts/2);ctx.scale(-1,1);ctx.fillText('🦆',0,0);}
      else{ctx.fillText('🦆',ds+ts/2,dy+ts/2);}
      ctx.restore();
    }

    // Adjacent tile highlight
    if(!moving&&!gameOver&&!onSurface){
      // Show clickable tiles
      [[0,-1],[0,1],[-1,0],[1,0]].forEach(([dx,dy])=>{
        const nx=duck.x+dx,ny=duck.y+dy;
        if(nx<0||nx>=WORLD_W||ny<0||ny>=WORLD_H)return;
        const tile=world[ny]?.[nx];
        if(!tile||tile==='air')return;
        const sx=nx*ts,sy=ny*ts-camY;
        ctx.fillStyle='rgba(255,255,255,0.06)';
        ctx.strokeStyle='rgba(255,255,200,0.3)';ctx.lineWidth=1.5;
        ctx.fillRect(sx,sy,ts,ts);
        ctx.strokeRect(sx+1,sy+1,ts-2,ts-2);
      });
    }

    // Depth ruler on right edge
    ctx.fillStyle='rgba(180,140,60,0.15)';
    ctx.fillRect(W-18,0,18,H);
    for(let d=0;d<WORLD_H;d+=10){
      const sy=d*ts-camY;
      if(sy<0||sy>H)continue;
      ctx.fillStyle='rgba(180,140,60,0.6)';
      ctx.font='8px Nunito,sans-serif';
      ctx.textAlign='right';ctx.textBaseline='top';
      ctx.fillText(d+'m',W-2,sy+2);
    }
  }

  // ── Loop ─────────────────────────────────────────────
  function _minerLoop(now){
    if(!_minerEl||_minerEl.style.display==='none'){_minerRAF=null;return;}
    if(!gameOver&&!onSurface)draw(now);
    else if(!gameOver)draw(now);
    else draw(now);
    _minerRAF=_raf(_minerLoop);
  }

  // ── Wiring ────────────────────────────────────────────
  _minerEl.querySelector('#mn-menu-btn').addEventListener('pointerdown',e=>{
    e.stopPropagation();window._exitMiner();
    window.removeEventListener('resize',_rh);
  });
  _minerEl.querySelector('#mn-surf-dive').addEventListener('pointerdown',e=>{
    e.stopPropagation();
    onSurface=false;
    _minerEl.querySelector('#mn-surface').classList.remove('show');
    updateHUD();
  });
  _minerEl.querySelector('#mn-surf-back').addEventListener('pointerdown',e=>{
    e.stopPropagation();window._exitMiner();
    window.removeEventListener('resize',_rh);
  });
  _minerEl.querySelector('#mn-over-restart').addEventListener('pointerdown',e=>{
    e.stopPropagation();initGame();
  });
  _minerEl.querySelector('#mn-over-menu').addEventListener('pointerdown',e=>{
    e.stopPropagation();window._exitMiner();
    window.removeEventListener('resize',_rh);
  });

  initGame();
  _minerResume();
}
})();


// ── QoL: Seasonal theme, duck facts, recently played, search, transitions ─
(function(){

const month=new Date().getMonth();
const seasons={
  9:{emoji:'🎃',label:'Halloween',bg:'linear-gradient(180deg,#0a0005 0%,#1a0a20 100%)',accent:'rgba(220,80,0,0.3)'},
  10:{emoji:'🎄',label:'Christmas',bg:'linear-gradient(180deg,#001a08 0%,#0a1a10 100%)',accent:'rgba(200,30,30,0.3)'},
  11:{emoji:'🎄',label:'Christmas',bg:'linear-gradient(180deg,#001a08 0%,#0a1a10 100%)',accent:'rgba(200,30,30,0.3)'},
  3:{emoji:'🥚',label:'Easter',bg:'linear-gradient(180deg,#0a1a08 0%,#101a14 100%)',accent:'rgba(120,220,80,0.3)'},
  5:{emoji:'☀️',label:'Summer',bg:'linear-gradient(180deg,#1a1000 0%,#0a1420 100%)',accent:'rgba(255,180,0,0.3)'},
  6:{emoji:'☀️',label:'Summer',bg:'linear-gradient(180deg,#1a1000 0%,#0a1420 100%)',accent:'rgba(255,180,0,0.3)'},
  7:{emoji:'☀️',label:'Summer',bg:'linear-gradient(180deg,#1a1000 0%,#0a1420 100%)',accent:'rgba(255,180,0,0.3)'},
};
const season=seasons[month];
if(season&&window._menuEl){
  window._menuEl.style.background=season.bg;
  const hdr=document.getElementById('ck-menu-header');
  if(hdr)hdr.style.borderBottom='1px solid '+season.accent;
}

const FACTS=[
  '🦆 Ducks have waterproof feathers thanks to an oil gland near their tail.',
  '🦆 A group of ducks is called a raft, team, or paddling.',
  '🦆 Ducks can see nearly 340° around them.',
  '🦆 Baby ducks can swim within hours of hatching.',
  '🦆 Male ducks are called drakes. Females are just called ducks.',
  '🦆 Only female mallards quack. Males make a raspy sound.',
  '🦆 Duck feet have no nerves so they cannot feel the cold.',
  '🦆 Ducks sleep with one eye open to watch for predators.',
  '🦆 The oldest known wild duck lived to 27 years old.',
  '🦆 Ducks can fly at up to 50mph.',
  '🦆 Some ducks can dive 60 feet underwater.',
  '🦆 Ducks bond for a breeding season, then find a new partner.',
];
let _factEl=null;
function showFact(){
  if(_factEl)_factEl.remove();
  const body=document.getElementById('ck-menu-body');
  if(!body)return;
  _factEl=document.createElement('div');
  _factEl.style.cssText='background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:10px 14px;margin-bottom:16px;font-size:11px;color:rgba(255,255,255,0.4);line-height:1.6;font-weight:700;font-family:Nunito,sans-serif;cursor:pointer;';
  _factEl.textContent=FACTS[Math.floor(Math.random()*FACTS.length)];
  _factEl.title='Tap for another fact';
  _factEl.addEventListener('pointerdown',showFact);
  const fl=body.querySelector('.ck-section-label');
  if(fl)body.insertBefore(_factEl,fl);else body.prepend(_factEl);
}
showFact();
setInterval(()=>{if(window._menuEl&&window._menuEl.style.display!=='none')showFact();},30000);

const _recentlyPlayed=[];
const GAME_NAMES={
  _launchSandbox:'Duck Sandbox',_launchClicker:'Duck Clicker',_launchKingdom:'Duck Kingdom',
  _launchRoyale:'Duck Royale',_launchDash:'Duck Dash',_launchMiner:'Duck Miner',
  _launchLeap:'Duck Leap',_launchDive:'Duck Dive',_launchFishing:'Duck Fishing',
  _launchDungeon:'Duck Dungeons',_launchCooking:'Duck Cooking',_launchDefence:'Duck Defence',
  _launchEvolution:'Duck Evolution',_launchDating:'Duck Dating',_launchBeacon:'Duck Beacon',
  _launchCards:'Duck Cards',_launchLab:'Duck Lab',_launchDisguise:'Duck Disguise',
  _launchSpell:'Duck Spell',_launchShop:'Duck Shop',_launchRaiseDuck:'Raise a Duck',
  _launchMarket:'Market',_launchMiner:'Duck Miner',_launchLeap:'Duck Leap',
};
let _recentEl=null;
function updateRecentlyPlayed(){
  if(_recentEl)_recentEl.remove();
  if(!_recentlyPlayed.length)return;
  const body=document.getElementById('ck-menu-body');
  if(!body)return;
  _recentEl=document.createElement('div');
  _recentEl.style.cssText='margin-bottom:16px;';
  const lbl=document.createElement('div');
  lbl.className='ck-section-label';
  lbl.textContent='🕐 Recently Played';
  lbl.style.marginBottom='8px';
  _recentEl.appendChild(lbl);
  const row=document.createElement('div');
  row.style.cssText='display:flex;gap:8px;flex-wrap:wrap;';
  _recentlyPlayed.forEach(name=>{
    const chip=document.createElement('div');
    chip.style.cssText='background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:5px 12px;font-size:11px;font-weight:900;color:rgba(255,255,255,0.6);cursor:pointer;font-family:Nunito,sans-serif;transition:background .12s;';
    chip.textContent=name;
    chip.addEventListener('pointerdown',()=>{
      const fn=Object.entries(GAME_NAMES).find(([k,v])=>v===name)?.[0];
      if(fn&&window[fn])window[fn]();
    });
    row.appendChild(chip);
  });
  _recentEl.appendChild(row);
  body.prepend(_recentEl);
}

window._gameTransition=function(fn){
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:#0a0b18;z-index:9999999;opacity:0;pointer-events:none;transition:opacity .15s ease;';
  document.body.appendChild(ov);
  requestAnimationFrame(()=>{
    ov.style.opacity='1';
    setTimeout(()=>{fn();setTimeout(()=>{ov.style.opacity='0';setTimeout(()=>ov.remove(),180);},60);},150);
  });
};

Object.entries(GAME_NAMES).forEach(([fn,name])=>{
  window[fn+'_qolWrap']=name; // mark for lazy wrapping
});
// Lazy-wrap: intercept via Proxy-style override after all IIFEs run
window._qolWrapAll=function(){
  Object.entries(GAME_NAMES).forEach(([fn,name])=>{
    const orig=window[fn];
    if(!orig||orig._qolWrapped)return;
    const wrapped=function(){
      const idx=_recentlyPlayed.indexOf(name);
      if(idx>-1)_recentlyPlayed.splice(idx,1);
      _recentlyPlayed.unshift(name);
      if(_recentlyPlayed.length>3)_recentlyPlayed.pop();
      updateRecentlyPlayed();
      window._gameTransition(()=>orig.apply(this,arguments));
    };
    wrapped._qolWrapped=true;
    window[fn]=wrapped;
  });
};

const hdr=document.getElementById('ck-menu-header');
if(hdr){
  const sw=document.createElement('div');
  sw.style.cssText='margin-left:auto;';
  const si=document.createElement('input');
  si.type='text';si.placeholder='🔍 Search...';si.id='ck-search';
  si.style.cssText='background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:5px 12px;font-size:11px;font-weight:900;color:#fff;font-family:Nunito,sans-serif;outline:none;width:110px;transition:width .2s,border-color .2s;-webkit-user-select:text;user-select:text;touch-action:auto;';
  si.addEventListener('focus',()=>{si.style.width='160px';si.style.borderColor='rgba(100,160,255,0.4)';});
  si.addEventListener('blur',()=>{if(!si.value){si.style.width='110px';si.style.borderColor='rgba(255,255,255,0.1)';}});
  si.addEventListener('input',()=>{
    const q=si.value.toLowerCase().trim();
    document.querySelectorAll('.ck-card').forEach(card=>{
      const t=card.querySelector('.ck-card-title');
      card.style.display=(!q||!t||t.textContent.toLowerCase().includes(q))?'':'none';
    });
  });
  sw.appendChild(si);hdr.appendChild(sw);
}

})();

(()=>{
let _clickerEl = null;
let _clickerInterval = null;
let _state = null;
function _freshState(){ return {bucks:0,clickPower:1,passivePerSec:0,totalClicks:0,totalEarned:0,prestigeLevel:0,prestigeMult:1,tempClickMult:1,tempClickEnd:0,tempPassiveMult:1,tempPassiveEnd:0,buckAccum:0,prestigeTokens:0,pShop:{autoBuy:0,clickBoost:0,passiveBoost:0,startBonus:0,goldenDuck:0},buildings:[
{id:'pond', emoji:'🏊',name:'Pond', desc:'Ducks splash lazily.', baseCost:10, baseIncome:1, incomeType:'passive',owned:0,type:'Building'},
{id:'wolf', emoji:'🐺',name:'Wolf', desc:'Wolves hunt for Bucks.', baseCost:300, baseIncome:5, incomeType:'passive',owned:0,type:'Building'},
{id:'lion', emoji:'🦁',name:'Lion', desc:'Lions demand tribute.', baseCost:1500, baseIncome:20, incomeType:'passive',owned:0,type:'Building'},
{id:'marsh', emoji:'🌿',name:'Overgrowth', desc:'The pond overflows.', baseCost:8000, baseIncome:75, incomeType:'passive',owned:0,type:'Building'},
{id:'dragon', emoji:'🐉',name:'Dragon', desc:'Commands entire duck armies.', baseCost:40000, baseIncome:250, incomeType:'passive',owned:0,type:'Building'},
{id:'yeti', emoji:'🧊',name:'Yeti', desc:'Freezes time, traps Bucks.', baseCost:150000, baseIncome:800, incomeType:'passive',owned:0,type:'Building'},
{id:'alien', emoji:'👽',name:'UFO', desc:'Abducts Bucks from other ponds.', baseCost:500000, baseIncome:2500, incomeType:'passive',owned:0,type:'Building'},
{id:'mega', emoji:'🌊',name:'Mega Pond', desc:'A pond the size of a sea.', baseCost:2000000,baseIncome:8000, incomeType:'passive',owned:0,type:'Building'},
{id:'quack', emoji:'✨',name:'Quack Singularity',desc:'The universe ducks.', baseCost:10000000,baseIncome:30000,incomeType:'passive',owned:0,type:'Building'},
{id:'beak', emoji:'👊',name:'Stronger Beak', desc:'Your clicks hit harder.', baseCost:50, baseIncome:2, incomeType:'click', owned:0,type:'Upgrade'},
{id:'fox', emoji:'🦊',name:'Fox Instinct', desc:'Foxes teach you to strike fast.', baseCost:200, baseIncome:5, incomeType:'click', owned:0,type:'Upgrade'},
{id:'talon', emoji:'🦅',name:'Eagle Talons', desc:'Razor-sharp precision.', baseCost:800, baseIncome:12, incomeType:'click', owned:0,type:'Upgrade'},
{id:'fury', emoji:'😡',name:'Duck Fury', desc:'Pure rage. Pure power.', baseCost:4000, baseIncome:30, incomeType:'click', owned:0,type:'Upgrade'},
{id:'storm', emoji:'⚡',name:'Storm Strike', desc:'Channel the thunderstorm.', baseCost:20000, baseIncome:80, incomeType:'click', owned:0,type:'Upgrade'},
{id:'claw', emoji:'🐻',name:'Bear Claw', desc:'Devastating swipe.', baseCost:100000, baseIncome:200, incomeType:'click', owned:0,type:'Upgrade'},
]}; }
window._launchClicker = function(){
window.paused = true;
window._menuEl.style.display = 'none';
if(window._homeBtn) window._homeBtn.style.display = '';
window._clickerActive = true;
if(!_state) _state = _freshState();
if(_clickerEl){ _clickerEl.remove(); _clickerEl = null; window._clickerEl = null; }
if(_clickerInterval){ clearInterval(_clickerInterval); _clickerInterval = null; }
_buildClicker();
};
window._exitClicker = function(){
window._clickerActive = false;
window.paused = false;
const ge = document.querySelector('[data-golden-egg]');
if(ge) ge.remove();
if(_clickerInterval){ clearInterval(_clickerInterval); _clickerInterval = null; }
if(_clickerEl){ _clickerEl.remove(); _clickerEl = null; window._clickerEl = null; }
if(window._menuEl)window._menuEl.style.display = 'flex'; if(window._randomiseFeatured)window._randomiseFeatured();
if(window._homeBtn) window._homeBtn.style.display = 'none';
};
function _buildClicker(){
let {bucks,clickPower,passivePerSec,totalClicks,totalEarned,prestigeLevel,prestigeMult,buckAccum} = _state;
let prestigeTokens = _state.prestigeTokens||0;
let pShop = _state.pShop||{autoBuy:0,clickBoost:0,passiveBoost:0,startBonus:0,goldenDuck:0};
let _tempClickMult = _state.tempClickMult, _tempClickEnd = _state.tempClickEnd;
let _tempPassiveMult = _state.tempPassiveMult, _tempPassiveEnd = _state.tempPassiveEnd;
const BUILDINGS = _state.buildings;
function _saveState(){ Object.assign(_state,{bucks,clickPower,passivePerSec,totalClicks,totalEarned,prestigeLevel,prestigeMult,buckAccum,prestigeTokens,pShop,tempClickMult:_tempClickMult,tempClickEnd:_tempClickEnd,tempPassiveMult:_tempPassiveMult,tempPassiveEnd:_tempPassiveEnd}); }
const PRESTIGE_MULTS = [1, 1.5, 2, 4];
const PRESTIGE_DUCKS = ['🦆','🦢','🦊','🐍','🐺','🐻','🦁','🐉','🧊','👽','✨'];
function prestigeDuck(){ return PRESTIGE_DUCKS[_mn(prestigeLevel, PRESTIGE_DUCKS.length-1)]; }
function prestigeCost(){ return 10000 * Math.pow(2, prestigeLevel); }
function nextMult(){ return prestigeLevel < 3 ? PRESTIGE_MULTS[prestigeLevel+1] : prestigeMult * 2; }
function cost(b){ return _mf(b.baseCost * Math.pow(1.15, b.owned)); }
function fmt(n){
if(n>=1e9) return (n/1e9).toFixed(1)+'B';
if(n>=1e6) return (n/1e6).toFixed(1)+'M';
if(n>=1e3) return (n/1e3).toFixed(1)+'K';
return _mf(n).toString();
}
function applyShopBonuses(){
 // Auto-buy: add 1 passive per sec per level
 // Click boost: +0.5 click power per level
 // Passive boost: +15% passive per level
 // Start bonus: starts with bucks multiplier
 // Applied in recalc
}
function recalc(){
passivePerSec = 0; clickPower = 1;
BUILDINGS.forEach(b=>{
if(b.incomeType==='passive') passivePerSec += b.baseIncome * b.owned;
if(b.incomeType==='click') clickPower += b.baseIncome * b.owned;
});
// pShop bonuses
clickPower += (pShop.clickBoost||0)*1;
passivePerSec += (pShop.autoBuy||0)*0.5;
passivePerSec *= 1 + (pShop.passiveBoost||0)*0.2;
passivePerSec *= prestigeMult;
clickPower *= prestigeMult;
passivePerSec = _mf(passivePerSec * prestigeMult);
clickPower = _mf(clickPower * prestigeMult);
}
function buy(id){
const b = BUILDINGS.find(x=>x.id===id);
const c = cost(b);
if(bucks < c) return;
bucks -= c; b.owned++; recalc(); _saveState(); render();
if(window._challengeEvent) window._challengeEvent('clicker_buy');
}
function doPrestige(){
const pc = prestigeCost();
if(bucks < pc) return;
prestigeLevel++;prestigeTokens++;
prestigeMult = prestigeLevel < 4 ? PRESTIGE_MULTS[prestigeLevel] : prestigeMult * 2;
if(window._challengeEvent) window._challengeEvent('clicker_prestige');
bucks = (pShop.startBonus||0)*500; totalEarned = 0; totalClicks = 0;
BUILDINGS.forEach(b=>b.owned = 0);
recalc(); _saveState();
duckEl.textContent = prestigeDuck();
const flash = _ce('div');
flash.style.cssText = 'position:fixed;inset:0;background:rgba(255,215,0,0.35);z-index:1000095;pointer-events:none;transition:opacity .6s;';
_ba(flash);
setTimeout(()=>{flash.style.opacity='0';setTimeout(()=>flash.remove(),650);},80);
showPrestigeToast();
render();
}
function showPrestigeToast(){
const t = _ce('div');
t.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);background:linear-gradient(90deg,#b8860b,#ffd700,#b8860b);color:#1a1000;font-size:15px;font-weight:900;padding:12px 24px;border-radius:20px;z-index:1000096;pointer-events:none;white-space:nowrap;font-family:Nunito,sans-serif;box-shadow:0 4px 20px rgba(255,215,0,0.5);';
t.textContent = `✨ Prestige ${prestigeLevel}! ${prestigeMult}× multiplier active!`;
_ba(t);
setTimeout(()=>{t.style.transition='opacity .5s';t.style.opacity='0';setTimeout(()=>t.remove(),550);},2500);
}
_clickerEl = _ce('div');
_clickerEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000085;background:#1a1c2e;display:flex;flex-direction:column;font-family:Nunito,sans-serif;overflow:hidden;';
_clickerEl.innerHTML = `
<style>
#dck *{box-sizing:border-box;}
#dck-header{background:#14162a;height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 10px;gap:6px;border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0;overflow-x:auto;scrollbar-width:none;}
#dck-header-left{display:flex;flex-direction:column;}
#dck-bucks{font-size:20px;font-weight:900;color:#f5e642;line-height:1.1;}
#dck-bps{font-size:10px;color:rgba(255,255,255,0.4);font-weight:700;}
#dck-back{background:rgba(255,255,255,0.08);border:none;color:rgba(255,255,255,0.6);font-size:12px;font-weight:900;padding:7px 14px;border-radius:10px;cursor:pointer;font-family:Nunito,sans-serif;}
#dck-back:hover{background:rgba(255,255,255,0.15);color:#fff;}
#dck-body{flex:1;display:flex;overflow:hidden;}
#dck-left{flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;padding:16px;position:relative;}
#dck-duck{font-size:96px;cursor:pointer;user-select:none;transition:transform .08s ease;filter:drop-shadow(0 0 24px rgba(245,230,66,0.3));line-height:1;touch-action:none;}
#dck-cps{font-size:12px;color:rgba(255,255,255,0.35);font-weight:700;text-align:center;}
#dck-prestige-btn{padding:8px 18px;border-radius:12px;border:none;font-size:12px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;background:linear-gradient(90deg,#b8860b,#ffd700);color:#1a1000;transition:opacity .15s,transform .15s;}
#dck-prestige-btn:hover{transform:scale(1.05);}
#dck-prestige-btn.locked{background:#252840;color:rgba(255,255,255,0.25);cursor:default;transform:none;}
#dck-prestige-info{font-size:10px;color:rgba(255,255,255,0.25);font-weight:700;text-align:center;}
#dck-boost-bar{font-size:10px;font-weight:900;color:#ffd700;text-align:center;min-height:14px;}
#dck-right{width:240px;background:#14162a;border-left:1px solid rgba(255,255,255,0.07);overflow-y:auto;padding:12px;scrollbar-width:none;flex-shrink:0;}
#dck-right::-webkit-scrollbar{display:none;}
.dck-shop-title{font-size:11px;font-weight:900;color:rgba(255,255,255,0.3);letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px;}
.dck-item{background:#1e2040;border-radius:12px;padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;gap:10px;cursor:pointer;transition:background .12s,opacity .12s;border:1.5px solid transparent;}
.dck-item:hover{background:#252846;}
.dck-item.affordable{border-color:rgba(245,230,66,0.3);}
.dck-item.unaffordable{opacity:0.5;cursor:default;}
.dck-item-emoji{font-size:26px;flex-shrink:0;}
.dck-item-info{flex:1;min-width:0;}
.dck-item-name{font-size:13px;font-weight:900;color:#fff;}
.dck-item-desc{font-size:10px;color:rgba(255,255,255,0.4);margin-top:1px;}
.dck-item-cost{font-size:11px;font-weight:900;color:#f5e642;margin-top:3px;}
.dck-item-owned{font-size:18px;font-weight:900;color:rgba(255,255,255,0.25);flex-shrink:0;}
</style>
<div id="dck" style="display:flex;flex-direction:column;height:100%;">
<div id="dck-header">
<div id="dck-header-left">
<div id="dck-bucks">🦆 0 Duck Bucks</div>
<div id="dck-bps">0/sec · 1/click</div>
</div>
<button id="dck-back" onclick="window._exitClicker()">🏠 Menu</button>
</div>
<div id="dck-body">
<div id="dck-left">
<div id="dck-boost-bar"></div>
<div id="dck-duck">🦆</div>
<div id="dck-cps">Click the duck!</div>
<button id="dck-prestige-btn" class="locked">⭐ Prestige</button>
<div id="dck-prestige-info">Reach 🦆 10K to prestige</div>
</div>
<div id="dck-right">
<div class="dck-shop-title">🛒 Shop</div>
<div id="dck-shop"></div>
<div class="dck-shop-title" style="margin-top:12px;">⭐ Prestige Shop</div>
<div id="dck-pshop" style="font-size:11px;color:rgba(255,255,255,0.35);padding:4px 0;">Prestige to earn tokens</div>
</div>
</div>
</div>`;
_ba(_clickerEl);
window._clickerEl = _clickerEl;
(function(){
const backBtn = _clickerEl.querySelector('#dck-back');
function doExit(e){ e.stopPropagation(); e.preventDefault(); if(window._exitClicker) window._exitClicker(); }
backBtn.addEventListener('pointerdown', doExit, {capture:true});
backBtn.addEventListener('touchstart', doExit, {capture:true, passive:false});
backBtn.addEventListener('click', doExit, {capture:true});
})();
_clickerEl.addEventListener('click', e=>{ e.stopPropagation(); });
_clickerEl.addEventListener('touchend', e=>{ e.stopPropagation(); });
const buckEl = _clickerEl.querySelector('#dck-bucks');
const bpsEl = _clickerEl.querySelector('#dck-bps');
const cpsEl = _clickerEl.querySelector('#dck-cps');
const duckEl = _clickerEl.querySelector('#dck-duck');
const shopEl = _clickerEl.querySelector('#dck-shop');
const prestigeBtn = _clickerEl.querySelector('#dck-prestige-btn');
const prestigeInfo= _clickerEl.querySelector('#dck-prestige-info');
const boostBar = _clickerEl.querySelector('#dck-boost-bar');
duckEl.textContent = prestigeDuck();
buildPrestigeShop();
prestigeBtn.addEventListener('pointerdown', e=>{ e.stopPropagation(); doPrestige(); });
function spawnFloater(x, y, amount, col){
const f = _ce('div');
f.textContent = '+' + fmt(amount);
f.style.cssText = `position:fixed;left:${x}px;top:${y}px;font-size:16px;font-weight:900;color:${col||'#f5e642'};z-index:1000092;pointer-events:none;font-family:Nunito,sans-serif;text-shadow:0 0 8px rgba(245,230,66,0.8);transform:translate(-50%,-50%);transition:transform .7s ease-out,opacity .7s ease-out;`;
_ba(f);
_raf(()=>{ f.style.transform='translate(-50%,-180%)'; f.style.opacity='0'; });
setTimeout(()=>f.remove(), 720);
}
function doClick(x, y){
const now = Date.now();
const cm = (now < _tempClickEnd) ? _tempClickMult : 1;
const earned = _mf(clickPower * cm);
bucks += earned; totalClicks++; totalEarned += earned;
_saveState();
if(window._challengeEvent) window._challengeEvent('clicker_earn', earned);
spawnFloater(x, y, earned, cm>1?'#ff9f43':'#f5e642');
duckEl.style.transform = 'scale(0.88)';
setTimeout(()=>{ duckEl.style.transform = ''; }, 100);
render();
}
duckEl.addEventListener('pointerdown', e=>{
e.preventDefault();
e.stopPropagation();
e.stopImmediatePropagation();
doClick(e.clientX, e.clientY);
});
const GOLDEN_EFFECTS = [
{ label:'2× click power for 30s!', apply(){_tempClickMult=2;_tempClickEnd=Date.now()+30000;} },
{ label:'5× click power for 15s!', apply(){_tempClickMult=5;_tempClickEnd=Date.now()+15000;} },
{ label:'+100/sec for 20s!', apply(){_tempPassiveMult=100;_tempPassiveEnd=Date.now()+20000;} },
{ label:'+500/sec for 10s!', apply(){_tempPassiveMult=500;_tempPassiveEnd=Date.now()+10000;} },
{ label:'Free 500 Duck Bucks!', apply(){bucks+=500;totalEarned+=500;} },
{ label:'Free 2000 Duck Bucks!', apply(){bucks+=2000;totalEarned+=2000;} },
{ label:'All buildings ×2 for 20s!',apply(){_tempPassiveMult=2;_tempPassiveEnd=Date.now()+20000;_tempClickMult=2;_tempClickEnd=Date.now()+20000;} },
];
let _goldenEggEl = null;
let _goldenEggTimeout = null;
function spawnGoldenEgg(){
if(_goldenEggEl) return;
const leftArea = _clickerEl.querySelector('#dck-left');
const rect = leftArea.getBoundingClientRect();
const x = rect.left + 30 + _mr() * (rect.width - 60);
const y = rect.top + 60 + _mr() * (rect.height - 120);
_goldenEggEl = _ce('div');
_goldenEggEl.textContent = '🥚';
_goldenEggEl.style.cssText = `position:fixed;left:${x}px;top:${y}px;font-size:38px;z-index:1000093;cursor:pointer;filter:sepia(1) saturate(4) hue-rotate(20deg) brightness(1.4) drop-shadow(0 0 12px gold) drop-shadow(0 0 24px orange);animation:goldenBob 1s ease-in-out infinite;user-select:none;touch-action:none;`;
if(!_gi('dck-golden-style')){
const st = _ce('style');
st.id = 'dck-golden-style';
st.textContent = '@keyframes goldenBob{0%,100%{transform:translateY(0) rotate(-5deg) scale(1)}50%{transform:translateY(-10px) rotate(5deg) scale(1.08)}}';
document.head.appendChild(st);
}
_goldenEggEl.setAttribute('data-golden-egg','1');
_ba(_goldenEggEl);
const despawn = setTimeout(()=>{ if(_goldenEggEl){_goldenEggEl.remove();_goldenEggEl=null;} }, 8000);
_goldenEggEl.addEventListener('pointerdown', e=>{
e.stopPropagation();
e.stopImmediatePropagation();
clearTimeout(despawn);
if(!_goldenEggEl) return;
_goldenEggEl.remove(); _goldenEggEl = null;
const effect = GOLDEN_EFFECTS[_mf(_mr() * GOLDEN_EFFECTS.length)];
effect.apply();
_saveState();
const t = _ce('div');
t.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);background:linear-gradient(90deg,#b8860b,#ffd700,#b8860b);color:#1a1000;font-size:14px;font-weight:900;padding:10px 20px;border-radius:18px;z-index:1000096;pointer-events:none;white-space:nowrap;font-family:Nunito,sans-serif;box-shadow:0 4px 20px rgba(255,215,0,0.5);';
t.textContent = '🥚 Golden Egg! ' + effect.label;
_ba(t);
setTimeout(()=>{t.style.transition='opacity .5s';t.style.opacity='0';setTimeout(()=>t.remove(),550);},2500);
render();
});
_goldenEggTimeout = setTimeout(spawnGoldenEgg, 60000 + _mr() * 60000);
}
_goldenEggTimeout = setTimeout(spawnGoldenEgg, 90000 + _mr() * 60000);
function render(){
const pc = prestigeCost();
const canPrestige = bucks >= pc;
buckEl.textContent = '🦆 ' + fmt(bucks) + ' Duck Bucks' + (prestigeLevel>0?` · ×${prestigeMult}`:'');
bpsEl.textContent = fmt(passivePerSec) + '/sec · ' + fmt(clickPower) + '/click';
cpsEl.textContent = totalClicks + ' clicks · ' + fmt(totalEarned) + ' earned';
duckEl.textContent = prestigeDuck();
if(pShop.goldenDuck>0){duckEl.style.filter='drop-shadow(0 0 8px gold)';duckEl.style.color='#ffd700';}
else{duckEl.style.filter='';duckEl.style.color='';}
prestigeBtn.className = canPrestige ? 'dck-prestige-btn' : 'dck-prestige-btn locked';
prestigeInfo.textContent = canPrestige
? `Resets progress → ${nextMult()}× multiplier`
: `Need 🦆 ${fmt(pc)} to prestige → ${nextMult()}×`;
const now = Date.now();
const boosts = [];
if(now < _tempClickEnd) boosts.push(`⚡ ${_tempClickMult}× click (${Math.ceil((_tempClickEnd-now)/1000)}s)`);
if(now < _tempPassiveEnd) boosts.push(`💧 +${_tempPassiveMult}/sec (${Math.ceil((_tempPassiveEnd-now)/1000)}s)`);
boostBar.textContent = boosts.join(' ');
shopEl.innerHTML = '';
const types = [...new Set(BUILDINGS.map(b=>b.type||'Building'))];
types.forEach(type=>{
const group = BUILDINGS.filter(b=>(b.type||'Building')===type);
const header = _ce('div');
header.style.cssText = 'font-size:9px;font-weight:900;color:rgba(255,255,255,0.25);letter-spacing:.12em;text-transform:uppercase;margin:8px 2px 4px;';
header.textContent = type === 'Upgrade' ? '⚡ Click Upgrades' : '🏗️ Buildings';
shopEl.appendChild(header);
group.forEach(b=>{
const c = cost(b);
const affordable = bucks >= c;
const div = _ce('div');
div.className = 'dck-item ' + (affordable ? 'affordable' : 'unaffordable');
div.innerHTML = `<div class="dck-item-emoji">${b.emoji}</div><div class="dck-item-info"><div class="dck-item-name">${b.name}</div><div class="dck-item-desc">${b.desc}</div><div class="dck-item-cost">🦆 ${fmt(c)} · ${b.incomeType==='click'?'+'+b.baseIncome+'/click':'+'+b.baseIncome+'/sec'}</div></div><div class="dck-item-owned">${b.owned||''}</div>`;
div.addEventListener('pointerdown', e=>{ e.stopPropagation(); buy(b.id); });
shopEl.appendChild(div);
});
});
}
function buildPrestigeShop(){
  const el=_clickerEl.querySelector('#dck-pshop');
  if(!el)return;
  if(prestigeTokens===0&&Object.values(pShop).every(v=>v===0)){
    el.innerHTML='<div style="font-size:11px;color:rgba(255,255,255,0.3);padding:4px 0;">Prestige to earn ⭐ tokens</div>';
    return;
  }
  el.innerHTML='';
  const tokDiv=_ce('div');
  tokDiv.style.cssText='font-size:12px;font-weight:900;color:#ffd700;margin-bottom:8px;';
  tokDiv.textContent='⭐ '+prestigeTokens+' token'+(prestigeTokens!==1?'s':'');
  el.appendChild(tokDiv);
  const PSHOP_ITEMS=[
    {id:'goldenDuck', e:'🥇', name:'Golden Duck', desc:'Your duck turns golden!', maxLvl:1, costs:[2]},
    {id:'clickBoost', e:'👆', name:'Click Boost', desc:'+1 click power permanently', maxLvl:5, costs:[1,1,1,1,1]},
    {id:'passiveBoost', e:'💰', name:'Passive Boost', desc:'+20% passive income permanently', maxLvl:5, costs:[2,2,2,2,2]},
    {id:'autoBuy', e:'🤖', name:'Auto-Clicker', desc:'+0.5/sec permanently', maxLvl:3, costs:[3,3,3]},
    {id:'startBonus', e:'🚀', name:'Head Start', desc:'500 bucks on each reset', maxLvl:3, costs:[2,2,2]},
  ];
  PSHOP_ITEMS.forEach(item=>{
    const lvl=pShop[item.id]||0;
    const maxed=lvl>=item.maxLvl;
    const cost=maxed?0:item.costs[lvl];
    const canAfford=!maxed&&prestigeTokens>=cost;
    const div=_ce('div');
    div.style.cssText='background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,'+(canAfford?'0.12':'0.06')+');border-radius:8px;padding:6px 8px;margin-bottom:5px;display:flex;align-items:center;gap:6px;';
    div.innerHTML='<span style="font-size:16px;">'+item.e+'</span>'
      +'<div style="flex:1"><div style="font-size:11px;font-weight:900;color:#f0e0a0;">'+item.name+(lvl>0?' <span style=\'color:#40c8f0;\'>Lv'+lvl+'</span>':'')+(maxed?' <span style=\'color:#ffd700;\'>MAX</span>':'')+'</div>'
      +'<div style="font-size:9px;color:rgba(255,255,255,0.35);">'+item.desc+'</div></div>'
      +(maxed?'':'<div style="font-size:10px;font-weight:900;color:'+(canAfford?'#ffd700':'rgba(255,255,255,0.25)')+';">⭐'+cost+'</div>');
    if(!maxed&&canAfford){
      div.style.cursor='pointer';
      div.addEventListener('pointerdown',e=>{
        e.stopPropagation();
        if(prestigeTokens<cost)return;
        prestigeTokens-=cost;
        pShop[item.id]=(pShop[item.id]||0)+1;
        if(item.id==='goldenDuck'){
          const d=_clickerEl.querySelector('#dck-duck');
          if(d){d.style.filter='drop-shadow(0 0 8px gold)';d.style.color='#ffd700';}
        }
        if(item.id==='startBonus'){} // applied on prestige
        recalc();_saveState();buildPrestigeShop();render();
      });
    }
    el.appendChild(div);
  });
}
render();
window._getClickerStats = ()=>({prestige: prestigeLevel, bucks: fmt(bucks)});
let lastTick = Date.now();
_clickerInterval = setInterval(()=>{
const now = Date.now();
const dt = (now - lastTick) / 1000;
lastTick = now;
const pm = (now < _tempPassiveEnd) ? _tempPassiveMult : 1;
const effectivePS = passivePerSec * pm;
if(effectivePS > 0){
buckAccum += effectivePS * dt;
if(buckAccum >= 1){
const add = _mf(buckAccum);
bucks += add; totalEarned += add;
buckAccum -= add;
_saveState();
if(window._challengeEvent) window._challengeEvent('clicker_earn', add);
}
}
const pc2 = prestigeCost();
buckEl.textContent = '🦆 ' + fmt(bucks) + ' Duck Bucks' + (prestigeLevel>0?` · ×${prestigeMult}`:'');
prestigeBtn.className = bucks >= pc2 ? 'dck-prestige-btn' : 'dck-prestige-btn locked';
prestigeInfo.textContent = bucks >= pc2
? `Resets progress → ${nextMult()}× multiplier`
: `Need 🦆 ${fmt(pc2)} to prestige → ${nextMult()}×`;
const boosts = [];
if(now < _tempClickEnd) boosts.push(`⚡ ${_tempClickMult}× click (${Math.ceil((_tempClickEnd-now)/1000)}s)`);
if(now < _tempPassiveEnd) boosts.push(`💧 +${_tempPassiveMult}/sec (${Math.ceil((_tempPassiveEnd-now)/1000)}s)`);
boostBar.textContent = boosts.join(' ');
}, 200);
}
})();
(()=>{
let _radEl = null, _radInterval = null, _startRadLoop = null;
window._launchRaiseDuck = function(){
window.paused = true;
if(window._menuEl)window._menuEl.style.display = 'none';
if(window._homeBtn) window._homeBtn.style.display = '';
window._radActive = true;
if(!_radEl){
_buildRAD();
} else {
_radEl.style.display = 'flex';
if(!_radInterval && typeof _startRadLoop === 'function') _startRadLoop();
}
};
window._exitRAD = function(){
window._radActive = false;
window.paused = false;
if(_radEl) _radEl.style.display = 'none';
if(_radInterval){ clearInterval(_radInterval); _radInterval = null; }
if(window._menuEl)window._menuEl.style.display = 'flex'; if(window._randomiseFeatured)window._randomiseFeatured();
if(window._homeBtn) window._homeBtn.style.display = 'none';
};
function _buildRAD(){
const SPECIES=[
{name:'Duck', babyEmoji:'🐥',adultEmoji:'🦆',bg:'linear-gradient(180deg,#1a3a5c,#1e4d38,#2a5a40)',trait:'Swimmer',traitDesc:'Earns +2 happy in rain'},
{name:'Swan', babyEmoji:'🐣',adultEmoji:'🦢',bg:'linear-gradient(180deg,#0a2a4a,#1a3a6a,#2a5a8a)',trait:'Graceful',traitDesc:'XP gains +20%'},
{name:'Fox', babyEmoji:'🦊',adultEmoji:'🦊',bg:'linear-gradient(180deg,#3a1a0a,#6a3010,#9a5020)',trait:'Cunning',traitDesc:'Cooldowns -25%'},
{name:'Wolf', babyEmoji:'🐺',adultEmoji:'🐺',bg:'linear-gradient(180deg,#1a1a2a,#2a2a4a,#3a3a6a)',trait:'Pack Leader',traitDesc:'Train gives +3 bonus XP'},
{name:'Bear', babyEmoji:'🐻',adultEmoji:'🐻',bg:'linear-gradient(180deg,#2a1a0a,#4a3010,#6a4820)',trait:'Sturdy',traitDesc:'Stats decay 20% slower'},
{name:'Dragon', babyEmoji:'🐲',adultEmoji:'🐉',bg:'linear-gradient(180deg,#0a2a0a,#1a4a1a,#2a6a2a)',trait:'Legendary',traitDesc:'Double growth speed'},
{name:'Penguin', babyEmoji:'🐧',adultEmoji:'🐧',bg:'linear-gradient(180deg,#0a1a2a,#1a2a3a,#0d2040)',trait:'Resilient',traitDesc:'Never loses happiness from cold'},
{name:'Owl', babyEmoji:'🦉',adultEmoji:'🦉',bg:'linear-gradient(180deg,#1a1208,#2a2010,#3a3018)',trait:'Wise',traitDesc:'Passive XP trickle always on'},
{name:'Parrot', babyEmoji:'🦜',adultEmoji:'🦜',bg:'linear-gradient(180deg,#1a3a1a,#0a5a20,#205a10)',trait:'Chatty',traitDesc:'Play gives +5 extra happiness'},
{name:'Phoenix', babyEmoji:'🔥',adultEmoji:'🦅',bg:'linear-gradient(180deg,#3a0a0a,#6a1a0a,#c03010)',trait:'Reborn',traitDesc:'Revives once on death at 10hp'},
];
const ACCESSORIES=[
{id:'bow', emoji:'🎀', label:'Bow', slot:'head', unlockLevel:2},
{id:'glasses', emoji:'👓', label:'Glasses', slot:'face', unlockLevel:3},
{id:'scarf', emoji:'🧣', label:'Scarf', slot:'neck', unlockLevel:5},
{id:'hat', emoji:'🎩', label:'Top Hat', slot:'head', unlockLevel:7},
{id:'sungl', emoji:'🕶️', label:'Sunglasses', slot:'face', unlockLevel:9},
{id:'crown', emoji:'👑', label:'Crown', slot:'head', unlockLevel:12},
{id:'cape', emoji:'🦸', label:'Hero Cape', slot:'back', unlockLevel:14},
{id:'medal', emoji:'🏅', label:'Gold Medal', slot:'neck', unlockLevel:16},
{id:'wizard', emoji:'🧙', label:'Wizard Hat', slot:'head', unlockLevel:18},
{id:'wings', emoji:'🪽', label:'Angel Wings', slot:'back', unlockLevel:20},
{id:'halo', emoji:'😇', label:'Halo', slot:'head', unlockLevel:22},
{id:'sword', emoji:'⚔️', label:'Tiny Sword', slot:'hand', unlockLevel:25},
];
const WEATHERS=[
{id:'sunny', emoji:'☀️', label:'Sunny', hungerMod:1.2, happyMod:0.8, energyMod:1.0},
{id:'rainy', emoji:'🌧️', label:'Rainy', hungerMod:0.9, happyMod:1.3, energyMod:0.9},
{id:'cold', emoji:'❄️', label:'Cold', hungerMod:1.4, happyMod:1.1, energyMod:1.2},
{id:'hot', emoji:'🔥', label:'Hot', hungerMod:1.5, happyMod:1.2, energyMod:1.3},
{id:'windy', emoji:'🌬️', label:'Windy', hungerMod:1.0, happyMod:1.1, energyMod:1.1},
{id:'stormy', emoji:'⛈️', label:'Stormy', hungerMod:1.6, happyMod:1.6, energyMod:1.5},
{id:'foggy', emoji:'🌫️', label:'Foggy', hungerMod:0.8, happyMod:0.9, energyMod:0.7},
{id:'rainbow',emoji:'🌈', label:'Rainbow', hungerMod:0.7, happyMod:0.5, energyMod:0.8},
];
const MINI_GAMES=[
{id:'catch', label:'Catch!', emoji:'🎯', desc:'Tap the duck 5 times fast', reward:{xp:15,happiness:15,growthXp:8}, energyCost:10},
{id:'swim', label:'Swim!', emoji:'🏊', desc:'Hold to swim across the pond',reward:{xp:12,energy:-10,growthXp:10}, energyCost:12},
{id:'race', label:'Race!', emoji:'🏁', desc:'Tap 8 times in 3 seconds', reward:{xp:20,happiness:20,growthXp:12}, energyCost:15},
{id:'puzzle', label:'Puzzle!', emoji:'🧩', desc:'Tap in the right order', reward:{xp:25,happiness:10,growthXp:15}, energyCost:8},
];
const EVENTS=[
{id:'festival', emoji:'🎉', label:'Duck Festival!', desc:'Your duck got invited to a festival.', effect:{happiness:+30, xp:20}},
{id:'pond_race', emoji:'🏁', label:'Pond Race!', desc:'Your duck entered a race.', effect:{xp:30, growthXp:15, hunger:-15}},
{id:'visitor', emoji:'👤', label:'A visitor arrived!', desc:'Someone admired your duck.', effect:{happiness:+20, xp:10}},
{id:'found_food',emoji:'🍱', label:'Found a snack!', desc:'Your duck found something delicious.', effect:{hunger:+25, happiness:+10}},
{id:'storm', emoji:'⛈️', label:'Storm hit!', desc:'The sudden storm upset your duck.', effect:{happiness:-20, energy:-15}},
{id:'cold_snap', emoji:'❄️', label:'Cold snap!', desc:'A sudden freeze drained your duck.', effect:{energy:-20, hunger:-10}},
{id:'nap', emoji:'💤', label:'Surprise nap!', desc:'Your duck just passed out mid-walk.', effect:{energy:+30, hunger:-5}},
{id:'dream', emoji:'✨', label:'Had a dream!', desc:'Your duck dreamed of being legendary.', effect:{xp:15, growthXp:10, happiness:+5}},
{id:'mud', emoji:'💩', label:'Rolled in mud!', desc:'Your duck is now very dirty.', effect:{happiness:-15}},
{id:'sunbathe', emoji:'🌞', label:'Sunbathing!', desc:'Your duck soaked up the sun perfectly.', effect:{energy:+20, happiness:+15}},
];
const ACHIEVEMENTS=[
{id:'first_hatch', label:'First Hatch', emoji:'🐣', desc:'Hatch your first egg', check:s=>s.totalHatches>=1},
{id:'lv5', label:'Level Up!', emoji:'⬆️', desc:'Reach level 5', check:s=>s.level>=5},
{id:'lv15', label:'Veteran', emoji:'🏆', desc:'Reach level 15', check:s=>s.level>=15},
{id:'lv25', label:'Legend', emoji:'🌟', desc:'Reach level 25', check:s=>s.level>=25},
{id:'first_evolve', label:'Evolution!', emoji:'🔄', desc:'Evolve a species', check:s=>s.totalEvolves>=1},
{id:'three_evolve', label:'Metamorph', emoji:'🦋', desc:'Evolve 3 times in one run', check:s=>s.totalEvolves>=3},
{id:'happy100', label:'Bliss', emoji:'😄', desc:'Reach 100 happiness', check:s=>s.maxHappiness>=100},
{id:'all_weathers', label:'Storm Chaser', emoji:'⛈️', desc:'Experience all 8 weather types', check:s=>s.weathersSeen.size>=8},
{id:'wardrobe', label:'Fashionista', emoji:'👑', desc:'Wear 4 accessories at once', check:s=>s.maxAccessories>=4},
{id:'survivor', label:'Survivor', emoji:'💀', desc:'Recover from critical condition', check:s=>s.survivedCritical},
{id:'clean_freak', label:'Sparkle', emoji:'✨', desc:'Clean 20 poos', check:s=>s.totalCleans>=20},
{id:'mini_master', label:'Mini Master', emoji:'🎮', desc:'Complete 10 mini-games', check:s=>s.miniGamesWon>=10},
{id:'centenarian', label:'100 Levels', emoji:'💯', desc:'Reach level 100 total across runs',check:s=>s.lifetimeLevels>=100},
];
function xpForLevel(lvl){ return _mf(50*Math.pow(1.4,lvl-1)); }
let speciesIdx=0, phase='egg', duckName='', hatchProgress=0;
let hunger=80, happiness=80, energy=80;
let age=0, poos=[], pooId=0, growthXp=0, actionCooldowns={};
let level=1, xp=0, unlockedAccessories=new Set(), wearingSet=new Set();
let weatherIdx=0, nextWeatherChange=Date.now()+30000+_mr()*30000;
let deathWarning=false, deathWarningTimeout=null;
let miniGameActive=false, miniGameState={};
let nextEventTime=Date.now()+45000+_mr()*60000;
let reviveUsed=false;
let stats={totalHatches:0,totalEvolves:0,maxHappiness:0,weathersSeen:new Set(),maxAccessories:0,survivedCritical:false,totalCleans:0,miniGamesWon:0,lifetimeLevels:0};
let unlockedAchs=new Set();
try{const s={};
if(s.totalHatches)stats.totalHatches=s.totalHatches;
if(s.lifetimeLevels)stats.lifetimeLevels=s.lifetimeLevels;
if(s.miniGamesWon)stats.miniGamesWon=s.miniGamesWon;
if(s.totalCleans)stats.totalCleans=s.totalCleans;
if(s.totalEvolves)stats.totalEvolves=s.totalEvolves;
const ua=[];
if(Array.isArray(ua))ua.forEach(id=>unlockedAchs.add(id));
}catch(e){}
function saveStats(){}
const COOLDOWN=3000;
const ACTION_GAIN={
feed: {hunger:+30,xp:4},
play: {happiness:+22,energy:-15,xp:6},
clean: {happiness:+12,xp:3},
train: {happiness:+12,energy:-20,xp:8,growthXp:+8},
sleep: {energy:+40,hunger:-8,xp:2},
sing: {happiness:+18,xp:5,growthXp:+4},
explore:{hunger:-12,xp:10,growthXp:+6,energy:-10},
};
function sp(){ return SPECIES[speciesIdx]; }
function weather(){ return WEATHERS[weatherIdx]; }
function traitCooldownMult(){ return sp().trait==='Cunning'?0.75:1; }
function traitXpMult(){ return sp().trait==='Graceful'?1.2:sp().trait==='Wise'?1.1:1; }
function traitDecayMult(){ return sp().trait==='Sturdy'?0.8:1; }
function traitGrowthMult(){ return sp().trait==='Legendary'?2:1; }
_radEl=_ce('div');
_radEl.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000085;background:#1a1c2e;display:flex;flex-direction:column;font-family:Nunito,sans-serif;overflow:hidden;';
window._radEl=_radEl;
_radEl.innerHTML=`<style>
#rad *{box-sizing:border-box;}
#rad-header{background:#14162a;height:52px;display:flex;align-items:center;gap:6px;padding:0 10px;border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0;overflow-x:auto;scrollbar-width:none;}
#rad-title{font-size:16px;font-weight:900;color:#fff;}
#rad-back{background:rgba(255,255,255,0.08);border:none;color:rgba(255,255,255,0.6);font-size:12px;font-weight:900;padding:7px 14px;border-radius:10px;cursor:pointer;font-family:Nunito,sans-serif;}
#rad-back:hover{background:rgba(255,255,255,0.15);color:#fff;}
#rad-body{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;overflow-y:auto;padding:10px 14px 16px;gap:9px;scrollbar-width:none;}
#rad-body::-webkit-scrollbar{display:none;}
#rad-scene{width:100%;max-width:380px;border-radius:20px;height:200px;position:relative;overflow:hidden;flex-shrink:0;transition:background 1.2s ease;}
#rad-duck-wrap{position:absolute;bottom:28px;left:50%;transform:translateX(-50%);width:80px;height:80px;display:flex;align-items:center;justify-content:center;}
#rad-duck{font-size:60px;line-height:1;cursor:pointer;user-select:none;touch-action:none;transition:transform .15s ease;z-index:2;}
.rad-placed-acc{position:absolute;font-size:26px;cursor:grab;user-select:none;z-index:10;touch-action:none;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5));}
.rad-placed-acc:active{cursor:grabbing;}
#rad-ground{position:absolute;bottom:0;left:0;width:100%;height:32px;background:linear-gradient(180deg,#4a8a50,#3a7040);border-radius:0 0 20px 20px;}
#rad-mood{position:absolute;top:10px;right:14px;font-size:20px;}
#rad-weather-badge{position:absolute;top:10px;left:14px;font-size:10px;font-weight:900;color:rgba(255,255,255,0.7);background:rgba(0,0,0,0.35);padding:2px 8px;border-radius:8px;}
#rad-name-tag{position:absolute;top:10px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.55);color:#fff;font-size:10px;font-weight:900;padding:2px 10px;border-radius:10px;white-space:nowrap;}
#rad-trait-badge{position:absolute;bottom:36px;right:10px;font-size:9px;font-weight:900;background:rgba(160,32,240,0.3);border:1px solid rgba(160,32,240,0.5);color:#e080ff;padding:2px 7px;border-radius:7px;white-space:nowrap;display:none;}
#rad-death-overlay{position:absolute;inset:0;background:rgba(80,0,0,0.7);flex-direction:column;align-items:center;justify-content:center;gap:6px;border-radius:20px;z-index:20;display:none;}
#rad-event-banner{position:absolute;bottom:40px;left:50%;transform:translateX(-50%);background:rgba(20,0,60,0.9);border:1px solid rgba(255,255,255,0.2);color:#fff;font-size:11px;font-weight:900;padding:6px 14px;border-radius:10px;white-space:nowrap;z-index:15;display:none;text-align:center;max-width:90%;animation:eventPop .3s ease;}
@keyframes eventPop{0%{opacity:0;transform:translateX(-50%) scale(0.8);}100%{opacity:1;transform:translateX(-50%) scale(1);}}
/* stats */
.rad-stat{width:100%;max-width:380px;}
.rad-stat-row{display:flex;align-items:center;gap:10px;margin-bottom:7px;}
.rad-stat-label{font-size:11px;font-weight:900;color:rgba(255,255,255,0.5);width:72px;flex-shrink:0;}
.rad-stat-bar{flex:1;height:10px;background:rgba(255,255,255,0.1);border-radius:5px;overflow:hidden;}
.rad-stat-fill{height:100%;border-radius:5px;transition:width .4s ease;}
.rad-stat-val{font-size:10px;font-weight:900;color:rgba(255,255,255,0.4);width:28px;text-align:right;flex-shrink:0;}
/* level & xp */
#rad-level-row{display:flex;align-items:center;gap:8px;width:100%;max-width:380px;}
#rad-level-badge{font-size:11px;font-weight:900;color:#f5e642;background:rgba(245,230,66,0.12);border:1px solid rgba(245,230,66,0.3);border-radius:8px;padding:2px 8px;flex-shrink:0;}
#rad-xp-bar-wrap{flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;}
#rad-xp-fill{height:100%;background:linear-gradient(90deg,#f5e642,#ffb300);border-radius:3px;transition:width .4s ease;}
#rad-xp-label{font-size:9px;color:rgba(255,255,255,0.3);font-weight:700;flex-shrink:0;}
/* growth */
#rad-growth{width:100%;max-width:380px;background:#1e2040;border-radius:12px;padding:8px 14px;}
#rad-growth-label{font-size:10px;font-weight:900;color:rgba(255,255,255,0.35);margin-bottom:4px;}
#rad-growth-bar{height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden;}
#rad-growth-fill{height:100%;background:linear-gradient(90deg,#f5e642,#ffb300);border-radius:4px;transition:width .4s ease;}
#rad-evolve-btn{margin-top:8px;padding:10px 24px;border-radius:14px;border:none;font-size:13px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;background:linear-gradient(90deg,#a020f0,#6010c0);color:#fff;display:none;animation:evolvePulse 1.5s ease-in-out infinite;touch-action:none;width:100%;}
@keyframes evolvePulse{0%,100%{box-shadow:0 0 12px rgba(160,32,240,0.4)}50%{box-shadow:0 0 28px rgba(160,32,240,0.9)}}
/* actions */
#rad-actions{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;max-width:380px;width:100%;}
.rad-act{display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;padding:8px 10px;background:#1e2040;border-radius:12px;border:1.5px solid rgba(255,255,255,0.07);transition:all .12s;min-width:52px;touch-action:none;}
.rad-act:hover{background:#252846;transform:translateY(-2px);}
.rad-act.cooling{opacity:0.4;cursor:default;transform:none;}
.rad-act-emoji{font-size:19px;line-height:1;}
.rad-act-label{font-size:9px;font-weight:900;color:rgba(255,255,255,0.5);white-space:nowrap;}
.rad-act-cd{font-size:8px;color:rgba(255,255,255,0.3);font-weight:700;}
/* species bar */
#rad-species-bar{display:flex;gap:6px;justify-content:center;max-width:380px;width:100%;flex-wrap:wrap;}
.rad-sp{font-size:18px;opacity:0.22;transition:opacity .3s,filter .3s;}
.rad-sp.done{opacity:0.65;}
.rad-sp.active{opacity:1;filter:drop-shadow(0 0 6px gold);}
/* drag food */
#rad-food-tray{display:flex;gap:8px;justify-content:center;max-width:380px;width:100%;flex-wrap:wrap;}
.rad-food-item{font-size:26px;cursor:grab;user-select:none;touch-action:none;padding:6px 10px;background:#1e2040;border-radius:12px;border:1.5px solid rgba(255,255,255,0.08);transition:transform .12s;}
.rad-food-item:active{cursor:grabbing;transform:scale(1.2);}
.rad-food-drag{position:fixed;pointer-events:none;z-index:99999;font-size:30px;transform:translate(-50%,-50%);}
/* wardrobe */
#rad-wardrobe-btn{padding:8px 16px;border-radius:12px;border:1.5px solid rgba(255,255,255,0.1);font-size:12px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.6);touch-action:none;transition:background .12s;}
#rad-wardrobe-btn:hover{background:rgba(255,255,255,0.12);color:#fff;}
#rad-wardrobe{width:100%;max-width:380px;background:#1e2040;border-radius:16px;padding:12px;display:none;}
#rad-wardrobe-title{font-size:11px;font-weight:900;color:rgba(255,255,255,0.35);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px;}
.rad-acc-row{display:flex;gap:7px;flex-wrap:wrap;}
.rad-acc{display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 9px;background:rgba(255,255,255,0.04);border-radius:11px;cursor:pointer;border:1.5px solid transparent;min-width:50px;transition:all .12s;}
.rad-acc.locked{opacity:0.28;cursor:default;}
.rad-acc.wearing{border-color:rgba(245,230,66,0.6);background:rgba(245,230,66,0.08);}
.rad-acc-emoji{font-size:21px;}
.rad-acc-label{font-size:8px;font-weight:900;color:rgba(255,255,255,0.45);}
.rad-acc-unlock{font-size:7px;color:rgba(255,255,255,0.25);}
/* mini game */
#rad-minigame{width:100%;max-width:380px;background:linear-gradient(135deg,#1e1040,#2a1860);border:1.5px solid rgba(160,32,240,0.3);border-radius:16px;padding:12px;display:none;text-align:center;}
#rad-mg-title{font-size:13px;font-weight:900;color:#c880ff;margin-bottom:4px;}
#rad-mg-desc{font-size:11px;color:rgba(255,255,255,0.45);margin-bottom:10px;}
#rad-mg-area{min-height:60px;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;}
#rad-mg-result{font-size:12px;font-weight:900;color:#f5e642;min-height:18px;}
/* achievements */
#rad-ach-btn{padding:8px 16px;border-radius:12px;border:1.5px solid rgba(255,215,0,0.2);font-size:12px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;background:rgba(255,215,0,0.06);color:rgba(255,215,0,0.7);touch-action:none;transition:background .12s;}
#rad-ach-btn:hover{background:rgba(255,215,0,0.12);color:#ffd700;}
#rad-ach-panel{width:100%;max-width:380px;background:#1a1c30;border-radius:16px;padding:12px;display:none;}
#rad-ach-title{font-size:11px;font-weight:900;color:rgba(255,215,0,0.5);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px;}
.rad-ach-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.04);}
.rad-ach-row:last-child{border-bottom:none;}
.rad-ach-em{font-size:20px;width:26px;flex-shrink:0;}
.rad-ach-info{flex:1;}
.rad-ach-label{font-size:11px;font-weight:900;color:#fff;}
.rad-ach-desc{font-size:9px;color:rgba(255,255,255,0.35);}
.rad-ach-row.locked .rad-ach-label{color:rgba(255,255,255,0.3);}
.rad-ach-row.locked .rad-ach-em{opacity:0.25;filter:grayscale(1);}
#rad-warning{width:100%;max-width:380px;background:rgba(200,30,30,0.2);border:1px solid rgba(200,30,30,0.4);border-radius:12px;padding:8px 14px;font-size:12px;font-weight:900;color:#ff6060;text-align:center;display:none;}
/* ach toast */
.rad-ach-toast{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(255,215,0,0.15);border:1px solid rgba(255,215,0,0.4);color:#ffd700;font-size:12px;font-weight:900;padding:8px 18px;border-radius:12px;z-index:1000099;white-space:nowrap;animation:radToastIn .4s ease,radToastOut .4s ease 2.2s forwards;pointer-events:none;}
@keyframes radToastIn{from{opacity:0;transform:translateX(-50%) translateY(10px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}
@keyframes radToastOut{from{opacity:1;}to{opacity:0;}}
</style>
<div id="rad" style="display:flex;flex-direction:column;height:100%;">
<div id="rad-header">
<div id="rad-title">🐣 Raise a Duck</div>
<button id="rad-back" onclick="window._exitRAD()">🏠 Menu</button>
</div>
<div id="rad-body">
<div id="rad-species-bar"></div>
<div id="rad-scene">
<div id="rad-weather-badge">☀️ Sunny</div>
<div id="rad-mood">😊</div>
<div id="rad-duck-wrap"><div id="rad-duck">🥚</div></div>
<div id="rad-name-tag" style="display:none;"></div>
<div id="rad-trait-badge"></div>
<div id="rad-ground"></div>
<div id="rad-event-banner"></div>
<div id="rad-death-overlay">
<div style="font-size:36px;">💀</div>
<div style="font-size:15px;font-weight:900;color:#fff;" id="rad-death-name"></div>
<div style="font-size:11px;color:rgba(255,255,255,0.6);">died from neglect</div>
<button id="rad-restart-btn" style="margin-top:8px;background:rgba(255,255,255,0.15);border:1.5px solid rgba(255,255,255,0.3);color:#fff;font-size:12px;font-weight:900;padding:8px 20px;border-radius:12px;cursor:pointer;font-family:Nunito,sans-serif;">Start Over</button>
</div>
</div>
<div id="rad-warning">⚠️ Your duck is in critical condition!</div>
<div id="rad-level-row">
<div id="rad-level-badge">Lv 1</div>
<div id="rad-xp-bar-wrap"><div id="rad-xp-fill" style="width:0%"></div></div>
<div id="rad-xp-label">0 / 50 XP</div>
</div>
<div class="rad-stat">
<div class="rad-stat-row"><span class="rad-stat-label">🍞 Hunger</span><div class="rad-stat-bar"><div class="rad-stat-fill" id="rad-hunger-fill" style="background:#f5a623;width:80%"></div></div><span class="rad-stat-val" id="rad-hunger-val">80</span></div>
<div class="rad-stat-row"><span class="rad-stat-label">😊 Happy</span><div class="rad-stat-bar"><div class="rad-stat-fill" id="rad-happy-fill" style="background:#7ed321;width:80%"></div></div><span class="rad-stat-val" id="rad-happy-val">80</span></div>
<div class="rad-stat-row"><span class="rad-stat-label">⚡ Energy</span><div class="rad-stat-bar"><div class="rad-stat-fill" id="rad-energy-fill" style="background:#4a90e2;width:80%"></div></div><span class="rad-stat-val" id="rad-energy-val">80</span></div>
</div>
<div id="rad-growth"><div id="rad-growth-label">🌱 Growth</div><div id="rad-growth-bar"><div id="rad-growth-fill" style="width:0%"></div></div><button id="rad-evolve-btn">✨ Evolve!</button></div>
<div id="rad-minigame">
<div id="rad-mg-title">🎮 Mini Game</div>
<div id="rad-mg-desc"></div>
<div id="rad-mg-area"></div>
<div id="rad-mg-result"></div>
</div>
<div style="display:flex;gap:8px;width:100%;max-width:380px;flex-wrap:wrap;">
<div id="rad-food-tray" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;width:100%;max-width:380px;padding:6px 0 2px;">
<span class="rad-food-item" data-food="bread" data-hunger="30" data-happy="0">🍞</span>
<span class="rad-food-item" data-food="fish" data-hunger="40" data-happy="5">🐟</span>
<span class="rad-food-item" data-food="corn" data-hunger="25" data-happy="0">🌽</span>
<span class="rad-food-item" data-food="cake" data-hunger="35" data-happy="15">🎂</span>
<span class="rad-food-item" data-food="apple" data-hunger="20" data-happy="5">🍎</span>
</div>
<div id="rad-actions" style="flex:1;"></div>
<div style="display:flex;flex-direction:column;gap:6px;">
<button id="rad-wardrobe-btn">👗 Wardrobe</button>
<button id="rad-ach-btn">🏆 Achs</button>
</div>
</div>
<div id="rad-wardrobe"><div id="rad-wardrobe-title">🎀 Accessories</div><div class="rad-acc-row" id="rad-acc-list"></div></div>
<div id="rad-ach-panel"><div id="rad-ach-title">🏆 Achievements</div><div id="rad-ach-list"></div></div>
</div>
</div>`;
_ba(_radEl);
_radEl.addEventListener('click',e=>{e.stopPropagation();e.stopImmediatePropagation();});
_radEl.addEventListener('touchend',e=>{e.stopPropagation();e.stopImmediatePropagation();});
const duckEl=_radEl.querySelector('#rad-duck');
const duckWrap=_radEl.querySelector('#rad-duck-wrap');
let accPositions={};
const moodEl=_radEl.querySelector('#rad-mood');
const nameTagEl=_radEl.querySelector('#rad-name-tag');
const sceneEl=_radEl.querySelector('#rad-scene');
const actionsEl=_radEl.querySelector('#rad-actions');
const hFill=_radEl.querySelector('#rad-hunger-fill');
const hapFill=_radEl.querySelector('#rad-happy-fill');
const eFill=_radEl.querySelector('#rad-energy-fill');
const hVal=_radEl.querySelector('#rad-hunger-val');
const hapVal=_radEl.querySelector('#rad-happy-val');
const eVal=_radEl.querySelector('#rad-energy-val');
const growthFill=_radEl.querySelector('#rad-growth-fill');
const growthLabel=_radEl.querySelector('#rad-growth-label');
const evolveBtn=_radEl.querySelector('#rad-evolve-btn');
const speciesBar=_radEl.querySelector('#rad-species-bar');
const levelBadge=_radEl.querySelector('#rad-level-badge');
const xpFill=_radEl.querySelector('#rad-xp-fill');
const xpLabel=_radEl.querySelector('#rad-xp-label');
const weatherBadge=_radEl.querySelector('#rad-weather-badge');
const wardrobeBtn=_radEl.querySelector('#rad-wardrobe-btn');
const wardrobeEl=_radEl.querySelector('#rad-wardrobe');
const accList=_radEl.querySelector('#rad-acc-list');
const warningEl=_radEl.querySelector('#rad-warning');
const deathOverlay=_radEl.querySelector('#rad-death-overlay');
const deathName=_radEl.querySelector('#rad-death-name');
const restartBtn=_radEl.querySelector('#rad-restart-btn');
const traitBadge=_radEl.querySelector('#rad-trait-badge');
const eventBanner=_radEl.querySelector('#rad-event-banner');
const minigameEl=_radEl.querySelector('#rad-minigame');
const mgTitle=_radEl.querySelector('#rad-mg-title');
const mgDesc=_radEl.querySelector('#rad-mg-desc');
const mgArea=_radEl.querySelector('#rad-mg-area');
const mgResult=_radEl.querySelector('#rad-mg-result');
const achBtn=_radEl.querySelector('#rad-ach-btn');
const achPanel=_radEl.querySelector('#rad-ach-panel');
const achList=_radEl.querySelector('#rad-ach-list');

function clamp(v){return _mx(0,_mn(100,v));}
function calcMood(){const a=(hunger+happiness+energy)/3;return a>=90?'🤩':a>=75?'😄':a>=60?'😊':a>=45?'😐':a>=30?'😢':a>=15?'😱':'💀';}
function formatAge(s){return s<60?s+'s old':s<3600?_mf(s/60)+'m old':_mf(s/3600)+'h old';}

function showToast(msg){
const t=_ce('div');t.className='rad-ach-toast';t.textContent=msg;
document.body.appendChild(t);setTimeout(()=>t.remove(),2700);
}
function checkAchievements(){
ACHIEVEMENTS.forEach(a=>{
if(!unlockedAchs.has(a.id)&&a.check(stats)){
unlockedAchs.add(a.id);saveStats();
showToast(a.emoji+' Achievement: '+a.label);
}
});
}
function renderAchievements(){
achList.innerHTML='';
ACHIEVEMENTS.forEach(a=>{
const unlocked=unlockedAchs.has(a.id);
const row=_ce('div');row.className='rad-ach-row'+(unlocked?'':' locked');
row.innerHTML='<div class="rad-ach-em">'+a.emoji+'</div><div class="rad-ach-info"><div class="rad-ach-label">'+a.label+'</div><div class="rad-ach-desc">'+a.desc+'</div></div>';
achList.appendChild(row);
});
}
achBtn.addEventListener('pointerdown',e=>{
e.stopPropagation();
const open=achPanel.style.display==='block';
achPanel.style.display=open?'none':'block';
if(!open){renderAchievements();}
});

restartBtn.addEventListener('pointerdown',e=>{
e.stopPropagation();
deathOverlay.style.display='none';
speciesIdx=0;phase='egg';duckName='';hatchProgress=0;
hunger=80;happiness=80;energy=80;age=0;
poos.forEach(p=>p.el.remove());poos=[];growthXp=0;actionCooldowns={};accPositions={};
level=1;xp=0;unlockedAccessories=new Set();wearingSet=new Set();accPositions={};
deathWarning=false;reviveUsed=false;
sceneEl.style.background=sp().bg;
duckEl.textContent='🥚';sceneEl.querySelectorAll('.rad-placed-acc').forEach(el=>el.remove());
nameTagEl.style.display='none';evolveBtn.style.display='none';
traitBadge.style.display='none';
renderSpeciesBar();renderStats();renderActions();renderWardrobe();
startEggPhase();
});

function renderSpeciesBar(){
speciesBar.innerHTML='';
SPECIES.forEach((s,i)=>{
const d=_ce('span');d.className='rad-sp'+(i<speciesIdx?' done':i===speciesIdx?' active':'');
d.textContent=s.adultEmoji;d.title=s.name;speciesBar.appendChild(d);
});
}
function renderDuckAccessories(){
sceneEl.querySelectorAll('.rad-placed-acc').forEach(el=>el.remove());
if(phase==='egg'||phase==='naming')return;
const equipped=ACCESSORIES.filter(a=>wearingSet.has(a.id));
const sceneRect=sceneEl.getBoundingClientRect();
const sw=sceneRect.width||300,sh=sceneRect.height||200;
equipped.forEach(a=>{
if(!accPositions[a.id]){const idx=equipped.indexOf(a);accPositions[a.id]={x:45+idx*8,y:30+idx*12};}
const pos=accPositions[a.id];
const el=_ce('div');el.className='rad-placed-acc';el.textContent=a.emoji;
el.style.left=(pos.x/100*sw)+'px';el.style.top=(pos.y/100*sh)+'px';
let startX,startY,startLeft,startTop;
const onMove=ev=>{const cx=ev.touches?ev.touches[0].clientX:ev.clientX;const cy=ev.touches?ev.touches[0].clientY:ev.clientY;const sr=sceneEl.getBoundingClientRect();let nx=startLeft+(cx-startX),ny=startTop+(cy-startY);nx=_mx(0,_mn(sr.width-32,nx));ny=_mx(0,_mn(sr.height-32,ny));el.style.left=nx+'px';el.style.top=ny+'px';accPositions[a.id]={x:nx/sr.width*100,y:ny/sr.height*100};};
const onUp=()=>{document.removeEventListener('pointermove',onMove);document.removeEventListener('pointerup',onUp);el.style.cursor='grab';};
el.addEventListener('pointerdown',ev=>{ev.stopPropagation();ev.preventDefault();startX=ev.clientX;startY=ev.clientY;startLeft=parseFloat(el.style.left)||0;startTop=parseFloat(el.style.top)||0;el.style.cursor='grabbing';document.addEventListener('pointermove',onMove);document.addEventListener('pointerup',onUp);});
sceneEl.appendChild(el);
});
stats.maxAccessories=Math.max(stats.maxAccessories,equipped.length);
checkAchievements();
}
function renderWardrobe(){
accList.innerHTML='';
ACCESSORIES.forEach(a=>{
const unlocked=unlockedAccessories.has(a.id);const isWearing=wearingSet.has(a.id);
const div=_ce('div');div.className='rad-acc'+(isWearing?' wearing':unlocked?'':' locked');
div.innerHTML='<div class="rad-acc-emoji">'+a.emoji+'</div><div class="rad-acc-label">'+a.label+'</div>'+(unlocked?'<div class="rad-acc-unlock">'+(isWearing?'✓ on':'tap')+'</div>':'<div class="rad-acc-unlock">Lv '+a.unlockLevel+'</div>');
if(unlocked){div.addEventListener('pointerdown',e=>{e.stopPropagation();if(wearingSet.has(a.id)){wearingSet.delete(a.id);delete accPositions[a.id];}else{wearingSet.add(a.id);}renderDuckAccessories();renderWardrobe();});}
accList.appendChild(div);
});
}
wardrobeBtn.addEventListener('pointerdown',e=>{e.stopPropagation();const open=wardrobeEl.style.display==='block';wardrobeEl.style.display=open?'none':'block';if(!open)renderWardrobe();});

function spawnPoo(){
const id=pooId++;const x=15+_mr()*70;
const el=_ce('div');el.textContent='💩';
el.style.cssText='position:absolute;bottom:28px;left:'+x+'%;font-size:18px;cursor:pointer;z-index:10;user-select:none;touch-action:none;';
sceneEl.appendChild(el);poos.push({id,el});
el.addEventListener('pointerdown',e2=>{e2.stopPropagation();cleanPoo(id);});
}
function cleanPoo(id){
const i=poos.findIndex(p=>p.id===id);if(i===-1)return;
poos[i].el.remove();poos.splice(i,1);happiness=clamp(happiness+5);
stats.totalCleans++;saveStats();checkAchievements();
showFloater('🧹 +5!','#7ed321');renderStats();
}
function showFloater(txt,col){
const f=_ce('div');f.textContent=txt;
f.style.cssText='position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);font-size:13px;font-weight:900;color:'+col+';z-index:100;pointer-events:none;font-family:Nunito,sans-serif;white-space:nowrap;transition:transform .7s ease-out,opacity .7s ease-out;';
sceneEl.appendChild(f);_raf(()=>{f.style.transform='translate(-50%,-200%)';f.style.opacity='0';});setTimeout(()=>f.remove(),750);
}
function gainXp(amount){
if(phase!=='duckling'&&phase!=='adult')return;
xp+=_mf(amount*traitXpMult());
const needed=xpForLevel(level);
if(xp>=needed){
xp-=needed;level++;stats.lifetimeLevels++;
levelBadge.textContent='Lv '+level;
showFloater('⬆️ Level '+level+'!','#f5e642');
ACCESSORIES.forEach(a=>{if(a.unlockLevel===level&&!unlockedAccessories.has(a.id)){unlockedAccessories.add(a.id);showFloater('🔓 '+a.label+'!','#ff80ff');}});
checkAchievements();renderWardrobe();
}
renderStats();
}
function triggerEvent(){
const ev=EVENTS[_mf(_mr()*EVENTS.length)];
eventBanner.textContent=ev.emoji+' '+ev.label+': '+ev.desc;
eventBanner.style.display='block';
setTimeout(()=>eventBanner.style.display='none',3500);
Object.entries(ev.effect).forEach(([k,v])=>{
if(k==='hunger')hunger=clamp(hunger+v);
else if(k==='happiness')happiness=clamp(happiness+v);
else if(k==='energy')energy=clamp(energy+v);
else if(k==='xp')gainXp(v);
else if(k==='growthXp')growthXp=_mn(100,growthXp+(v||0));
});
showFloater(ev.emoji+' Event!','#a0e0ff');renderStats();
}
function launchMiniGame(){
if(miniGameActive||phase==='egg'||phase==='naming'||energy<8)return;
const mg=MINI_GAMES[_mf(_mr()*MINI_GAMES.length)];
mgTitle.textContent='🎮 '+mg.label;
mgDesc.textContent=mg.desc;
mgArea.innerHTML='';mgResult.textContent='';
minigameEl.style.display='block';
miniGameActive=true;miniGameState={mg,taps:0,startTime:Date.now(),done:false};
if(mg.id==='catch'||mg.id==='race'){
const btn=_ce('button');
btn.style.cssText='font-size:28px;background:rgba(255,255,255,0.08);border:2px solid rgba(255,255,255,0.2);border-radius:14px;padding:10px 18px;cursor:pointer;font-family:Nunito,sans-serif;';
btn.textContent=mg.id==='catch'?'🦆':'🏃';
const limit=mg.id==='catch'?5:8;
const timeLimit=mg.id==='race'?3000:99999;
btn.addEventListener('pointerdown',e=>{
e.stopPropagation();if(miniGameState.done)return;
miniGameState.taps++;
btn.style.transform='scale(0.85)';setTimeout(()=>btn.style.transform='',100);
if(miniGameState.taps>=limit||(mg.id==='race'&&Date.now()-miniGameState.startTime>timeLimit)){
finishMiniGame(miniGameState.taps>=limit);
}else{
mgResult.textContent=miniGameState.taps+'/'+limit;
}
});
mgArea.appendChild(btn);
if(mg.id==='race'){setTimeout(()=>{if(!miniGameState.done)finishMiniGame(miniGameState.taps>=8);},3000);}
} else if(mg.id==='puzzle'){
const seq=[1,2,3];const btns=[];
['🔴','🟡','🟢'].forEach((em,i)=>{
const b=_ce('button');b.style.cssText='font-size:24px;background:rgba(255,255,255,0.07);border:2px solid rgba(255,255,255,0.15);border-radius:12px;padding:8px 14px;cursor:pointer;';
b.textContent=em;b.dataset.v=i+1;
b.addEventListener('pointerdown',ev=>{ev.stopPropagation();if(miniGameState.done)return;miniGameState.taps++;if(miniGameState.taps!==i+1){finishMiniGame(false);return;}if(miniGameState.taps===3)finishMiniGame(true);else{b.style.border='2px solid #7ed321';mgResult.textContent=(3-miniGameState.taps)+' more...';}});
mgArea.appendChild(b);
});
} else {
const btn=_ce('button');btn.style.cssText='font-size:28px;background:rgba(255,255,255,0.08);border:2px solid rgba(255,255,255,0.2);border-radius:14px;padding:12px 24px;cursor:pointer;';
btn.textContent='🏊';
let held=false;let holdInt;
btn.addEventListener('pointerdown',e=>{e.stopPropagation();held=true;let t=0;holdInt=setInterval(()=>{if(!held){clearInterval(holdInt);return;}t+=100;mgResult.textContent='Swimming: '+(t/100).toFixed(0)+'s';if(t>=2000){clearInterval(holdInt);finishMiniGame(true);}},100);});
btn.addEventListener('pointerup',e=>{e.stopPropagation();held=false;clearInterval(holdInt);if(!miniGameState.done)finishMiniGame(false);});
mgArea.appendChild(btn);
}
}
function finishMiniGame(won){
if(miniGameState.done)return;
miniGameState.done=true;
const mg=miniGameState.mg;
if(won){
Object.entries(mg.reward).forEach(([k,v])=>{if(k==='xp')gainXp(v);else if(k==='happiness')happiness=clamp(happiness+v);else if(k==='energy')energy=clamp(energy+v);else if(k==='growthXp')growthXp=_mn(100,growthXp+(v||0));});
mgResult.textContent='🎉 Win! +XP & rewards!';
stats.miniGamesWon++;saveStats();checkAchievements();
energy=clamp(energy-mg.energyCost);
showFloater('🎮 Win!','#f5e642');
}else{
mgResult.textContent='😅 Try again later!';
}
setTimeout(()=>{minigameEl.style.display='none';miniGameActive=false;},1400);
renderStats();
}

function doAction(id){
const now=Date.now();const cdKey=id;const cdMult=traitCooldownMult();
if(actionCooldowns[cdKey]&&now<actionCooldowns[cdKey])return;
actionCooldowns[cdKey]=now+COOLDOWN*cdMult;
const g=ACTION_GAIN[id];
if(id==='train'&&window._challengeEvent)window._challengeEvent('rad_train');
if(g.hunger) hunger =clamp(hunger +g.hunger);
if(g.happiness){
let hb=g.happiness;
if(id==='play'&&sp().trait==='Chatty')hb+=5;
if(id==='play'&&sp().trait==='Swimmer'&&weather().id==='rainy')hb+=2;
happiness=clamp(happiness+hb);
}
if(g.energy) energy =clamp(energy +g.energy);
if(g.growthXp) growthXp=_mn(100,growthXp+g.growthXp+(sp().trait==='Pack Leader'&&id==='train'?3:0));
if(g.xp){const xb=g.xp+(sp().trait==='Pack Leader'&&id==='train'?3:0);gainXp(xb);}
duckEl.style.transform='scale(1.2)';setTimeout(()=>{duckEl.style.transform='';},200);
const L={feed:'🍞 Yum!',play:'🎾 Fun!',clean:'🛁 Fresh!',train:'💪 Strong!',sleep:'💤 Zzz...',sing:'🎵 La la!',explore:'🗺️ Explore!'};
const C={feed:'#f5a623',play:'#7ed321',clean:'#4a90e2',train:'#e056f0',sleep:'#9b59b6',sing:'#ff80ff',explore:'#80ffff'};
showFloater(L[id],C[id]);renderStats();renderActions();
}
function renderStats(){
hFill.style.width=hunger+'%';hapFill.style.width=happiness+'%';eFill.style.width=energy+'%';
hVal.textContent=_mf(hunger);hapVal.textContent=_mf(happiness);eVal.textContent=_mf(energy);
moodEl.textContent=calcMood();
const needed=xpForLevel(level);
xpFill.style.width=(xp/needed*100).toFixed(1)+'%';
xpLabel.textContent=_mf(xp)+' / '+needed+' XP';
levelBadge.textContent='Lv '+level;
hFill.style.background=hunger<25?'#e74c3c':'#f5a623';
hapFill.style.background=happiness<25?'#e74c3c':'#7ed321';
eFill.style.background=energy<25?'#e74c3c':'#4a90e2';
if(phase==='duckling'){
growthFill.style.width=growthXp+'%';
growthLabel.textContent='🌱 '+sp().name+' growing ('+Math.floor(growthXp)+'%)';
}else if(phase==='adult'){
growthFill.style.width='100%';
const nxt=SPECIES[speciesIdx+1];
growthLabel.textContent=nxt?'🌟 Fully grown! Evolve → '+nxt.name:'🌟 '+sp().name+' — final form!';
}
const avg=(hunger+happiness+energy)/3;
warningEl.style.display=(avg<15&&phase!=='egg'&&phase!=='naming')?'block':'none';
stats.maxHappiness=Math.max(stats.maxHappiness,happiness);
if(avg<5&&phase!=='egg'&&phase!=='naming')stats.survivedCritical=true;
}
const ACTIONS=[
{id:'play', emoji:'🎾',label:'Play'},
{id:'clean', emoji:'🛁',label:'Clean'},
{id:'train', emoji:'💪',label:'Train'},
{id:'sleep', emoji:'💤',label:'Sleep'},
{id:'sing', emoji:'🎵',label:'Sing'},
{id:'explore',emoji:'🗺️',label:'Explore'},
];
function renderActions(){
actionsEl.innerHTML='';if(phase==='egg'||phase==='naming')return;
const now=Date.now();
ACTIONS.forEach(a=>{
const cdMult=traitCooldownMult();
const cooling=actionCooldowns[a.id]&&now<actionCooldowns[a.id];
const div=_ce('div');div.className='rad-act'+(cooling?' cooling':'');
const cd=cooling?_mc((actionCooldowns[a.id]-now)/1000):0;
div.innerHTML='<div class="rad-act-emoji">'+a.emoji+'</div><div class="rad-act-label">'+a.label+'</div>'+(cooling?'<div class="rad-act-cd">'+cd+'s</div>':'');
if(!cooling)div.addEventListener('pointerdown',e=>{e.stopPropagation();doAction(a.id);});
actionsEl.appendChild(div);
});
const mgAvail=!miniGameActive&&energy>=8;
const mgDiv=_ce('div');mgDiv.className='rad-act'+(mgAvail?'':' cooling');
mgDiv.innerHTML='<div class="rad-act-emoji">🎮</div><div class="rad-act-label">Game</div>';
if(mgAvail)mgDiv.addEventListener('pointerdown',e=>{e.stopPropagation();launchMiniGame();});
actionsEl.appendChild(mgDiv);
}
// ── Drag food system ──────────────────────────────────
(function(){
const FOOD_HAPPY={bread:0,fish:5,corn:0,cake:15,apple:5};
let _dragEl=null,_dragFood=null;
function initFoodDrag(){
  const tray=_radEl.querySelector('#rad-food-tray');
  if(!tray)return;
  tray.querySelectorAll('.rad-food-item').forEach(item=>{
    item.addEventListener('pointerdown',e=>{
      e.preventDefault();e.stopPropagation();
      if(phase==='egg'||phase==='naming')return;
      const now=Date.now();
      if(actionCooldowns['feed']&&now<actionCooldowns['feed']){
        showFloater('⏳ Still digesting...','#f5a623');return;
      }
      _dragFood={food:item.dataset.food,hunger:parseInt(item.dataset.hunger),happy:FOOD_HAPPY[item.dataset.food]||0,emoji:item.textContent.trim()};
      _dragEl=_ce('div');_dragEl.className='rad-food-drag';
      _dragEl.textContent=_dragFood.emoji;
      document.body.appendChild(_dragEl);
      _dragEl.style.left=e.clientX+'px';_dragEl.style.top=e.clientY+'px';
      item.setPointerCapture(e.pointerId);
      item.addEventListener('pointermove',onDragMove);
      item.addEventListener('pointerup',onDragEnd);
      item.addEventListener('pointercancel',cancelDrag);
    });
  });
}
function onDragMove(e){
  if(!_dragEl)return;
  _dragEl.style.left=e.clientX+'px';_dragEl.style.top=e.clientY+'px';
  // Highlight duck if close
  const duckRect=duckEl.getBoundingClientRect();
  const cx=duckRect.left+duckRect.width/2,cy=duckRect.top+duckRect.height/2;
  const dist=Math.hypot(e.clientX-cx,e.clientY-cy);
  duckEl.style.filter=dist<60?'drop-shadow(0 0 12px rgba(245,166,35,0.9))':'';
}
function onDragEnd(e){
  if(!_dragEl||!_dragFood)return;
  const duckRect=duckEl.getBoundingClientRect();
  const cx=duckRect.left+duckRect.width/2,cy=duckRect.top+duckRect.height/2;
  const dist=Math.hypot(e.clientX-cx,e.clientY-cy);
  if(dist<70){
    // Fed!
    const cdMult=traitCooldownMult();
    actionCooldowns['feed']=Date.now()+COOLDOWN*cdMult;
    hunger=Math.min(100,hunger+_dragFood.hunger);
    if(_dragFood.happy>0)happiness=Math.min(100,happiness+_dragFood.happy);
    gainXp(ACTION_GAIN.feed.xp||4);
    duckEl.style.transform='scale(1.25)';
    setTimeout(()=>{duckEl.style.transform='';},250);
    showFloater(_dragFood.emoji+' Yum!','#f5a623');
    renderStats();renderActions();
  }
  duckEl.style.filter='';
  cancelDrag();
}
function cancelDrag(){
  if(_dragEl){_dragEl.remove();_dragEl=null;}
  _dragFood=null;
  duckEl.style.filter='';
}
initFoodDrag();
// Re-init after actions render
const origRenderActions=window._radRenderActions;
})();
function doEvolve(){
if(speciesIdx>=SPECIES.length-1)return;
if(window._challengeEvent)window._challengeEvent('rad_evolve');
stats.totalEvolves++;saveStats();checkAchievements();
speciesIdx++;phase='egg';hatchProgress=0;growthXp=0;
hunger=80;happiness=80;energy=80;reviveUsed=false;
poos.forEach(p=>p.el.remove());poos=[];actionCooldowns={};accPositions={};
evolveBtn.style.display='none';wardrobeEl.style.display='none';
minigameEl.style.display='none';miniGameActive=false;
['rad-prompt','rad-hatch-bar'].forEach(id=>{const el=sceneEl.querySelector('#'+id);if(el)el.remove();});
sceneEl.style.background=sp().bg;
traitBadge.style.display='none';
renderSpeciesBar();renderStats();renderActions();
showFloater('🥚 New '+sp().name+' egg!','#f5e642');
startEggPhase();
}
evolveBtn.addEventListener('pointerdown',e=>{e.stopPropagation();doEvolve();});
function startEggPhase(){
phase='egg';duckEl.textContent='🥚';duckEl.style.fontSize='64px';
sceneEl.querySelectorAll('.rad-placed-acc').forEach(el=>el.remove());
const prompt=_ce('div');prompt.id='rad-prompt';
prompt.style.cssText='position:absolute;top:12px;left:50%;transform:translateX(-50%);font-size:11px;font-weight:900;color:rgba(255,255,255,0.6);white-space:nowrap;z-index:5;';
prompt.textContent='Tap the '+sp().name+' egg!';sceneEl.appendChild(prompt);
const bar=_ce('div');bar.id='rad-hatch-bar';
bar.style.cssText='position:absolute;bottom:40px;left:50%;transform:translateX(-50%);width:120px;height:8px;background:rgba(255,255,255,0.15);border-radius:4px;overflow:hidden;z-index:5;';
const fill=_ce('div');fill.id='rad-hatch-fill';
fill.style.cssText='height:100%;width:0%;background:linear-gradient(90deg,#f5e642,#ffb300);border-radius:4px;transition:width .2s ease;';
bar.appendChild(fill);sceneEl.appendChild(bar);
duckEl.addEventListener('pointerdown',onEggTap);
}
function onEggTap(e){
e.stopPropagation();hatchProgress=_mn(100,hatchProgress+10);
const f=sceneEl.querySelector('#rad-hatch-fill');if(f)f.style.width=hatchProgress+'%';
duckEl.style.transform='rotate('+(_mr()*20-10)+'deg) scale(1.1)';
setTimeout(()=>{duckEl.style.transform='';},150);
if(hatchProgress>=100){
duckEl.removeEventListener('pointerdown',onEggTap);
setTimeout(speciesIdx===0?startNaming:startDucklingPhase,300);
}
}
function startNaming(){
phase='naming';
['rad-prompt','rad-hatch-bar'].forEach(id=>{const el=sceneEl.querySelector('#'+id);if(el)el.remove();});
duckEl.textContent=sp().babyEmoji;duckEl.style.fontSize='56px';
const ov=_ce('div');
ov.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,0.75);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;border-radius:20px;z-index:50;';
ov.innerHTML='<div style="font-size:36px;">'+sp().babyEmoji+'</div><div style="font-size:14px;font-weight:900;color:#fff;">Your '+sp().name+' hatched!</div><div style="font-size:12px;color:rgba(255,255,255,0.6);">Give it a name</div><input id="rad-ni" maxlength="12" placeholder="'+sp().name+' name..." style="background:rgba(255,255,255,0.12);border:1.5px solid rgba(255,255,255,0.2);color:#fff;font-size:15px;font-weight:900;font-family:Nunito,sans-serif;padding:8px 16px;border-radius:12px;text-align:center;outline:none;width:180px;user-select:text;-webkit-user-select:text;touch-action:auto;"><button id="rad-nb" style="background:linear-gradient(90deg,#c86a20,#a84e10);color:#fff;border:none;font-size:13px;font-weight:900;padding:9px 24px;border-radius:12px;cursor:pointer;font-family:Nunito,sans-serif;">Let\'s go! 🎉</button>';
sceneEl.appendChild(ov);
const btn=ov.querySelector('#rad-nb');const inp=ov.querySelector('#rad-ni');
inp.style.userSelect='text';inp.style.webkitUserSelect='text';
setTimeout(()=>inp.focus(),100);
btn.addEventListener('pointerdown',e=>{e.stopPropagation();duckName=inp.value.trim()||'Quackers';ov.remove();if(window._challengeEvent)window._challengeEvent('rad_hatch');stats.totalHatches++;saveStats();checkAchievements();startDucklingPhase();});
inp.addEventListener('keydown',e=>{if(e.key==='Enter')btn.dispatchEvent(new Event('pointerdown'));});
}
function startDucklingPhase(){
phase='duckling';
['rad-prompt','rad-hatch-bar'].forEach(id=>{const el=sceneEl.querySelector('#'+id);if(el)el.remove();});
duckEl.textContent=sp().babyEmoji;duckEl.style.fontSize='52px';
nameTagEl.textContent=duckName;nameTagEl.style.display='';
traitBadge.textContent=sp().trait;traitBadge.title=sp().traitDesc;traitBadge.style.display='';
hunger=70;happiness=70;energy=80;growthXp=0;evolveBtn.style.display='none';
renderDuckAccessories();renderStats();renderActions();
if(!_radInterval)startGameLoop();
}
function growToAdult(){
phase='adult';duckEl.textContent=sp().adultEmoji;duckEl.style.fontSize='60px';
showFloater('🎉 '+duckName+' grew up!','#f5e642');
const nxt=SPECIES[speciesIdx+1];
if(nxt){evolveBtn.style.display='block';evolveBtn.textContent='✨ Evolve into '+nxt.name+'!';}
else{growthLabel.textContent='🌟 '+sp().name+' — final form!';}
renderDuckAccessories();renderStats();
}
let _xpAccum=0;
function startGameLoop(){
let lastTick=Date.now();let nextPoo=Date.now()+20000+_mr()*20000;
let nextMiniGame=Date.now()+40000+_mr()*30000;
_radInterval=setInterval(()=>{
const now=Date.now();const dt=(now-lastTick)/1000;lastTick=now;age+=dt;
const w=weather();const decay=traitDecayMult();
hunger =clamp(hunger -1.5*w.hungerMod*decay*dt);
happiness=clamp(happiness-1.0*w.happyMod *decay*dt);
energy =clamp(energy -0.8*w.energyMod*decay*dt);
if(sp().trait==='Owl'){_xpAccum+=0.15*dt;if(_xpAccum>=1){gainXp(_mf(_xpAccum));_xpAccum-=_mf(_xpAccum);}}
const avg=(hunger+happiness+energy)/3;
if(avg>60&&(phase==='duckling'||phase==='adult')&&sp().trait!=='Owl'){_xpAccum+=0.3*dt;if(_xpAccum>=1){gainXp(_mf(_xpAccum));_xpAccum-=_mf(_xpAccum);}}
if(avg>50&&phase==='duckling'){
const gm=traitGrowthMult();
growthXp=_mn(100,growthXp+0.5*gm*dt);
if(growthXp>=100)growToAdult();
}
if(avg<5&&phase!=='egg'&&phase!=='naming'){
if(sp().trait==='Reborn'&&!reviveUsed){
reviveUsed=true;hunger=10;happiness=10;energy=10;
showFloater('🔥 Reborn!','#ff4020');renderStats();return;
}
if(_radInterval){clearInterval(_radInterval);_radInterval=null;}
deathName.textContent=duckName||'Your duck';
deathOverlay.style.display='flex';return;
}
if(now>nextPoo&&poos.length<3){spawnPoo();nextPoo=now+15000+_mr()*20000;happiness=clamp(happiness-5);}
if(now>nextEventTime&&phase!=='egg'&&phase!=='naming'){triggerEvent();nextEventTime=now+45000+_mr()*60000;}
if(now>nextMiniGame&&!miniGameActive&&phase!=='egg'&&phase!=='naming'&&energy>=8){launchMiniGame();nextMiniGame=now+50000+_mr()*40000;}
if(now>nextWeatherChange){
let newIdx;do{newIdx=_mf(_mr()*WEATHERS.length);}while(newIdx===weatherIdx&&WEATHERS.length>1);
weatherIdx=newIdx;nextWeatherChange=now+30000+_mr()*30000;
stats.weathersSeen.add(weather().id);checkAchievements();
weatherBadge.textContent=weather().emoji+' '+weather().label;
showFloater(weather().emoji+' '+weather().label,'#fff');
}
weatherBadge.textContent=weather().emoji+' '+weather().label;
nameTagEl.textContent=duckName?duckName+' · Lv'+level+' · '+formatAge(_mf(age)):'';
renderStats();renderActions();
},500);
}
sceneEl.style.background=sp().bg;
renderSpeciesBar();renderWardrobe();
_startRadLoop=startGameLoop;
startEggPhase();
}

})();
(()=>{
let _royaleEl = null, _royaleInterval = null;
window._launchRoyale = function(){
window.paused = true;
if(window._menuEl)window._menuEl.style.display = 'none';
if(window._homeBtn) window._homeBtn.style.display = '';
window._royaleActive = true;
if(_royaleEl){ _royaleEl.remove(); _royaleEl = null; }
if(_royaleInterval){ clearInterval(_royaleInterval); _royaleInterval = null; }
_buildRoyale();
};
window._exitRoyale = function(){
window._royaleActive = false;
window.paused = false;
if(_royaleEl){ _royaleEl.remove(); _royaleEl = null; window._royaleEl = null; }
if(_royaleInterval){ clearInterval(_royaleInterval); _royaleInterval = null; }
if(window._menuEl)window._menuEl.style.display = 'flex';
if(window._randomiseFeatured) window._randomiseFeatured();
if(window._homeBtn) window._homeBtn.style.display = 'none';
};
function _buildRoyale(){
const UNITS = [
{id:'duck',    emoji:'🦆', label:'Duck',     cost:10,  hp:3,  dmg:1, pondDmg:1, speed:1.2, reward:2,  desc:'Balanced starter'},
{id:'duckling',emoji:'🐥', label:'Duckling', cost:5,   hp:1,  dmg:1, pondDmg:1, speed:2.0, reward:1,  desc:'Fast, fragile'},
{id:'fox',     emoji:'🦊', label:'Fox',      cost:22,  hp:5,  dmg:2, pondDmg:1, speed:1.4, reward:5,  desc:'2 dmg, tough'},
{id:'wolf',    emoji:'🐺', label:'Wolf',     cost:38,  hp:8,  dmg:3, pondDmg:2, speed:1.1, reward:9,  desc:'Hits pond twice'},
{id:'eagle',   emoji:'🦅', label:'Eagle',    cost:30,  hp:4,  dmg:3, pondDmg:1, speed:2.2, reward:7,  desc:'Fast striker'},
{id:'bear',    emoji:'🐻', label:'Bear',     cost:60,  hp:15, dmg:4, pondDmg:3, speed:0.8, reward:16, desc:'Tanks 3 pond HP'},
{id:'lion',    emoji:'🦁', label:'Lion',     cost:85,  hp:20, dmg:6, pondDmg:4, speed:1.0, reward:24, desc:'Elite — 4 pond damage'},
];
let coins = 30, income = 2, p2Coins = 30;
let currentMap = 'pond';
let mapObstacles = [];
let playerPond = 20, enemyPond = 20;
let units = [];
let uid = 0;
let gameOver = false;
let roundNum = 0;
let aiCoins = 20;
let aiTimer = 0;
_royaleEl = _ce('div');
_royaleEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000085;background:#0e0f1a;display:flex;flex-direction:column;font-family:Nunito,sans-serif;overflow:hidden;';
window._royaleEl = _royaleEl;
_royaleEl.innerHTML = `
<style>
#roy *{box-sizing:border-box;}
#roy-header{background:#14162a;height:52px;display:flex;align-items:center;gap:6px;padding:0 10px;border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0;overflow-x:auto;scrollbar-width:none;}
#roy-title{font-size:16px;font-weight:900;color:#fff;}
#roy-back{background:rgba(255,255,255,0.08);border:none;color:rgba(255,255,255,0.6);font-size:12px;font-weight:900;padding:7px 14px;border-radius:10px;cursor:pointer;font-family:Nunito,sans-serif;}
#roy-back:hover{background:rgba(255,255,255,0.15);color:#fff;}
#roy-arena{flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative;}
/* Enemy pond - top */
#roy-enemy-pond{height:80px;background:linear-gradient(180deg,#1a0a0a,#2a1010);border-bottom:2px solid rgba(255,60,60,0.3);display:flex;align-items:center;padding:0 16px;gap:12px;flex-shrink:0;position:relative;}
#roy-enemy-label{font-size:11px;font-weight:900;color:rgba(255,60,60,0.7);letter-spacing:.08em;text-transform:uppercase;}
#roy-enemy-hp-bar{flex:1;height:12px;background:rgba(255,255,255,0.08);border-radius:6px;overflow:hidden;}
#roy-enemy-hp-fill{height:100%;background:linear-gradient(90deg,#e74c3c,#c0392b);border-radius:6px;transition:width .3s ease;}
#roy-enemy-count{font-size:13px;font-weight:900;color:#ff6060;min-width:40px;text-align:right;}
/* Battlefield - middle */
#roy-field{flex:1;position:relative;overflow:hidden;background:linear-gradient(180deg,#0e0a0a 0%,#0a0e18 50%,#0a0e0a 100%);}
#roy-divider{position:absolute;top:50%;left:0;right:0;height:2px;background:rgba(255,255,255,0.06);transform:translateY(-50%);}
/* Unit elements */
.roy-unit{position:absolute;font-size:22px;line-height:1;pointer-events:none;transition:left .08s linear,top .08s linear;z-index:2;}
.roy-unit-hp{position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);width:28px;height:3px;background:rgba(255,255,255,0.15);border-radius:2px;overflow:hidden;}
.roy-unit-hp-fill{height:100%;background:#4caf50;border-radius:2px;}
.roy-unit.enemy .roy-unit-hp-fill{background:#e74c3c;}
/* Player pond - bottom */
#roy-player-pond{height:80px;background:linear-gradient(180deg,#0a1a0a,#0e2010);border-top:2px solid rgba(60,200,60,0.3);display:flex;align-items:center;padding:0 16px;gap:12px;flex-shrink:0;}
#roy-player-label{font-size:11px;font-weight:900;color:rgba(60,200,60,0.7);letter-spacing:.08em;text-transform:uppercase;}
#roy-player-hp-bar{flex:1;height:12px;background:rgba(255,255,255,0.08);border-radius:6px;overflow:hidden;}
#roy-player-hp-fill{height:100%;background:linear-gradient(90deg,#27ae60,#1e8449);border-radius:6px;transition:width .3s ease;}
#roy-player-count{font-size:13px;font-weight:900;color:#60cc60;min-width:40px;text-align:right;}
/* Shop */
#roy-shop{background:#14162a;border-top:1px solid rgba(255,255,255,0.07);padding:10px 12px;display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;flex-shrink:0;align-items:center;}
#roy-shop::-webkit-scrollbar{display:none;}
#roy-coins{font-size:13px;font-weight:900;color:#f5e642;white-space:nowrap;padding-right:4px;}
.roy-buy-btn{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 10px;background:#1e2040;border-radius:12px;border:1.5px solid rgba(255,255,255,0.07);cursor:pointer;flex-shrink:0;min-width:58px;transition:background .12s,opacity .12s,border-color .12s;touch-action:none;}
.roy-buy-btn:hover{background:#252846;border-color:rgba(255,255,255,0.15);}
.roy-buy-btn.disabled{opacity:0.4;cursor:default;}
.roy-buy-btn.affordable{border-color:rgba(245,230,66,0.4);}
.roy-buy-btn.selected{border-color:#f5e642;background:#2a2a50;box-shadow:0 0 12px rgba(245,230,66,0.4);}
.roy-buy-emoji{font-size:20px;line-height:1;}
.roy-buy-label{font-size:9px;font-weight:900;color:rgba(255,255,255,0.6);}
.roy-buy-cost{font-size:9px;font-weight:900;color:#f5e642;}
/* P2 shop (VS mode only, top of screen, rotated for player 2) */
#roy-p2-shop{background:#14162a;border-bottom:1px solid rgba(255,60,60,0.15);padding:10px 12px;display:none;gap:8px;overflow-x:auto;scrollbar-width:none;flex-shrink:0;align-items:center;transform:rotate(180deg);transform-origin:center;}
#roy-p2-shop::-webkit-scrollbar{display:none;}
#roy-gameover{position:absolute;inset:0;background:rgba(0,0,0,0.8);display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;z-index:20;}
#roy-gameover-title{font-size:32px;font-weight:900;color:#fff;}
#roy-gameover-sub{font-size:14px;color:rgba(255,255,255,0.5);}
#roy-play-again{padding:12px 32px;border-radius:14px;border:none;font-size:14px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;background:linear-gradient(90deg,#c03020,#901810);color:#fff;touch-action:none;}
/* Income flash */
.roy-income-flash{position:absolute;font-size:11px;font-weight:900;color:#f5e642;pointer-events:none;animation:royFade .8s ease forwards;z-index:10;}
@keyframes royFade{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-20px)}}
@keyframes royUnitFight{0%,100%{transform:scale(1)}50%{transform:scale(1.3)}}
@keyframes royUnitDie{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(0.3) rotate(45deg)}}
@keyframes royPondHit{0%,100%{background-color:transparent}30%{background-color:rgba(255,60,60,0.3)}}
</style>
<div id="roy" style="display:flex;flex-direction:column;height:100%;">
<div id="roy-header">
<div id="roy-title">🔫 Duck Royale</div>
<button id="roy-back" onclick="window._exitRoyale()">🏠 Menu</button>
</div>
<div id="roy-arena">
<div id="roy-p2-shop">
<div class="roy-coins-lbl" style="font-size:13px;font-weight:900;color:#f5e642;white-space:nowrap;padding-right:4px;">🪙 30</div>
</div>
<div id="roy-enemy-pond">
<div id="roy-enemy-label">Enemy Pond</div>
<div id="roy-enemy-hp-bar"><div id="roy-enemy-hp-fill" style="width:100%"></div></div>
<div id="roy-enemy-count">🦆 20</div>
</div>
<div id="roy-field">
<div id="roy-divider"></div>
<div id="roy-gameover">
<div id="roy-gameover-title">🏆 Victory!</div>
<div id="roy-gameover-sub">You destroyed the enemy pond</div>
<button id="roy-play-again">▶ Play Again</button>
</div>
</div>
<div id="roy-player-pond">
<div id="roy-player-label">Your Pond</div>
<div id="roy-player-hp-bar"><div id="roy-player-hp-fill" style="width:100%"></div></div>
<div id="roy-player-count">🦆 20</div>
</div>
<div id="roy-shop">
<div class="roy-coins-lbl" style="font-size:13px;font-weight:900;color:#f5e642;white-space:nowrap;padding-right:4px;">🪙 30</div>
</div>
</div>
</div>`;
_ba(_royaleEl);
_royaleEl.addEventListener('click', e=>{ e.stopPropagation(); e.stopImmediatePropagation(); });
_royaleEl.addEventListener('touchend', e=>{ e.stopPropagation(); e.stopImmediatePropagation(); });
const fieldEl = _royaleEl.querySelector('#roy-field');
const shopEl = _royaleEl.querySelector('#roy-shop');
const p2ShopEl = _royaleEl.querySelector('#roy-p2-shop');
const enemyHpFill = _royaleEl.querySelector('#roy-enemy-hp-fill');
const enemyCount = _royaleEl.querySelector('#roy-enemy-count');
const playerHpFill= _royaleEl.querySelector('#roy-player-hp-fill');
const playerCount = _royaleEl.querySelector('#roy-player-count');
const gameoverEl = _royaleEl.querySelector('#roy-gameover');
const goTitle = _royaleEl.querySelector('#roy-gameover-title');
const goSub = _royaleEl.querySelector('#roy-gameover-sub');
const playAgainBtn= _royaleEl.querySelector('#roy-play-again');
let vsMode = false;
const modeSelectEl = _ce('div');
modeSelectEl.style.cssText = 'position:absolute;inset:0;background:#0e0f1a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;z-index:30;';
modeSelectEl.innerHTML = `
<div style="font-size:28px;font-weight:900;color:#fff;">🔫 Duck Royale</div>
<div style="font-size:13px;color:rgba(255,255,255,0.4);">Choose your mode</div>
<div style="display:flex;flex-direction:column;gap:12px;width:240px;">
<button id="roy-mode-ai" style="padding:16px;border-radius:16px;border:none;font-size:15px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;background:linear-gradient(90deg,#c03020,#901810);color:#fff;display:flex;align-items:center;justify-content:center;gap:10px;">🤖 vs AI</button>
<button id="roy-mode-vs" style="padding:16px;border-radius:16px;border:1.5px solid rgba(255,255,255,0.15);font-size:15px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;background:#1e2040;color:#fff;display:flex;align-items:center;justify-content:center;gap:10px;">👥 2 Player (Pass & Play)</button>
</div>
<div style="font-size:10px;color:rgba(255,255,255,0.2);text-align:center;max-width:220px;">2 Player: Player 2 uses the top shop, Player 1 uses the bottom</div>
`;
_royaleEl.querySelector('#roy-arena').appendChild(modeSelectEl);
modeSelectEl.querySelector('#roy-mode-ai').addEventListener('pointerdown', e=>{
e.stopPropagation(); vsMode = false;
modeSelectEl.remove();
showMapPicker();
});
modeSelectEl.querySelector('#roy-mode-vs').addEventListener('pointerdown', e=>{
e.stopPropagation(); vsMode = true;
modeSelectEl.remove();
showMapPicker();
});
function buildShopFor(side){
const el = side==='player' ? shopEl : p2ShopEl;
const c = side==='player' ? coins : p2Coins;
const coinsDiv = el.querySelector('.roy-coins-lbl');
if(coinsDiv){ coinsDiv.textContent = '🪙 '+c; }
el.querySelectorAll('.roy-buy-btn').forEach(b=>b.remove());
UNITS.forEach(u=>{
const affordable = c >= u.cost;
const btn = _ce('div');
btn.className = 'roy-buy-btn' + (affordable ? ' affordable' : ' disabled');
btn.innerHTML = `<div class="roy-buy-emoji">${u.emoji}</div><div class="roy-buy-label">${u.label}</div><div class="roy-buy-cost">🪙${u.cost}</div>`;
if(affordable){
btn.addEventListener('pointerdown', ev=>{
ev.stopPropagation();
if(gameOver) return;
if(pendingUnit && pendingUnit.unitId===u.id && pendingUnit.side===(side==='player'?'player':'enemy')){
cancelPlacement(); return;
}
enterPlacementMode(u.id, side==='player'?'player':'enemy');
_qsa('.roy-buy-btn').forEach(b=>b.classList.remove('selected'));
btn.classList.add('selected');
});
}
el.appendChild(btn);
});
}
function buildPrestigeShop(){
 const el=_clickerEl.querySelector('#dck-pshop');if(!el)return;
 if(prestigeTokens===0&&Object.values(pShop).every(v=>v===0)){el.innerHTML='<div style="font-size:11px;color:rgba(255,255,255,0.3);padding:4px 0;">Prestige to earn ⭐ tokens</div>';return;}
 el.innerHTML='';
 const tokDiv=document.createElement('div');tokDiv.style.cssText='font-size:12px;font-weight:900;color:#ffd700;margin-bottom:8px;';tokDiv.textContent='⭐ '+prestigeTokens+' token'+(prestigeTokens!==1?'s':'');el.appendChild(tokDiv);
 (()=>{const id='goldenDuck',cost=2,max=1;const owned=pShop[id]||0;
  const item=document.createElement('div');item.style.cssText='background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:6px 8px;margin-bottom:5px;display:flex;align-items:center;gap:6px;cursor:'+(owned>=max?'default':'pointer')+';;';
  item.innerHTML=`<span style='font-size:16px;'>🥇</span><div style='flex:1'><div style='font-size:11px;font-weight:900;color:#f0e0a0;'>Golden Duck</div><div style='font-size:9px;color:rgba(255,255,255,0.35);'>Your duck turns golden!</div></div><div style='font-size:10px;font-weight:900;color:'+(owned>=max?'rgba(255,255,255,0.25)':'#ffd700')+''>` +(owned>=max?'MAX':'⭐'+cost)+'</div>';
  if(owned<max){item.addEventListener('pointerdown',e=>{e.stopPropagation();if(prestigeTokens<cost)return;
   prestigeTokens-=cost;pShop[id]=(pShop[id]||0)+1;
   if(id==='goldenDuck'){duckEl&&(duckEl.style.filter='drop-shadow(0 0 8px gold)');duckEl&&(duckEl.style.color='#ffd700');}
   _saveState();buildPrestigeShop();updateUI();
  });}
  el.appendChild(item);
 })();
 (()=>{const id='clickBoost',cost=1,max=5;const owned=pShop[id]||0;
  const item=document.createElement('div');item.style.cssText='background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:6px 8px;margin-bottom:5px;display:flex;align-items:center;gap:6px;cursor:'+(owned>=max?'default':'pointer')+';;';
  item.innerHTML=`<span style='font-size:16px;'>👆</span><div style='flex:1'><div style='font-size:11px;font-weight:900;color:#f0e0a0;'>Click Boost</div><div style='font-size:9px;color:rgba(255,255,255,0.35);'>+1 click power permanently</div></div><div style='font-size:10px;font-weight:900;color:'+(owned>=max?'rgba(255,255,255,0.25)':'#ffd700')+''>` +(owned>=max?'MAX':'⭐'+cost)+'</div>';
  if(owned<max){item.addEventListener('pointerdown',e=>{e.stopPropagation();if(prestigeTokens<cost)return;
   prestigeTokens-=cost;pShop[id]=(pShop[id]||0)+1;
   if(id==='goldenDuck'){duckEl&&(duckEl.style.filter='drop-shadow(0 0 8px gold)');duckEl&&(duckEl.style.color='#ffd700');}
   _saveState();buildPrestigeShop();updateUI();
  });}
  el.appendChild(item);
 })();
 (()=>{const id='passiveBoost',cost=2,max=5;const owned=pShop[id]||0;
  const item=document.createElement('div');item.style.cssText='background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:6px 8px;margin-bottom:5px;display:flex;align-items:center;gap:6px;cursor:'+(owned>=max?'default':'pointer')+';;';
  item.innerHTML=`<span style='font-size:16px;'>💰</span><div style='flex:1'><div style='font-size:11px;font-weight:900;color:#f0e0a0;'>Passive Boost</div><div style='font-size:9px;color:rgba(255,255,255,0.35);'>+20% passive income permanently</div></div><div style='font-size:10px;font-weight:900;color:'+(owned>=max?'rgba(255,255,255,0.25)':'#ffd700')+''>` +(owned>=max?'MAX':'⭐'+cost)+'</div>';
  if(owned<max){item.addEventListener('pointerdown',e=>{e.stopPropagation();if(prestigeTokens<cost)return;
   prestigeTokens-=cost;pShop[id]=(pShop[id]||0)+1;
   if(id==='goldenDuck'){duckEl&&(duckEl.style.filter='drop-shadow(0 0 8px gold)');duckEl&&(duckEl.style.color='#ffd700');}
   _saveState();buildPrestigeShop();updateUI();
  });}
  el.appendChild(item);
 })();
 (()=>{const id='autoBuy',cost=3,max=3;const owned=pShop[id]||0;
  const item=document.createElement('div');item.style.cssText='background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:6px 8px;margin-bottom:5px;display:flex;align-items:center;gap:6px;cursor:'+(owned>=max?'default':'pointer')+';;';
  item.innerHTML=`<span style='font-size:16px;'>🤖</span><div style='flex:1'><div style='font-size:11px;font-weight:900;color:#f0e0a0;'>Auto-Clicker</div><div style='font-size:9px;color:rgba(255,255,255,0.35);'>+0.5/sec passive bonus</div></div><div style='font-size:10px;font-weight:900;color:'+(owned>=max?'rgba(255,255,255,0.25)':'#ffd700')+''>` +(owned>=max?'MAX':'⭐'+cost)+'</div>';
  if(owned<max){item.addEventListener('pointerdown',e=>{e.stopPropagation();if(prestigeTokens<cost)return;
   prestigeTokens-=cost;pShop[id]=(pShop[id]||0)+1;
   if(id==='goldenDuck'){duckEl&&(duckEl.style.filter='drop-shadow(0 0 8px gold)');duckEl&&(duckEl.style.color='#ffd700');}
   _saveState();buildPrestigeShop();updateUI();
  });}
  el.appendChild(item);
 })();
 (()=>{const id='startBonus',cost=2,max=3;const owned=pShop[id]||0;
  const item=document.createElement('div');item.style.cssText='background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:6px 8px;margin-bottom:5px;display:flex;align-items:center;gap:6px;cursor:'+(owned>=max?'default':'pointer')+';;';
  item.innerHTML=`<span style='font-size:16px;'>🚀</span><div style='flex:1'><div style='font-size:11px;font-weight:900;color:#f0e0a0;'>Head Start</div><div style='font-size:9px;color:rgba(255,255,255,0.35);'>Start each run with 500 bucks</div></div><div style='font-size:10px;font-weight:900;color:'+(owned>=max?'rgba(255,255,255,0.25)':'#ffd700')+''>` +(owned>=max?'MAX':'⭐'+cost)+'</div>';
  if(owned<max){item.addEventListener('pointerdown',e=>{e.stopPropagation();if(prestigeTokens<cost)return;
   prestigeTokens-=cost;pShop[id]=(pShop[id]||0)+1;
   if(id==='goldenDuck'){duckEl&&(duckEl.style.filter='drop-shadow(0 0 8px gold)');duckEl&&(duckEl.style.color='#ffd700');}
   _saveState();buildPrestigeShop();updateUI();
  });}
  el.appendChild(item);
 })();
}
function buildShop(){
buildShopFor('player');
if(vsMode) buildShopFor('enemy');
}
function showMapPicker(){
const MAPS=[
  {id:'pond',    emoji:'🏞️', name:'Classic Pond',    bg:'linear-gradient(180deg,#091a10,#0e1e16,#091a10)', desc:'Open field. Balanced start.',       glow:'rgba(60,180,80,0.3)'},
  {id:'arctic',  emoji:'❄️', name:'Arctic Tundra',   bg:'linear-gradient(180deg,#080e1a,#0d1832,#080e1a)', desc:'Ice slows all units. Rocks block.',  glow:'rgba(100,180,255,0.3)'},
  {id:'volcano', emoji:'🌋', name:'Volcano Island',  bg:'linear-gradient(180deg,#1a0800,#120600,#1a0800)', desc:'Lava pools damage crossing units.',  glow:'rgba(255,80,0,0.3)'},
  {id:'swamp',   emoji:'🌿', name:'Haunted Swamp',   bg:'linear-gradient(180deg,#070e06,#0a1408,#070e06)', desc:'Mud slows, skulls mark danger zones.',glow:'rgba(80,180,40,0.3)'},
  {id:'desert',  emoji:'🏜️', name:'Desert Oasis',   bg:'linear-gradient(180deg,#1a1000,#1e1400,#1a1000)', desc:'Cacti block paths. Water speeds units.',glow:'rgba(220,180,60,0.3)'},
  {id:'jungle',  emoji:'🌴', name:'Jungle Canopy',  bg:'linear-gradient(180deg,#071008,#0a160a,#071008)', desc:'Dense trees. Narrow lanes.',          glow:'rgba(40,200,80,0.3)'},
];
const wrap=_ce('div');
wrap.style.cssText='position:absolute;inset:0;background:rgba(8,9,20,0.98);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:30;padding:16px;gap:12px;';
wrap.innerHTML=`
<div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:.02em;">🗺️ Choose Your Map</div>
<div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:-6px;">Pick the battlefield before the battle begins</div>
<div id="roy-map-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;max-width:380px;"></div>`;
_royaleEl.querySelector('#roy-arena').appendChild(wrap);
const grid=wrap.querySelector('#roy-map-grid');
MAPS.forEach(m=>{
  const card=_ce('div');
  card.style.cssText=`background:rgba(255,255,255,0.04);border:1.5px solid rgba(255,255,255,0.1);border-radius:14px;padding:14px 12px;cursor:pointer;transition:all .15s;display:flex;flex-direction:column;gap:6px;touch-action:manipulation;`;
  card.innerHTML=`
    <div style="font-size:28px;text-align:center;">${m.emoji}</div>
    <div style="font-size:12px;font-weight:900;color:#fff;text-align:center;">${m.name}</div>
    <div style="font-size:9px;color:rgba(255,255,255,0.38);text-align:center;line-height:1.5;">${m.desc}</div>`;
  card.addEventListener('pointerenter',()=>{
    card.style.border=`1.5px solid ${m.glow}`;
    card.style.background=`rgba(255,255,255,0.08)`;
    card.style.transform='scale(1.03)';
  });
  card.addEventListener('pointerleave',()=>{
    card.style.border='1.5px solid rgba(255,255,255,0.1)';
    card.style.background='rgba(255,255,255,0.04)';
    card.style.transform='';
  });
  function selectMap(){
    currentMap=m.id;
    // Flash selected
    card.style.border=`2px solid ${m.glow}`;
    card.style.background=`rgba(255,255,255,0.12)`;
    setTimeout(()=>{wrap.remove();startGame();},180);
  }
  card.addEventListener('pointerdown',e=>{e.stopPropagation();selectMap();});
  grid.appendChild(card);
});
}

function startGame(){
setupMap();
buildShop();
fieldEl.addEventListener('pointerdown', onFieldTap);
_royaleInterval = setInterval(gameTick, 50);
}
let pendingUnit = null;
let ghostEl = null;
function enterPlacementMode(unitId, side){
cancelPlacement();
pendingUnit = {unitId, side};
const def = UNITS.find(u=>u.id===unitId);
ghostEl = _ce('div');
ghostEl.style.cssText = 'position:absolute;font-size:28px;pointer-events:none;opacity:0.6;z-index:15;transition:left .05s,top .05s;';
ghostEl.textContent = def.emoji;
fieldEl.appendChild(ghostEl);
const fh = fieldEl.getBoundingClientRect().height||200;
fieldEl.style.cursor = 'crosshair';
if(!_royaleEl.querySelector('#roy-place-zone')){
const zone = _ce('div');
zone.id = 'roy-place-zone';
const isPlayer = side==='player';
zone.style.cssText = `position:absolute;left:0;right:0;${isPlayer?'bottom:0;top:50%':'top:0;bottom:50%'};background:${isPlayer?'rgba(60,200,60,0.08)':'rgba(255,60,60,0.08)'};border:1px dashed ${isPlayer?'rgba(60,200,60,0.3)':'rgba(255,60,60,0.3)'};pointer-events:none;z-index:5;`;
fieldEl.appendChild(zone);
}
_qsa('.roy-buy-btn.selected').forEach(b=>b.classList.remove('selected'));
}
function cancelPlacement(){
pendingUnit = null;
if(ghostEl){ ghostEl.remove(); ghostEl = null; }
const zone = _royaleEl.querySelector('#roy-place-zone');
if(zone) zone.remove();
fieldEl.style.cursor = '';
}
function onFieldTap(e){
e.stopPropagation();
if(!pendingUnit) return;
const rect = fieldEl.getBoundingClientRect();
const x = e.clientX - rect.left;
const y = e.clientY - rect.top;
const fh = rect.height;
const validPlayer = pendingUnit.side==='player' && y > fh*0.5;
const validEnemy = pendingUnit.side==='enemy' && y < fh*0.5;
if(!validPlayer && !validEnemy) return;
const def = UNITS.find(u=>u.id===pendingUnit.unitId);
if(pendingUnit.side==='player'){
if(coins < def.cost){ cancelPlacement(); return; }
coins -= def.cost;
} else {
if(p2Coins < def.cost){ cancelPlacement(); return; }
p2Coins -= def.cost;
}
spawnUnitAt(pendingUnit.unitId, pendingUnit.side, x, y);
if(window._challengeEvent){
window._challengeEvent('royale_deploy');
if(pendingUnit.unitId==='bear') window._challengeEvent('royale_bear');
}
cancelPlacement();
buildShop();
}
fieldEl.addEventListener('pointermove', e=>{
if(!ghostEl) return;
const rect = fieldEl.getBoundingClientRect();
ghostEl.style.left = (e.clientX - rect.left - 14)+'px';
ghostEl.style.top = (e.clientY - rect.top - 14)+'px';
});
function spawnUnitAt(unitId, side, x, y){
const def = UNITS.find(u=>u.id===unitId);
const el = _ce('div');
el.className = 'roy-unit' + (side==='enemy'?' enemy':'');
el.innerHTML = `${def.emoji}<div class="roy-unit-hp"><div class="roy-unit-hp-fill" style="width:100%"></div></div>`;
el.style.left = x+'px';
el.style.top = y+'px';
fieldEl.appendChild(el);
const unit = {id:uid++, unitId, side, x, y, hp:def.hp, maxHp:def.hp, def, el, attackCooldown:0};
units.push(unit);
}
function spawnUnit(unitId, side){
const fieldRect = fieldEl.getBoundingClientRect();
const fw = fieldRect.width||300;
const fh = fieldRect.height||200;
const startX = fw * 0.1 + _mr() * fw * 0.8;
const startY = side==='player' ? fh * 0.85 : fh * 0.08;
spawnUnitAt(unitId, side, startX, startY);
}
function setupMap(){
const fw=fieldEl.getBoundingClientRect().width||300,fh=fieldEl.getBoundingClientRect().height||200;
mapObstacles.forEach(o=>{if(o.el)o.el.remove();});mapObstacles=[];
fieldEl.querySelectorAll('.roy-ob').forEach(e=>e.remove());
const ob=(txt,x,y,r,extra)=>{
  const e=_ce('div');e.className='roy-ob';
  e.style.cssText=`position:absolute;left:${x-r}px;top:${y-r}px;width:${r*2}px;height:${r*2}px;font-size:${_mf(r*1.4)}px;line-height:${r*2}px;text-align:center;z-index:3;pointer-events:none;${extra||''}`;
  e.textContent=txt;fieldEl.appendChild(e);return{x,y,r:r*0.7,el:e};
};
const MAPS_BG={
  pond:   'linear-gradient(180deg,#091a10 0%,#0e1e16 50%,#091a10 100%)',
  arctic: 'linear-gradient(180deg,#080e1a 0%,#0d1832 50%,#080e1a 100%)',
  volcano:'linear-gradient(180deg,#1a0800 0%,#120600 50%,#1a0800 100%)',
  swamp:  'linear-gradient(180deg,#070e06 0%,#0a1408 50%,#070e06 100%)',
  desert: 'linear-gradient(180deg,#1a1000 0%,#1e1400 50%,#1a1000 100%)',
  jungle: 'linear-gradient(180deg,#071008 0%,#0a160a 50%,#071008 100%)',
};
fieldEl.style.background=MAPS_BG[currentMap]||MAPS_BG.pond;

if(currentMap==='pond'){
  // Subtle lily pads
  [[.3,.42],[.68,.38],[.5,.55]].forEach(([px,py])=>ob('🌿',px*fw,py*fh,10));

} else if(currentMap==='arctic'){
  // Ice patches (slow) + rock blockers
  if(!document.getElementById('roy-lava-css')){const s=_ce('style');s.id='roy-lava-css';s.textContent='@keyframes lavaPulse{0%,100%{opacity:.65;transform:scale(1)}50%{opacity:.9;transform:scale(1.1)}}';document.head.appendChild(s);}
  [[.22,.38],[.55,.3],[.75,.55],[.38,.62],[.14,.52]].forEach(([px,py])=>{
    const e=_ce('div');e.className='roy-ob';
    const x=px*fw,y=py*fh;
    e.style.cssText=`position:absolute;left:${x-26}px;top:${y-20}px;width:52px;height:40px;border-radius:50%;background:radial-gradient(circle,rgba(160,230,255,0.25),rgba(100,180,255,0.06));border:1px solid rgba(180,230,255,0.2);z-index:1;pointer-events:none;`;
    fieldEl.appendChild(e);mapObstacles.push({x,y,r:22,el:e,slow:true});
  });
  [[.45,.44],[.62,.36],[.3,.6]].forEach(([px,py])=>mapObstacles.push(ob('🪨',px*fw,py*fh,14)));
  // Snowflakes
  [[.1,.3],[.9,.4],[.5,.2],[.15,.7],[.85,.7]].forEach(([px,py])=>ob('❄️',px*fw,py*fh,8,'opacity:0.4;'));

} else if(currentMap==='volcano'){
  if(!document.getElementById('roy-lava-css')){const s=_ce('style');s.id='roy-lava-css';s.textContent='@keyframes lavaPulse{0%,100%{opacity:.65;transform:scale(1)}50%{opacity:.9;transform:scale(1.1)}}';document.head.appendChild(s);}
  [[.28,.44],[.68,.54],[.5,.35]].forEach(([px,py])=>{
    const e=_ce('div');e.className='roy-ob';
    const x=px*fw,y=py*fh;
    e.style.cssText=`position:absolute;left:${x-32}px;top:${y-22}px;width:64px;height:44px;border-radius:50%;background:radial-gradient(circle,#ff7000 20%,#c02000 80%);opacity:.8;z-index:2;pointer-events:none;box-shadow:0 0 18px 6px rgba(255,80,0,.5);animation:lavaPulse 1.6s ease-in-out infinite;`;
    fieldEl.appendChild(e);mapObstacles.push({x,y,r:26,el:e,lava:true});
  });
  [[.15,.38],[.82,.42]].forEach(([px,py])=>mapObstacles.push(ob('🪨',px*fw,py*fh,13)));
  ob('🌋',fw*0.5,fh*0.5,18,'opacity:0.3;');

} else if(currentMap==='swamp'){
  // Mud patches (slow) + skull markers
  [[.3,.4],[.65,.5],[.45,.35],[.2,.6],[.75,.38]].forEach(([px,py])=>{
    const e=_ce('div');e.className='roy-ob';
    const x=px*fw,y=py*fh;
    e.style.cssText=`position:absolute;left:${x-24}px;top:${y-18}px;width:48px;height:36px;border-radius:50%;background:radial-gradient(circle,rgba(60,100,30,0.5),rgba(30,60,10,0.15));border:1px solid rgba(80,140,40,0.2);z-index:1;pointer-events:none;`;
    fieldEl.appendChild(e);mapObstacles.push({x,y,r:22,el:e,slow:true});
  });
  [[.18,.48],[.78,.42],[.5,.28]].forEach(([px,py])=>ob('💀',px*fw,py*fh,10,'opacity:0.5;'));
  [[.38,.58],[.62,.36]].forEach(([px,py])=>ob('🌿',px*fw,py*fh,12));

} else if(currentMap==='desert'){
  // Cacti (block) + oasis patches (speed boost marker)
  [[.22,.36],[.72,.44],[.48,.28],[.3,.6],[.68,.6]].forEach(([px,py])=>mapObstacles.push(ob('🌵',px*fw,py*fh,14)));
  // Oasis (water speedup)
  [[.5,.5]].forEach(([px,py])=>{
    const e=_ce('div');e.className='roy-ob';
    const x=px*fw,y=py*fh;
    e.style.cssText=`position:absolute;left:${x-28}px;top:${y-20}px;width:56px;height:40px;border-radius:50%;background:radial-gradient(circle,rgba(60,160,220,0.3),rgba(20,80,140,0.08));border:1px solid rgba(80,160,220,0.2);z-index:1;pointer-events:none;`;
    fieldEl.appendChild(e);mapObstacles.push({x,y,r:24,el:e,fast:true});
  });
  [[.15,.5],[.85,.5]].forEach(([px,py])=>ob('☀️',px*fw,py*fh,10,'opacity:0.3;'));

} else if(currentMap==='jungle'){
  // Dense tree clusters — creates narrow lanes
  [[.15,.3],[.18,.45],[.14,.6],
   [.82,.32],[.85,.48],[.8,.62],
   [.48,.25],[.52,.25],
   [.35,.52],[.65,.52]].forEach(([px,py])=>mapObstacles.push(ob('🌴',px*fw,py*fh,14)));
  [[.3,.38],[.7,.42]].forEach(([px,py])=>ob('🌿',px*fw,py*fh,10));
}
}

function updateUnitHp(unit){
const fill = unit.el.querySelector('.roy-unit-hp-fill');
if(fill) fill.style.width = _mx(0, unit.hp/unit.maxHp*100) + '%';
}
function removeUnit(unit){
unit.el.style.animation = 'royUnitDie 0.3s ease forwards';
setTimeout(()=>unit.el.remove(), 300);
units = units.filter(u=>u.id!==unit.id);
}
function hitPond(side, dmg){
dmg=dmg||1;
if(side==='enemy'){
enemyPond = _mx(0, enemyPond-dmg);
coins += dmg;
_royaleEl.querySelector('#roy-enemy-pond').style.animation='royPondHit 0.4s ease';
setTimeout(()=>{ _royaleEl.querySelector('#roy-enemy-pond').style.animation=''; }, 400);
} else {
playerPond = _mx(0, playerPond-dmg);
_royaleEl.querySelector('#roy-player-pond').style.animation='royPondHit 0.4s ease';
setTimeout(()=>{ _royaleEl.querySelector('#roy-player-pond').style.animation=''; }, 400);
}
updatePondUI();
checkGameOver();
}
function updatePondUI(){
enemyHpFill.style.width = (enemyPond/20*100)+'%';
enemyCount.textContent = '🦆 '+enemyPond;
playerHpFill.style.width = (playerPond/20*100)+'%';
playerCount.textContent = '🦆 '+playerPond;
}
function checkGameOver(){
if(gameOver) return;
if(enemyPond <= 0){
gameOver = true;
goTitle.textContent = vsMode ? '🏆 Player 1 Wins!' : '🏆 Victory!';
if(!vsMode && window._challengeEvent) window._challengeEvent('royale_win');
goSub.textContent = vsMode ? 'Player 2\'s pond was destroyed!' : 'You destroyed the enemy pond!';
gameoverEl.style.display = 'flex';
} else {
// Lava damage each tick
mapObstacles.filter(o=>o.lava).forEach(o=>{
 units.forEach(u=>{
  const dx=u.x-o.x,dy=u.y-o.y;
  if(dx*dx+dy*dy<o.r*o.r&&tickCount%18===0){u.hp-=1;updateUnitHp(u);
   if(u.hp<=0&&units.includes(u)){removeUnit(u);buildShop();}
  }
 });
});}
if(false){}else if(playerPond <= 0){
gameOver = true;
goTitle.textContent = vsMode ? '🏆 Player 2 Wins!' : '💀 Defeated';
goSub.textContent = vsMode ? 'Player 1\'s pond was destroyed!' : 'Your pond was destroyed...';
gameoverEl.style.display = 'flex';
}
}
playAgainBtn.addEventListener('pointerdown', e=>{
e.stopPropagation();
cancelPlacement();
coins = 30; p2Coins = 30; aiCoins = 20; income = 2;
playerPond = 20; enemyPond = 20;
units.forEach(u=>u.el.remove()); units = [];
uid = 0; gameOver = false; aiTimer = 0; tickCount = 0;
gameoverEl.style.display = 'none';
updatePondUI(); buildShop();
if(_royaleInterval) clearInterval(_royaleInterval);
fieldEl.removeEventListener('pointerdown', onFieldTap);
fieldEl.addEventListener('pointerdown', onFieldTap);
_royaleInterval = setInterval(gameTick, 50);
});
const AI_WEIGHTS = [
{id:'duck', w:4}, {id:'duckling', w:5}, {id:'fox', w:3},
{id:'wolf', w:2}, {id:'eagle', w:3}, {id:'bear', w:1}, {id:'lion', w:1}
];
function aiPickUnit(){
const affordable = AI_WEIGHTS.filter(w=>{ const u=UNITS.find(u=>u.id===w.id); return u&&aiCoins>=u.cost; });
if(!affordable.length) return null;
const total = affordable.reduce((s,w)=>s+w.w,0);
let r = _mr()*total;
for(const w of affordable){ r-=w.w; if(r<=0) return w.id; }
return affordable[0].id;
}
function showIncomeFlash(){
const f = _ce('div');
f.className = 'roy-income-flash';
f.textContent = '+'+income+'🪙';
f.style.left = '16px';
f.style.bottom = '16px';
fieldEl.appendChild(f);
setTimeout(()=>f.remove(), 800);
}
let tickCount = 0;
function gameTick(){
if(gameOver) return;
const fieldRect = fieldEl.getBoundingClientRect();
const fw = fieldRect.width||300;
const fh = fieldRect.height||200;
tickCount++;
if(tickCount % 40 === 0){
coins += income;
p2Coins += income;
if(!vsMode) aiCoins += income;
showIncomeFlash();
if(tickCount % 400 === 0 && income < 8) income++;
buildShop();
}
if(!vsMode){
aiTimer++;
const aiInterval = _mx(30, 80 - tickCount/100);
if(aiTimer >= aiInterval){
aiTimer = 0;
const unitId = aiPickUnit();
if(unitId){
const u = UNITS.find(u=>u.id===unitId);
aiCoins -= u.cost;
spawnUnit(unitId, 'enemy');
}
}
}
const playerUnits = units.filter(u=>u.side==='player');
const enemyUnits = units.filter(u=>u.side==='enemy');
units.forEach(unit=>{
if(!units.includes(unit)) return;
unit.attackCooldown = _mx(0, (unit.attackCooldown||0)-1);
const opponents = unit.side==='player' ? enemyUnits : playerUnits;
let nearest = null, nearestDist = Infinity;
opponents.forEach(op=>{
if(!units.includes(op)) return;
const dx = unit.x - op.x, dy = unit.y - op.y;
const d = _ms(dx*dx + dy*dy);
if(d < nearestDist){ nearestDist = d; nearest = op; }
});
const attackRange = 28;
const detectionRange = 110;
if(nearest && nearestDist < detectionRange){
if(nearestDist > attackRange){
const dx = nearest.x - unit.x, dy = nearest.y - unit.y;
const mag = _ms(dx*dx+dy*dy);
let mx=(dx/mag)*unit.def.speed*0.55,my=(dy/mag)*unit.def.speed*0.55;
let slowMult=1;
mapObstacles.forEach(o=>{
 const ox=o.x-unit.x,oy=o.y-unit.y,od=_ms(ox*ox+oy*oy);
 if(o.slow&&od<o.r+10)slowMult=0.45;
 else if(!o.lava&&!o.slow&&od<o.r+14){const push=1-od/(o.r+14);mx-=ox/od*push*1.8;my-=oy/od*push*1.8;}
});
unit.x+=mx*slowMult;unit.y+=my*slowMult;
unit.el.style.left=unit.x+'px';
unit.el.style.top=unit.y+'px';
} else {
if(unit.attackCooldown <= 0 && units.includes(nearest)){
nearest.hp -= unit.def.dmg;
unit.attackCooldown = 18;
updateUnitHp(nearest);
unit.el.style.transform = 'scale(1.25)';
setTimeout(()=>{ if(unit.el) unit.el.style.transform=''; }, 150);
if(nearest.hp <= 0 && units.includes(nearest)){
if(nearest.side==='enemy') coins += nearest.def.reward;
else if(vsMode) p2Coins += nearest.def.reward;
removeUnit(nearest);
buildShop();
}
}
}
} else {
const targetY = unit.side==='player' ? fh*0.06 : fh*0.90;
const dy = targetY - unit.y;
const distY = _ma(dy);
if(distY < 5){
removeUnit(unit);
hitPond(unit.side==='player' ? 'enemy' : 'player', unit.pondDmg||1);
return;
}
unit.y += (dy/distY) * unit.def.speed * 0.55;
unit.el.style.left = unit.x+'px';
unit.el.style.top = unit.y+'px';
}
});
const p1lbl = shopEl.querySelector('.roy-coins-lbl');
const p2lbl = p2ShopEl.querySelector('.roy-coins-lbl');
if(p1lbl) p1lbl.textContent = '🪙 '+coins;
if(p2lbl) p2lbl.textContent = '🪙 '+p2Coins;
}
}
})();
(()=>{
let _defEl=null, _defInterval=null;
window._launchDefence = function(){
window.paused = true;
window._menuEl.style.display = 'none';
if(window._homeBtn) window._homeBtn.style.display = '';
window._defenceActive = true;
if(_defEl){ _defEl.remove(); _defEl=null; }
if(_defInterval){ clearInterval(_defInterval); _defInterval=null; }
_buildDefence();
};
window._exitDefence = function(){
window._defenceActive = false;
window.paused = false;
if(_defEl){ _defEl.remove(); _defEl=null; window._defenceEl=null; }
if(_defInterval){ clearInterval(_defInterval); _defInterval=null; }
if(window._menuEl)window._menuEl.style.display = 'flex';
if(window._randomiseFeatured) window._randomiseFeatured();
if(window._homeBtn) window._homeBtn.style.display = 'none';
};
function _buildDefence(){
const COLS=9, ROWS=12;
const PATH=[
[4,0],[4,1],[4,2],
[3,2],[2,2],[1,2],
[1,3],[1,4],[1,5],
[2,5],[3,5],[4,5],[5,5],[6,5],[7,5],
[7,6],[7,7],[7,8],
[6,8],[5,8],[4,8],[3,8],[2,8],[1,8],
[1,9],[1,10],
[2,10],[3,10],[4,10],[4,11]
];
const PATH_SET = new Set(PATH.map(([c,r])=>c+','+r));
function isPath(c,r){ return PATH_SET.has(c+','+r); }
function isPond(c,r){ return c===4 && r===11; }
const TOWERS=[
{id:'duckling',emoji:'🐥',label:'Duckling', cost:15, dmg:3, range:1.5,rate:20,shot:'·'},
{id:'duck', emoji:'🦆',label:'Duck', cost:30, dmg:8, range:2.5,rate:55,shot:'🪶'},
{id:'swan', emoji:'🦢',label:'Swan', cost:50, dmg:12, range:2.8,rate:55,shot:'🌀',slow:true},
{id:'eagle', emoji:'🦅',label:'Eagle', cost:60, dmg:15, range:3.5,rate:45,shot:'🏹'},
{id:'fox', emoji:'🦊',label:'Fox', cost:65, dmg:14, range:2.2,rate:30,shot:'🔥',burn:true},
{id:'snake', emoji:'🐍',label:'Snake', cost:55, dmg:8, range:2.0,rate:25,shot:'🟢',poison:true},
{id:'wolf', emoji:'🐺',label:'Wolf', cost:80, dmg:20, range:2.0,rate:35,shot:'🦷'},
{id:'bat', emoji:'🦇',label:'Bat', cost:70, dmg:10, range:2.5,rate:30,shot:'💜',multi:3},
{id:'lion', emoji:'🦁',label:'Lion', cost:100,dmg:28, range:2.2,rate:40,shot:'💢'},
{id:'bear', emoji:'🐻',label:'Bear', cost:120,dmg:40, range:1.8,rate:80,shot:'🐾'},
{id:'zombie', emoji:'🧟',label:'Zombie', cost:90, dmg:25, range:1.5,rate:45,shot:'🟢',poison:true},
{id:'owl', emoji:'🦉',label:'Owl', cost:110,dmg:18, range:4.0,rate:50,shot:'👁️'},
{id:'octopus', emoji:'🐙',label:'Octopus', cost:140,dmg:12, range:2.5,rate:20,shot:'🌊',multi:8},
{id:'dragon', emoji:'🐉',label:'Dragon', cost:200,dmg:80, range:3.0,rate:50,shot:'🔥',aoe:true},
{id:'alien', emoji:'👽',label:'Alien', cost:250,dmg:60, range:4.0,rate:40,shot:'🟣'},
{id:'kraken', emoji:'🦑',label:'Kraken', cost:280,dmg:50, range:3.5,rate:35,shot:'💙',multi:4,slow:true},
{id:'zeus_t', emoji:'⚡',label:'Zeus', cost:300,dmg:100,range:3.5,rate:70,shot:'⚡',chain:5},
];
const ENEMIES=[
{id:'duckling', emoji:'🐥',hp:10, spd:2.5,reward:3, label:'Duckling'},
{id:'rabbit', emoji:'🐇',hp:15, spd:3.5,reward:4, label:'Rabbit'},
{id:'fox', emoji:'🦊',hp:30, spd:1.2,reward:5, label:'Fox'},
{id:'snake', emoji:'🐍',hp:20, spd:2.0,reward:6, label:'Snake'},
{id:'bat', emoji:'🦇',hp:35, spd:2.2,reward:8, label:'Bat'},
{id:'eagle', emoji:'🦅',hp:45, spd:1.8,reward:9, label:'Eagle'},
{id:'wolf', emoji:'🐺',hp:60, spd:1.0,reward:10, label:'Wolf'},
{id:'boar', emoji:'🐗',hp:80, spd:1.3,reward:12, label:'Boar'},
{id:'zombie', emoji:'🧟',hp:80, spd:0.6,reward:12, label:'Zombie',regen:2},
{id:'lion', emoji:'🦁',hp:90, spd:1.1,reward:15, label:'Lion'},
{id:'bear', emoji:'🐻',hp:120, spd:0.7,reward:18, label:'Bear'},
{id:'gorilla', emoji:'🦍',hp:150, spd:0.8,reward:22, label:'Gorilla'},
{id:'alien', emoji:'👽',hp:55, spd:2.5,reward:14, label:'Alien'},
{id:'rhino', emoji:'🦏',hp:250, spd:0.6,reward:35, label:'Rhino'},
{id:'dragon', emoji:'🐲',hp:200, spd:0.8,reward:40, label:'Dragon'},
{id:'yeti', emoji:'🧊',hp:400, spd:0.4,reward:60, label:'YETI BOSS'},
{id:'zombie_boss',emoji:'🧟',hp:350,spd:0.5,reward:50, label:'ZOMBIE BOSS',regen:5},
{id:'dragon_boss',emoji:'🐉',hp:500,spd:0.7,reward:80, label:'DRAGON BOSS'},
{id:'alien_boss', emoji:'👾',hp:450,spd:1.0,reward:80, label:'ALIEN BOSS'},
];
const UPGRADES=[
{id:'dmg2', label:'+50% DMG', cost:40, apply:t=>{t.dmg=_mf(t.dmg*1.5);}},
{id:'rng2', label:'+1 Range', cost:40, apply:t=>{t.range+=1;}},
{id:'spd2', label:'+30% Spd', cost:50, apply:t=>{t.rate=_mf(t.rate*0.7);}},
{id:'dmg3', label:'+100% DMG', cost:80, apply:t=>{t.dmg=_mf(t.dmg*2);}},
];
const ABILITIES=[
{id:'bomb', emoji:'💣',label:'Bomb', cost:40,cd:300,desc:'AOE 80 dmg'},
{id:'freeze',emoji:'❄️',label:'Freeze',cost:30,cd:400,desc:'Slow 3s'},
{id:'zeus', emoji:'⚡',label:'Zeus', cost:60,cd:500,desc:'Chain 5'},
];
const MAX_TOWERS=20;
let gameSpeed=1, autoWave=false, autoWaveTimer=0;
let blockedCells=new Map();
let grid={}, enemies=[], coins=80, pondHp=20, wave=0;
let waveActive=false, spawnQueue=[], spawnTimer=0;
let selectedTowerDef=null, selectedKey=null;
let abilityCds={}, frozen=false, frozenTick=0;
let uid=0, eid=0, towerTick={}, gameOver=false;
_defEl = _ce('div');
_defEl.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000085;background:#06080f;display:flex;flex-direction:column;font-family:Nunito,sans-serif;';
window._defenceEl = _defEl;
_defEl.innerHTML=`
<style>
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Nunito:wght@700;800;900&display=swap');
:root{
--def-bg:#06080f;
--def-bg2:#0b0e1a;
--def-bg3:#0f1325;
--def-accent:#00e5ff;
--def-accent2:#ff00c8;
--def-gold:#ffe500;
--def-green:#00ff88;
--def-red:#ff3060;
--def-border:rgba(0,229,255,0.15);
--def-border2:rgba(0,229,255,0.35);
--def-glow:0 0 12px rgba(0,229,255,0.4);
--def-font:'Nunito',sans-serif;
--def-font2:'Orbitron','Nunito',sans-serif;
}
#def *{box-sizing:border-box;}
#def-header{
background:var(--def-bg2);
height:50px;display:flex;align-items:center;padding:0 12px;gap:8px;
border-bottom:1px solid var(--def-border2);flex-shrink:0;
box-shadow:0 1px 0 rgba(0,229,255,0.08),0 4px 24px rgba(0,0,0,0.6);
}
#def-back{
background:rgba(0,229,255,0.08);border:1px solid var(--def-border2);
color:var(--def-accent);font-size:11px;font-weight:900;
padding:5px 10px;border-radius:8px;cursor:pointer;
font-family:var(--def-font);letter-spacing:.02em;
transition:background .15s,box-shadow .15s;
}
#def-back:hover{background:rgba(0,229,255,0.18);box-shadow:var(--def-glow);}
.def-stat{
font-size:12px;font-weight:900;color:#fff;font-family:var(--def-font2);
letter-spacing:.03em;
}
.def-stat em{color:rgba(0,229,255,0.45);font-style:normal;font-size:10px;}
#def-status{flex:1;font-size:10px;color:rgba(0,229,255,0.45);font-weight:700;text-align:right;font-family:var(--def-font);letter-spacing:.04em;text-transform:uppercase;}
#def-main{flex:1;display:flex;overflow:hidden;}
#def-field{
flex:1;display:flex;align-items:center;justify-content:center;
overflow:hidden;padding:4px;position:relative;
background:radial-gradient(ellipse at 50% 60%, #0a1520 0%, var(--def-bg) 100%);
}
#def-grid{display:grid;position:relative;}
.def-cell{position:relative;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.def-cell.grass{
background:#060d0a;
border:1px solid rgba(0,255,136,0.04);
transition:background .12s;
}
.def-cell.grass:hover{background:#0a1a12;border-color:rgba(0,255,136,0.18);}
.def-cell.path{
background:linear-gradient(135deg,#0c100a 0%,#0f1508 100%);
cursor:default;
border:1px solid rgba(255,229,0,0.06);
}
.def-cell.pond{
background:radial-gradient(ellipse at 50% 50%,#0a2040 0%,#050d1a 100%);
cursor:default;
border:1px solid rgba(0,100,255,0.25);
box-shadow:inset 0 0 12px rgba(0,150,255,0.2);
}
.def-cell.spawn{
background:linear-gradient(135deg,#1a0008 0%,#200a0a 100%);
border:1px solid rgba(255,0,60,0.2)!important;
}
.def-cell.blocked{
background:#060c0a;cursor:not-allowed;
border:1px solid rgba(255,255,255,0.03);
}
.def-cell.sel{
outline:2px solid var(--def-gold);
outline-offset:-2px;
box-shadow:inset 0 0 8px rgba(255,229,0,0.2),0 0 12px rgba(255,229,0,0.3);
}
.def-tower-icon{font-size:18px;line-height:1;pointer-events:none;filter:drop-shadow(0 0 4px rgba(0,229,255,0.5));}
.def-pond-icon{font-size:20px;line-height:1;pointer-events:none;filter:drop-shadow(0 0 8px rgba(0,180,255,0.8));}
/* right panel */
#def-right{
width:130px;
background:var(--def-bg2);
border-left:1px solid var(--def-border2);
display:flex;flex-direction:column;overflow:hidden;flex-shrink:0;
touch-action:pan-y;
}
#def-right-scroll{
flex:1;overflow-y:auto;
scrollbar-width:thin;scrollbar-color:rgba(0,229,255,0.15) transparent;
-webkit-overflow-scrolling:touch;touch-action:pan-y;
}
#def-right-scroll::-webkit-scrollbar{width:3px;}
#def-right-scroll::-webkit-scrollbar-thumb{background:rgba(0,229,255,0.2);border-radius:3px;}
.def-sec{
font-size:9px;font-weight:900;
color:var(--def-accent);
letter-spacing:.14em;text-transform:uppercase;
padding:10px 8px 5px;
font-family:var(--def-font2);
border-bottom:1px solid var(--def-border);
margin-bottom:3px;
}
.def-tbtn{
margin:3px 5px;padding:7px 8px;
background:rgba(0,229,255,0.04);
border-radius:8px;
border:1px solid var(--def-border);
cursor:pointer;display:flex;align-items:center;gap:6px;
transition:all .13s;
}
.def-tbtn:hover{background:rgba(0,229,255,0.1);border-color:var(--def-border2);}
.def-tbtn.active{
border-color:var(--def-gold);
background:rgba(255,229,0,0.08);
box-shadow:0 0 10px rgba(255,229,0,0.2);
}
.def-tbtn.dim{opacity:0.32;cursor:default;}
.def-te{font-size:17px;flex-shrink:0;filter:drop-shadow(0 0 3px rgba(0,229,255,0.4));}
.def-ti{flex:1;min-width:0;}
.def-tn{font-size:10px;font-weight:900;color:#e8f4ff;white-space:nowrap;overflow:hidden;font-family:var(--def-font);}
.def-tc{font-size:9px;color:var(--def-gold);font-weight:900;font-family:var(--def-font2);}
.def-abtn{
margin:3px 5px;padding:7px 8px;
background:rgba(255,0,200,0.05);
border-radius:8px;
border:1px solid rgba(255,0,200,0.18);
cursor:pointer;display:flex;align-items:center;gap:6px;
transition:all .13s;
}
.def-abtn:hover{background:rgba(255,0,200,0.12);border-color:rgba(255,0,200,0.4);}
.def-abtn.dim{opacity:0.35;cursor:default;}
#def-wavebtn{
margin:0;padding:12px;border-radius:0;border:none;
border-top:1px solid var(--def-border2);
font-size:12px;font-weight:900;cursor:pointer;
font-family:var(--def-font2);letter-spacing:.06em;text-transform:uppercase;
background:linear-gradient(90deg,#007a40,#005530);
color:var(--def-green);
text-shadow:0 0 8px rgba(0,255,136,0.6);
transition:background .15s;
}
#def-wavebtn:hover{background:linear-gradient(90deg,#00a050,#007540);}
#def-wavebtn.pulse{animation:defPulse 1.6s ease-in-out infinite;}
@keyframes defPulse{
0%,100%{box-shadow:0 0 8px rgba(0,255,136,0.3);}
50%{box-shadow:0 0 22px rgba(0,255,136,0.7),0 0 40px rgba(0,255,136,0.2);}
}
#def-speed-btn{
background:rgba(0,229,255,0.07);border:1px solid var(--def-border2);
color:var(--def-accent);font-size:10px;font-weight:900;
padding:4px 8px;border-radius:7px;cursor:pointer;font-family:var(--def-font2);
letter-spacing:.04em;transition:all .13s;
}
#def-speed-btn.active{
background:rgba(255,229,0,0.15);border-color:rgba(255,229,0,0.5);color:var(--def-gold);
box-shadow:0 0 8px rgba(255,229,0,0.25);
}
#def-auto-btn{
background:rgba(0,229,255,0.07);border:1px solid var(--def-border2);
color:var(--def-accent);font-size:10px;font-weight:900;
padding:4px 8px;border-radius:7px;cursor:pointer;font-family:var(--def-font2);
letter-spacing:.04em;transition:all .13s;
}
#def-auto-btn.active{
background:rgba(0,255,136,0.15);border-color:rgba(0,255,136,0.5);color:var(--def-green);
box-shadow:0 0 8px rgba(0,255,136,0.25);
}
.def-stat-cap{font-size:10px;font-weight:900;color:rgba(0,229,255,0.6);font-family:var(--def-font2);}
/* enemies */
.def-enemy{position:absolute;font-size:15px;line-height:1;pointer-events:none;z-index:5;}
.def-ehp{position:absolute;bottom:-2px;left:50%;transform:translateX(-50%);width:22px;height:3px;background:rgba(0,0,0,0.7);border-radius:2px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);}
.def-ehpf{height:100%;background:linear-gradient(90deg,var(--def-red),#ff8060);border-radius:2px;}
.def-shot{position:absolute;font-size:10px;pointer-events:none;z-index:6;transform-origin:center;will-change:left,top,opacity,transform;}
/* game over */
#def-gameover{
position:absolute;inset:0;
background:rgba(0,0,0,0.88);
backdrop-filter:blur(6px);
display:none;flex-direction:column;align-items:center;justify-content:center;
gap:14px;z-index:20;
}
#def-gameover h2{
font-size:26px;font-weight:900;
color:var(--def-red);
margin:0;font-family:var(--def-font2);letter-spacing:.06em;
text-shadow:0 0 20px rgba(255,48,96,0.7);
}
#def-gameover p{font-size:12px;color:rgba(0,229,255,0.6);margin:0;font-family:var(--def-font2);letter-spacing:.06em;}
#def-restart{
padding:12px 28px;border-radius:12px;border:none;
font-size:13px;font-weight:900;cursor:pointer;
font-family:var(--def-font2);letter-spacing:.06em;text-transform:uppercase;
background:linear-gradient(90deg,#007a40,#004428);
color:var(--def-green);
text-shadow:0 0 8px rgba(0,255,136,0.5);
box-shadow:0 0 20px rgba(0,255,136,0.25);
touch-action:none;transition:box-shadow .15s;
}
#def-restart:hover{box-shadow:0 0 30px rgba(0,255,136,0.5);}
#def-freeze-bg{
position:absolute;inset:0;
background:linear-gradient(135deg,rgba(0,200,255,0.06),rgba(100,230,255,0.04));
backdrop-filter:blur(1px);
pointer-events:none;z-index:4;display:none;
}
/* tower popup */
#def-tower-popup{
position:absolute;z-index:15;
background:rgba(8,12,26,0.97);
border:1px solid var(--def-border2);
border-radius:14px;padding:11px 13px;
min-width:175px;max-width:225px;
box-shadow:0 8px 40px rgba(0,0,0,0.8),0 0 0 1px rgba(0,229,255,0.08),var(--def-glow);
display:none;pointer-events:auto;
backdrop-filter:blur(8px);
}
#dtp-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;}
#dtp-title{font-size:11px;font-weight:900;color:var(--def-accent);font-family:var(--def-font2);letter-spacing:.04em;}
#dtp-close{
background:rgba(0,229,255,0.08);border:1px solid var(--def-border);
color:var(--def-accent);font-size:10px;font-weight:900;
width:20px;height:20px;border-radius:5px;cursor:pointer;
display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;
font-family:var(--def-font);
}
#dtp-stats{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:9px;}
.dtp-pill{
font-size:9px;font-weight:900;padding:3px 7px;border-radius:6px;
background:rgba(0,229,255,0.07);border:1px solid var(--def-border);
color:rgba(0,229,255,0.8);white-space:nowrap;
font-family:var(--def-font2);letter-spacing:.03em;
}
.dtp-pill.trait{background:rgba(255,180,50,0.1);border-color:rgba(255,180,50,0.3);color:#ffb432;}
#dtp-upgrades{display:flex;flex-direction:column;gap:5px;margin-bottom:8px;}
.dtp-upg-btn{
padding:6px 8px;
background:rgba(0,229,255,0.06);
border-radius:8px;cursor:pointer;
font-size:9px;font-weight:900;
color:rgba(0,229,255,0.8);
border:1px solid var(--def-border);
text-align:left;font-family:var(--def-font);
transition:all .12s;
}
.dtp-upg-btn:hover{background:rgba(0,229,255,0.15);border-color:var(--def-border2);color:#fff;}
.dtp-upg-btn.dim{opacity:0.32;cursor:default;pointer-events:none;}
.dtp-max{font-size:9px;color:var(--def-green);font-style:italic;font-weight:900;}
#dtp-sell{
width:100%;padding:6px 8px;
background:rgba(255,48,96,0.1);
border-radius:8px;cursor:pointer;
font-size:9px;font-weight:900;color:var(--def-red);
border:1px solid rgba(255,48,96,0.3);
text-align:center;font-family:var(--def-font);
transition:all .12s;
}
#dtp-sell:hover{background:rgba(255,48,96,0.2);}
/* path scanline overlay */
#def-grid::after{
content:'';position:absolute;inset:0;
background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.04) 2px,rgba(0,0,0,0.04) 4px);
pointer-events:none;z-index:1;
}
</style>
<div id="def" style="display:flex;flex-direction:column;height:100%;">
<div id="def-header">
<button id="def-back" onclick="window._exitDefence()">🏠 MENU</button>
<div class="def-stat">🪙<span id="def-coins"> 80</span></div>
<div class="def-stat">🦆<span id="def-hp"> 20</span></div>
<div class="def-stat">⚔️ WAVE <span id="def-wave">0</span></div>
<div class="def-stat-cap">🏗️<span id="def-towercap">0/20</span></div>
<button id="def-speed-btn">⏩ 2×</button>
<button id="def-auto-btn">🔄 AUTO</button>
<div id="def-status">PLACE TOWERS &amp; START WAVE</div>
</div>
<div id="def-main">
<div id="def-field">
<div id="def-grid"></div>
<div id="def-freeze-bg"></div>
<div id="def-tower-popup">
<div id="dtp-header">
<div id="dtp-title"></div>
<button id="dtp-close">✕</button>
</div>
<div id="dtp-stats"></div>
<div id="dtp-upgrades"></div>
<div id="dtp-sell"></div>
</div>
<div id="def-gameover">
<h2>💀 POND DESTROYED</h2>
<p>Survived <span id="def-go-waves">0</span> waves</p>
<button id="def-restart">▶ PLAY AGAIN</button>
</div>
</div>
<div id="def-right">
<div id="def-right-scroll">
<div class="def-sec">⚡ TOWERS</div>
<div id="def-tshop"></div>
<div class="def-sec">💥 POWERS</div>
<div id="def-ashop"></div>
</div>
<button id="def-wavebtn" class="pulse" style="margin:0;border-radius:0;border-top:1px solid rgba(255,255,255,0.07);">▶ Start Wave 1</button>
</div>
</div>
</div>`;
_ba(_defEl);
_defEl.addEventListener('click',e=>{e.stopPropagation();e.stopImmediatePropagation();});
_defEl.addEventListener('touchend',e=>{
if(e.target.closest('#def-right')) return;
e.stopPropagation();e.stopImmediatePropagation();
});
const gridEl = _defEl.querySelector('#def-grid');
const coinsEl = _defEl.querySelector('#def-coins');
const hpEl = _defEl.querySelector('#def-hp');
const waveEl = _defEl.querySelector('#def-wave');
const statusEl = _defEl.querySelector('#def-status');
const tshopEl = _defEl.querySelector('#def-tshop');
const ashopEl = _defEl.querySelector('#def-ashop');
const towerPopup = _defEl.querySelector('#def-tower-popup');
const dtpTitle = _defEl.querySelector('#dtp-title');
const dtpStats = _defEl.querySelector('#dtp-stats');
const dtpUpgrades= _defEl.querySelector('#dtp-upgrades');
const dtpSell = _defEl.querySelector('#dtp-sell');
const wavebtn = _defEl.querySelector('#def-wavebtn');
const gameoverEl= _defEl.querySelector('#def-gameover');
const goWaves = _defEl.querySelector('#def-go-waves');
const restartBtn= _defEl.querySelector('#def-restart');
const freezeBg = _defEl.querySelector('#def-freeze-bg');
let cs = 36;
const TERRAIN_EMOJIS = ['🪨','🌲','🌲','🌿','🪨','🌲'];
function generateBlockedCells(){
blockedCells = new Map();
const candidates=[];
for(let r=0;r<ROWS;r++){
for(let c=0;c<COLS;c++){
if(!isPath(c,r)&&!isPond(c,r)&&!(c===PATH[0][0]&&r===PATH[0][1])) candidates.push(c+','+r);
}
}
candidates.sort(()=>_mr()-0.5);
const count=6+_mf(_mr()*4);
candidates.slice(0,count).forEach(k=>{
blockedCells.set(k, TERRAIN_EMOJIS[_mf(_mr()*TERRAIN_EMOJIS.length)]);
});
}
function buildGrid(){
const avW = innerWidth - 124 - 8;
const avH = innerHeight - 46 - 8;
cs = _mx(22, _mn(48, _mf(_mn(avW/COLS, avH/ROWS))));
gridEl.style.cssText = `display:grid;position:relative;grid-template-columns:repeat(${COLS},${cs}px);grid-template-rows:repeat(${ROWS},${cs}px);width:${COLS*cs}px;height:${ROWS*cs}px;`;
generateBlockedCells();
gridEl.innerHTML='';
for(let r=0;r<ROWS;r++){
for(let c=0;c<COLS;c++){
const d=_ce('div');
const _bkey=c+','+r;
d.className='def-cell '+(isPond(c,r)?'pond':isPath(c,r)?'path':'grass');
if(c===PATH[0][0]&&r===PATH[0][1]) d.classList.add('spawn');
if(blockedCells.has(_bkey)) d.classList.add('blocked');
d.style.cssText=`width:${cs}px;height:${cs}px;`;
d.dataset.c=c; d.dataset.r=r;
if(isPond(c,r)) d.innerHTML=`<span class="def-pond-icon">🌊</span>`;
else if(blockedCells.has(_bkey)) d.innerHTML=`<span class="def-tower-icon" style="opacity:.7">${blockedCells.get(_bkey)}</span>`;
d.addEventListener('pointerdown',onCellTap);
gridEl.appendChild(d);
}
}
}
function cellEl(c,r){ return gridEl.querySelector(`[data-c="${c}"][data-r="${r}"]`); }
function refreshCell(c,r){
const el=cellEl(c,r); if(!el) return;
const t=grid[c+','+r];
if(t) el.innerHTML=`<span class="def-tower-icon">${t.def.emoji}</span>`;
else if(isPond(c,r)) el.innerHTML=`<span class="def-pond-icon">🏊</span>`;
else el.innerHTML='';
}
function onCellTap(e){
e.stopPropagation();
if(gameOver) return;
const c=+e.currentTarget.dataset.c, r=+e.currentTarget.dataset.r;
if(isPath(c,r)||isPond(c,r)) return;
const key=c+','+r;
if(grid[key]){ selectTower(key); return; }
if(blockedCells.has(key)) return;
if(!selectedTowerDef) return;
if(coins<selectedTowerDef.cost) return;
if(Object.keys(grid).length>=MAX_TOWERS){ statusEl.textContent='Population cap reached! ('+MAX_TOWERS+' towers)'; return; }
coins-=selectedTowerDef.cost;
const t={id:uid++,key,c,r,def:{...selectedTowerDef},dmg:selectedTowerDef.dmg,range:selectedTowerDef.range,rate:selectedTowerDef.rate,upgrades:[]};
grid[key]=t; towerTick[t.id]=0;
refreshCell(c,r);
clearSel(); cellEl(c,r)?.classList.add('sel');
selectTower(key);
updateHud(); buildTShop(); updateCapDisplay();
}
_defEl.querySelector('#dtp-close').addEventListener('pointerdown', e=>{ e.stopPropagation(); clearSel(); selectedKey=null; towerPopup.style.display='none'; });
function clearSel(){ gridEl.querySelectorAll('.def-cell.sel').forEach(el=>el.classList.remove('sel')); }
function selectTower(key){
selectedKey=key;
const t=grid[key]; if(!t){ towerPopup.style.display='none'; return; }
clearSel(); cellEl(t.c,t.r)?.classList.add('sel');
dtpTitle.textContent=t.def.emoji+' '+t.def.label+' (Lv '+(t.upgrades.length+1)+')';
dtpStats.innerHTML='';
const fireRate=+(t.rate/(20)).toFixed(1);
const statPills=[
{label:'⚔️ DMG '+t.dmg},
{label:'🎯 RNG '+t.range.toFixed(1)},
{label:'⚡ '+fireRate+'s'},
{label:'🪙 '+t.def.cost},
];
if(t.def.slow) statPills.push({label:'🐢 Slow', trait:true});
if(t.def.poison) statPills.push({label:'☠️ Poison', trait:true});
if(t.def.burn) statPills.push({label:'🔥 Burn', trait:true});
if(t.def.aoe) statPills.push({label:'💥 AOE', trait:true});
if(t.def.chain) statPills.push({label:'⛓️ x'+t.def.chain, trait:true});
if(t.def.multi) statPills.push({label:'🎯 x'+t.def.multi, trait:true});
statPills.forEach(p=>{
const el=_ce('div');
el.className='dtp-pill'+(p.trait?' trait':'');
el.textContent=p.label;
dtpStats.appendChild(el);
});
dtpUpgrades.innerHTML='';
if(t.upgrades.length<2){
UPGRADES.forEach(u=>{
if(t.upgrades.includes(u.id)) return;
const b=_ce('div');
b.className='dtp-upg-btn'+(coins>=u.cost?'':' dim');
b.textContent='⬆ '+u.label+' — 🪙'+u.cost;
b.addEventListener('pointerdown',ev=>{
ev.stopPropagation();
if(coins<u.cost) return;
coins-=u.cost; t.upgrades.push(u.id); u.apply(t);
updateHud(); buildTShop(); selectTower(key);
});
dtpUpgrades.appendChild(b);
});
} else {
const mx=_ce('div');
mx.className='dtp-max'; mx.textContent='✅ Fully upgraded';
dtpUpgrades.appendChild(mx);
}
const sellVal=_mf(t.def.cost*0.5);
dtpSell.textContent='💰 Sell for 🪙'+sellVal;
dtpSell.onclick=()=>{
coins+=sellVal; delete grid[key]; delete towerTick[t.id];
refreshCell(t.c,t.r); clearSel(); selectedKey=null;
towerPopup.style.display='none';
updateHud(); buildTShop(); updateCapDisplay();
};
const fieldRect=gridEl.getBoundingClientRect();
const fieldParent=_defEl.querySelector('#def-field').getBoundingClientRect();
const cx=t.c*cs+cs/2, cy=t.r*cs;
let px=cx+cs+4, py=cy-10;
towerPopup.style.display='block';
const popW=towerPopup.offsetWidth||200, popH=towerPopup.offsetHeight||180;
const maxX=gridEl.offsetWidth-popW-4;
const maxY=gridEl.offsetHeight-popH-4;
if(px>maxX) px=cx-popW-4;
if(px<4) px=4;
py=_mx(4,_mn(maxY,py));
towerPopup.style.left=px+'px';
towerPopup.style.top=py+'px';
}
function buildTShop(){
tshopEl.innerHTML='';
[...TOWERS].sort((a,b)=>a.cost-b.cost).forEach(td=>{
const b=_ce('div');
b.className='def-tbtn'+(coins<td.cost?' dim':'')+(selectedTowerDef?.id===td.id?' active':'');
b.innerHTML=`<span class="def-te">${td.emoji}</span><div class="def-ti"><div class="def-tn">${td.label}</div><div class="def-tc">🪙${td.cost}</div></div>`;
b.addEventListener('pointerdown',ev=>{
ev.stopPropagation();
selectedTowerDef=td; clearSel(); selectedKey=null; towerPopup.style.display='none';
buildTShop();
});
tshopEl.appendChild(b);
});
ashopEl.innerHTML='';
ABILITIES.forEach(ab=>{
const onCd=(abilityCds[ab.id]||0)>0;
const b=_ce('div');
b.className='def-abtn'+(onCd?' dim':'');
const cdSec=onCd?_mc(abilityCds[ab.id]/20):'';
b.innerHTML=`<span class="def-te">${ab.emoji}</span><div class="def-ti"><div class="def-tn">${ab.label}</div><div class="def-tc">${onCd?'⏳'+cdSec+'s':'🪙'+ab.cost}</div></div>`;
if(!onCd) b.addEventListener('pointerdown',ev=>{
ev.stopPropagation();
if(coins<ab.cost) return;
coins-=ab.cost; fireAbility(ab.id); updateHud(); buildTShop();
});
ashopEl.appendChild(b);
});
}
function fireAbility(id){
const ab=ABILITIES.find(a=>a.id===id);
abilityCds[id]=ab.cd;
if(id==='bomb'){ enemies.forEach(e=>{ e.hp-=80; shot(e.x,e.y,'💥',4,6); impactFx(e.x,e.y,'💥'); }); cleanup(); }
else if(id==='freeze'){ frozen=true; frozenTick=60; freezeBg.style.display='block'; }
else if(id==='zeus'){ [...enemies].sort(()=>_mr()-.5).slice(0,5).forEach(e=>{ e.hp-=60; shot(e.x,e.y,'⚡',4,0); impactFx(e.x,e.y,'⚡'); }); cleanup(); }
}
function pathXY(progress){
const i=_mf(progress), f=progress-i;
if(i>=PATH.length-1) return {x:PATH[PATH.length-1][0],y:PATH[PATH.length-1][1]};
return {x:PATH[i][0]+(PATH[i+1][0]-PATH[i][0])*f, y:PATH[i][1]+(PATH[i+1][1]-PATH[i][1])*f};
}
function spawnEnemy(defId){
const def=ENEMIES.find(e=>e.id===defId);
const el=_ce('div');
el.className='def-enemy';
el.innerHTML=`${def.emoji}<div class="def-ehp"><div class="def-ehpf"></div></div>`;
gridEl.appendChild(el);
enemies.push({id:eid++,def:{...def},hp:def.hp,maxHp:def.hp,progress:0,x:PATH[0][0],y:PATH[0][1],el});
}
function updateEnemy(e){
const px=e.x*cs+cs*0.1, py=e.y*cs+cs*0.1;
e.el.style.left=px+'px'; e.el.style.top=py+'px';
const f=e.el.querySelector('.def-ehpf');
if(f) f.style.width=_mx(0,e.hp/e.maxHp*100)+'%';
}
function shot(tx,ty,emoji,fromC,fromR){
const s=_ce('div');
s.className='def-shot'; s.textContent=emoji;
const sx=(fromC!==undefined?fromC:tx)*cs+cs/2;
const sy=(fromR!==undefined?fromR:ty)*cs+cs/2;
const ex=tx*cs+cs/2, ey=ty*cs+cs/2;
s.style.left=sx+'px'; s.style.top=sy+'px';
s.style.transition='left 0.12s linear,top 0.12s linear,opacity 0.08s ease,transform 0.12s ease';
s.style.transform='scale(1.3)';
gridEl.appendChild(s);
_raf(()=>_raf(()=>{
s.style.left=ex+'px'; s.style.top=ey+'px';
s.style.transform='scale(0.7)';
s.style.opacity='0.3';
}));
setTimeout(()=>s.remove(),180);
}
function impactFx(ex,ey,emoji){
const s=_ce('div');
s.className='def-shot'; s.textContent=emoji;
s.style.left=(ex*cs+cs/2)+'px'; s.style.top=(ey*cs+cs/2)+'px';
s.style.fontSize='14px';
s.style.transition='transform 0.2s ease,opacity 0.2s ease';
s.style.transform='scale(0.5)';
gridEl.appendChild(s);
_raf(()=>_raf(()=>{
s.style.transform='scale(1.6)';
s.style.opacity='0';
}));
setTimeout(()=>s.remove(),220);
}
function cleanup(){
const dead=enemies.filter(e=>e.hp<=0);
dead.forEach(e=>{
coins+=e.def.reward;
const pop=_ce('div');
pop.className='def-shot';
pop.textContent=e.def.emoji;
pop.style.cssText=`left:${e.x*cs+cs/2}px;top:${e.y*cs+cs/2}px;font-size:16px;transition:transform .25s ease,opacity .25s ease;`;
gridEl.appendChild(pop);
_raf(()=>_raf(()=>{
pop.style.transform='scale(2) translateY(-8px)';
pop.style.opacity='0';
}));
setTimeout(()=>pop.remove(),280);
const cpop=_ce('div');
cpop.className='def-shot';
cpop.textContent='+🪙'+e.def.reward;
cpop.style.cssText=`left:${e.x*cs+cs/2}px;top:${(e.y-0.5)*cs}px;font-size:9px;color:#f5e642;font-weight:900;transition:transform .5s ease,opacity .5s ease;font-family:Nunito,sans-serif;`;
gridEl.appendChild(cpop);
_raf(()=>_raf(()=>{
cpop.style.transform='translateY(-18px)';
cpop.style.opacity='0';
}));
setTimeout(()=>cpop.remove(),520);
e.el.remove();
});
enemies=enemies.filter(e=>e.hp>0);
if(dead.length){ updateHud(); buildTShop(); }
}
function generateWave(w){
const pool=
w<=2 ?['duckling','fox','rabbit','snake']:
w<=4 ?['fox','snake','rabbit','bat','eagle']:
w<=7 ?['snake','wolf','bat','eagle','boar']:
w<=10 ?['wolf','bear','lion','boar','zombie','alien']:
w<=14 ?['bear','lion','gorilla','alien','dragon','rhino']:
['gorilla','dragon','rhino','alien','dragon'];
const count=5+w*3, q=[];
for(let i=0;i<count;i++) q.push({defId:pool[_mf(_mr()*pool.length)],delay:i*35});
if(w%5===0&&w>0){
const boss=w%15===0?'alien_boss':w%10===0?'dragon_boss':'yeti';
q.push({defId:boss,delay:count*35+60});
}
return q;
}
function updateHud(){
coinsEl.textContent=' '+coins;
hpEl.textContent=' '+pondHp;
updateCapDisplay();
}
function updateCapDisplay(){
const capEl=_defEl.querySelector('#def-towercap');
if(capEl){ const n=Object.keys(grid).length; capEl.textContent=n+'/'+MAX_TOWERS; capEl.style.color=n>=MAX_TOWERS?'#ff8080':''; }
}
wavebtn.addEventListener('pointerdown',e=>{
e.stopPropagation();
if(waveActive||gameOver) return;
wave++; waveEl.textContent=wave; waveActive=true;
spawnQueue=generateWave(wave); spawnTimer=0;
wavebtn.textContent='Wave '+wave+'...'; wavebtn.classList.remove('pulse');
statusEl.textContent='Wave '+wave+' — survive!';
});
restartBtn.addEventListener('pointerdown',e=>{
e.stopPropagation();
grid={}; enemies=[]; coins=80; pondHp=20; wave=0;
waveActive=false; spawnQueue=[]; spawnTimer=0;
selectedTowerDef=null; selectedKey=null; abilityCds={};
frozen=false; frozenTick=0; gameOver=false;
autoWaveTimer=0;
gameoverEl.style.display='none'; freezeBg.style.display='none';
buildGrid(); buildTShop(); updateHud(); updateCapDisplay();
towerPopup.style.display='none';
wavebtn.textContent='▶ START WAVE 1'; wavebtn.classList.add('pulse');
statusEl.textContent='Place towers & start wave!';
});
const speedBtn = _defEl.querySelector('#def-speed-btn');
speedBtn.addEventListener('pointerdown', e=>{
e.stopPropagation();
gameSpeed = gameSpeed===1 ? 2 : 1;
speedBtn.textContent = gameSpeed===2 ? '⏩ 2x ✓' : '⏩ 2x';
speedBtn.classList.toggle('active', gameSpeed===2);
});
const autoBtn = _defEl.querySelector('#def-auto-btn');
autoBtn.addEventListener('pointerdown', e=>{
e.stopPropagation();
autoWave = !autoWave;
autoBtn.textContent = autoWave ? '🔄 Auto ✓' : '🔄 Auto';
autoBtn.classList.toggle('active', autoWave);
if(autoWave&&!waveActive&&wave>0) autoWaveTimer=100;
});
_defInterval=setInterval(()=>{
if(gameOver) return;
Object.keys(abilityCds).forEach(k=>{ if(abilityCds[k]>0){ abilityCds[k]-=gameSpeed; if(abilityCds[k]<=0){abilityCds[k]=0;buildTShop();} }});
if(frozen){ frozenTick-=gameSpeed; if(frozenTick<=0){ frozen=false; freezeBg.style.display='none'; }}
if(waveActive&&spawnQueue.length){
spawnTimer+=gameSpeed;
if(spawnTimer>=spawnQueue[0].delay){ spawnEnemy(spawnQueue.shift().defId); spawnTimer=0; }
}
const spd=frozen?0.15:1;
enemies.forEach(e=>{
const slowMult=(e._slow&&e._slow>0)?0.4:1;
if(e._slow>0) e._slow-=gameSpeed;
if(e._poison>0){ e._poison-=gameSpeed; if(_mf(e._poison)%10<gameSpeed) e.hp-=e._pdmg||1; }
if(e._burn>0){ e._burn-=gameSpeed; if(_mf(e._burn)%8<gameSpeed) e.hp-=e._bdmg||1; }
if(e.def.regen) e.hp=_mn(e.maxHp,e.hp+e.def.regen*0.02);
e.progress+=e.def.spd*spd*slowMult*0.02*gameSpeed;
if(e.progress>=PATH.length-1){
pondHp=_mx(0,pondHp-1); e.el.remove();
enemies=enemies.filter(x=>x.id!==e.id); updateHud();
if(pondHp<=0&&!gameOver){ gameOver=true; goWaves.textContent=wave; gameoverEl.style.display='flex'; }
return;
}
const p=pathXY(e.progress); e.x=p.x; e.y=p.y; updateEnemy(e);
});
Object.values(grid).forEach(t=>{
towerTick[t.id]=(towerTick[t.id]||0)+gameSpeed;
if(towerTick[t.id]<t.rate) return;
const inRange=enemies.filter(e=>{ const dx=e.x-t.c,dy=e.y-t.r; return _ms(dx*dx+dy*dy)<=t.range; });
if(!inRange.length) return;
const target=inRange.reduce((a,b)=>a.progress>b.progress?a:b);
towerTick[t.id]=0;
if(t.def.aoe){
inRange.forEach(e=>{ e.hp-=t.dmg; shot(e.x,e.y,t.def.shot||'💥',t.c,t.r); impactFx(e.x,e.y,'💥'); });
}
else if(t.def.chain){ [...enemies].sort(()=>_mr()-.5).slice(0,t.def.chain).forEach(e=>{ e.hp-=t.dmg; shot(e.x,e.y,'⚡',t.c,t.r); impactFx(e.x,e.y,'⚡'); }); }
else if(t.def.multi){ inRange.sort((a,b)=>b.progress-a.progress).slice(0,t.def.multi).forEach(e=>{ e.hp-=t.dmg; shot(e.x,e.y,t.def.shot||'•',t.c,t.r); }); }
else {
shot(target.x,target.y,t.def.shot||'•',t.c,t.r);
target.hp-=t.dmg;
if(t.def.slow) { target._slow=(target._slow||0)+40; impactFx(target.x,target.y,'🐢'); }
if(t.def.poison){ target._poison=(target._poison||0)+60; target._pdmg=_mf(t.dmg*0.2); impactFx(target.x,target.y,'☠️'); }
if(t.def.burn) { target._burn=(target._burn||0)+80; target._bdmg=_mf(t.dmg*0.15); impactFx(target.x,target.y,'🔥'); }
}
cleanup();
});
if(waveActive&&!spawnQueue.length&&!enemies.length){
waveActive=false;
coins+=10+wave*3; updateHud(); buildTShop();
wavebtn.textContent='▶ Start Wave '+(wave+1); wavebtn.classList.add('pulse');
statusEl.textContent='Wave '+wave+' cleared! 🎉 +🪙'+(10+wave*3);
if(autoWave) autoWaveTimer=100;
}
if(!waveActive&&!gameOver&&autoWave&&autoWaveTimer>0){
autoWaveTimer--;
if(autoWaveTimer>0){ statusEl.textContent='Next wave in '+_mc(autoWaveTimer/20)+'s...'; }
else{ wavebtn.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); }
}
},50);
buildGrid();
buildTShop();
updateHud();
}
})();
(()=>{
let _beaconEl=null;
window._launchBeacon=function(){
window.paused=true;
if(window._menuEl)window._menuEl.style.display='none';
if(window._homeBtn)window._homeBtn.style.display='';
window._beaconActive=true;
if(_beaconEl){_beaconEl.remove();_beaconEl=null;}
_buildBeacon();
};
window._exitBeacon=function(){
window._beaconActive=false;
window.paused=false;
if(_beaconEl){_beaconEl.remove();_beaconEl=null;}
if(window._menuEl)window._menuEl.style.display='flex';
if(window._randomiseFeatured)window._randomiseFeatured();
if(window._homeBtn)window._homeBtn.style.display='none';
};
function _buildBeacon(){
if(!_gi('beacon-font')){
let lnk=_ce('link');lnk.id='beacon-font';
lnk.rel='stylesheet';
lnk.href='https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Nunito:wght@700;800;900&display=swap';
document.head.appendChild(lnk);
}
if(!_gi('beacon-style')){
let st=_ce('style');st.id='beacon-style';
st.textContent=`@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Nunito:wght@700;800;900&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
--bg:#05060f;
--player:#00e5ff;--player-dim:rgba(0,229,255,0.18);--player-glow:rgba(0,229,255,0.5);
--enemy:#ff3a6e;--enemy-dim:rgba(255,58,110,0.18);--enemy-glow:rgba(255,58,110,0.5);
--beacon:#ffe066;--beacon-glow:rgba(255,224,102,0.7);
--surface:rgba(255,255,255,0.04);--border:rgba(255,255,255,0.07);
--text:#e8eaff;--text-dim:rgba(232,234,255,0.35);
--font-d:'Orbitron',sans-serif;--font:'Nunito',sans-serif;
}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:var(--font);overflow:hidden;touch-action:manipulation;user-select:none;-webkit-user-select:none;}
#app{display:flex;flex-direction:column;height:100vh;height:100dvh;}
/* header */
#hdr{display:flex;align-items:center;justify-content:space-between;padding:0 14px;height:44px;flex-shrink:0;border-bottom:1px solid var(--border);background:rgba(5,6,15,0.98);}
#hdr-title{font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:.18em;color:var(--beacon);text-shadow:0 0 12px var(--beacon-glow);}
#menu-btn{font-family:var(--font);font-size:11px;font-weight:900;color:var(--text-dim);background:var(--surface);border:1px solid var(--border);padding:6px 12px;border-radius:8px;cursor:pointer;}
#menu-btn:hover{color:var(--text);}
/* score bar */
#scorebar{display:flex;align-items:stretch;height:36px;flex-shrink:0;border-bottom:1px solid var(--border);background:rgba(5,6,15,0.92);}
.score-side{flex:1;display:flex;align-items:center;gap:8px;padding:0 12px;}
#score-right{flex-direction:row-reverse;border-left:1px solid var(--border);}
.score-lbl{font-family:var(--font-d);font-size:8px;font-weight:700;letter-spacing:.12em;white-space:nowrap;}
#score-left .score-lbl{color:var(--player);}
#score-right .score-lbl{color:var(--enemy);}
.score-bar{flex:1;height:5px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden;}
#sb-p{height:100%;width:0%;background:linear-gradient(90deg,var(--player),#80f0ff);border-radius:3px;transition:width .2s;}
#sb-e{height:100%;width:0%;background:linear-gradient(90deg,#ff80a0,var(--enemy));border-radius:3px;transition:width .2s;}
.score-num{font-family:var(--font-d);font-size:10px;font-weight:700;min-width:18px;text-align:center;}
#sn-p{color:var(--player);}
#sn-e{color:var(--enemy);}
/* arena */
#arena{flex:1;position:relative;overflow:hidden;background:radial-gradient(ellipse 110% 80% at 50% 50%,#080b1a,#04050c);}
#arena::after{content:'';position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.022) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.022) 1px,transparent 1px);background-size:48px 48px;mask-image:radial-gradient(ellipse 85% 75% at 50% 50%,black,transparent);z-index:0;}
/* base zones */
#base-p{position:absolute;left:0;top:0;bottom:0;width:12%;background:linear-gradient(90deg,rgba(0,229,255,0.1),transparent);border-right:1px solid rgba(0,229,255,0.13);z-index:1;pointer-events:none;display:flex;align-items:center;justify-content:center;}
#base-e{position:absolute;right:0;top:0;bottom:0;width:12%;background:linear-gradient(270deg,rgba(255,58,110,0.1),transparent);border-left:1px solid rgba(255,58,110,0.13);z-index:1;pointer-events:none;display:flex;align-items:center;justify-content:center;}
.base-icon{font-size:26px;opacity:.3;}
/* beacon */
#beacon-wrap{position:absolute;top:50%;transform:translate(-50%,-50%);z-index:10;transition:left .1s linear;will-change:left;}
#cap-ring{position:absolute;top:50%;left:50%;width:88px;height:88px;border-radius:50%;border:1.5px dashed rgba(255,220,80,0.25);transform:translate(-50%,-50%);pointer-events:none;animation:capSpin 8s linear infinite;}
@keyframes capSpin{to{transform:translate(-50%,-50%) rotate(360deg);}}
.spark{position:absolute;top:50%;left:50%;width:5px;height:5px;border-radius:50%;margin:-2.5px;animation:sparkOrbit 3.5s linear infinite;pointer-events:none;}
.spark:nth-child(2){background:var(--beacon);animation-delay:0s;}
.spark:nth-child(3){background:#fff;animation-delay:-1.17s;}
.spark:nth-child(4){background:var(--beacon);animation-delay:-2.33s;}
@keyframes sparkOrbit{from{transform:rotate(0deg) translateX(38px);}to{transform:rotate(360deg) translateX(38px);}}
#beacon-core{width:42px;height:42px;border-radius:50%;background:radial-gradient(circle,#fff6c0 0%,#ffe066 40%,rgba(255,180,0,0) 70%);box-shadow:0 0 22px 8px rgba(255,220,80,0.6),0 0 55px 18px rgba(255,180,0,0.22);display:flex;align-items:center;justify-content:center;font-size:21px;line-height:1;animation:bcPulse 2.2s ease-in-out infinite;}
@keyframes bcPulse{0%,100%{box-shadow:0 0 22px 8px rgba(255,220,80,0.6),0 0 55px 18px rgba(255,180,0,0.22);}50%{box-shadow:0 0 34px 14px rgba(255,220,80,0.85),0 0 80px 28px rgba(255,180,0,0.4);}}
/* tug bar */
#tug-wrap{position:absolute;bottom:9px;left:13%;right:13%;z-index:9;pointer-events:none;}
#tug-track{height:7px;background:rgba(255,255,255,0.05);border-radius:4px;position:relative;overflow:hidden;}
#tug-p{position:absolute;right:0;top:0;bottom:0;background:linear-gradient(90deg,transparent,var(--player));border-radius:0 4px 4px 0;width:0%;box-shadow:0 0 7px var(--player-glow);}
#tug-e{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(270deg,transparent,var(--enemy));border-radius:4px 0 0 4px;width:0%;box-shadow:0 0 7px var(--enemy-glow);}
#tug-mid{position:absolute;left:50%;top:0;bottom:0;width:1.5px;background:rgba(255,255,255,0.18);transform:translateX(-50%);}
.tug-lbl{position:absolute;bottom:10px;font-size:7px;font-weight:900;letter-spacing:.09em;text-transform:uppercase;font-family:var(--font-d);}
#tl-p{left:0;color:rgba(0,229,255,0.38);}
#tl-e{right:0;color:rgba(255,58,110,0.38);}
/* units */
.unit{position:absolute;font-size:18px;line-height:1;pointer-events:none;z-index:5;will-change:left,top;}
.uhp{position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);width:20px;height:2px;background:rgba(0,0,0,0.5);border-radius:1px;overflow:hidden;}
.uhp-fill{height:100%;border-radius:1px;transition:width .08s;}
.unit.player .uhp-fill{background:var(--player);}
.unit.enemy .uhp-fill{background:var(--enemy);}
/* panel */
#panel{flex-shrink:0;background:rgba(5,6,15,0.98);border-top:1px solid var(--border);}
#dispatch{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:4px 8px 6px;}
.dbtn{display:flex;flex-direction:column;align-items:center;gap:2px;padding:7px 4px 5px;border-radius:10px;background:var(--surface);border:1.5px solid var(--border);cursor:pointer;position:relative;overflow:hidden;font-family:var(--font);color:var(--text);transition:border-color .1s,background .1s;}
.dbtn.ready{border-color:rgba(0,229,255,0.3);box-shadow:0 0 9px rgba(0,229,255,0.1);}
.dbtn.locked{opacity:0.28;pointer-events:none;}
.dbtn.cooldown{cursor:default;border-color:var(--border);}
.dbtn:not(.locked):not(.cooldown):active{transform:scale(0.92);}
.db-em{font-size:20px;line-height:1.1;}
.db-nm{font-size:8px;font-weight:900;color:var(--text-dim);letter-spacing:.03em;}
.db-en{font-size:8px;font-weight:900;color:var(--beacon);}
.db-cd{position:absolute;bottom:0;left:0;right:0;height:3px;background:rgba(255,255,255,0.06);border-radius:0 0 9px 9px;overflow:hidden;}
.db-cd-fill{height:100%;background:var(--player);width:100%;transition:width .05s linear;}
/* energy row */
#energy-row{display:flex;align-items:center;gap:8px;padding:0 10px 8px;}
#energy-lbl{font-size:8px;font-weight:900;color:var(--text-dim);letter-spacing:.09em;font-family:var(--font-d);white-space:nowrap;}
#energy-bar{flex:1;height:5px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden;}
#energy-fill{height:100%;background:linear-gradient(90deg,#009bb0,var(--player));border-radius:3px;transition:width .08s;box-shadow:0 0 6px var(--player-glow);}
#energy-num{font-size:10px;font-weight:900;color:var(--player);font-family:var(--font-d);min-width:28px;text-align:right;}
/* game over */
#gameover{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(4,5,12,0.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:50;}
#go-icon{font-size:54px;animation:goPop .45s cubic-bezier(.175,.885,.32,1.275);}
@keyframes goPop{from{transform:scale(0);opacity:0;}to{transform:scale(1);opacity:1;}}
#go-title{font-family:var(--font-d);font-size:21px;font-weight:900;letter-spacing:.1em;}
#go-msg{font-size:12px;color:var(--text-dim);text-align:center;max-width:220px;line-height:1.6;}
#go-card{background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:14px;padding:11px 22px;display:flex;flex-direction:column;gap:5px;font-size:11px;color:var(--text-dim);font-weight:700;text-align:center;}
#go-card span{color:var(--text);font-weight:900;}
#go-btn{padding:11px 36px;border-radius:12px;border:none;cursor:pointer;font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:.1em;color:#fff;margin-top:4px;touch-action:manipulation;}
#go-btn:active{transform:scale(0.95);}
/* wave toast */
#wave-toast{position:absolute;top:10px;left:50%;transform:translateX(-50%);background:rgba(5,6,15,0.9);border:1px solid rgba(255,224,102,0.28);border-radius:10px;padding:5px 16px;font-family:var(--font-d);font-size:9px;font-weight:700;letter-spacing:.14em;color:var(--beacon);text-shadow:0 0 8px var(--beacon-glow);z-index:15;pointer-events:none;opacity:0;transition:opacity .3s;}
/* float pop */
.pop{position:absolute;font-size:10px;font-weight:900;pointer-events:none;z-index:20;animation:popUp .7s ease forwards;}
@keyframes popUp{0%{opacity:1;transform:translateY(0);}100%{opacity:0;transform:translateY(-24px);}}
@keyframes unitHit{0%,100%{transform:scale(1);}50%{transform:scale(1.6) rotate(-8deg);}}
@keyframes unitDie{0%{opacity:1;transform:scale(1);}100%{opacity:0;transform:scale(0) rotate(180deg);}}`;
document.head.appendChild(st);
}
_beaconEl=_ce('div');
_beaconEl.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000085;overflow:hidden;font-family:Nunito,sans-serif;';
_beaconEl.innerHTML=`
<div id="app" style="display:flex;flex-direction:column;height:100vh;height:100dvh;">
<div id="hdr"><div id="hdr-title">CAPTURE THE BEACON</div><button id="menu-btn" onclick="window._exitBeacon()">← Menu</button></div>
<div id="scorebar">
<div class="score-side" id="score-left"><div class="score-lbl">YOU</div><div class="score-bar"><div id="sb-p"></div></div><div class="score-num" id="sn-p">0</div></div>
<div class="score-side" id="score-right"><div class="score-lbl">ENEMY</div><div class="score-bar"><div id="sb-e"></div></div><div class="score-num" id="sn-e">0</div></div>
</div>
<div id="arena">
<div id="base-p"><div class="base-icon">🏰</div></div>
<div id="base-e"><div class="base-icon">🏰</div></div>
<div id="beacon-wrap"><div id="cap-ring"></div><div class="spark"></div><div class="spark"></div><div class="spark"></div><div id="beacon-core">📍</div></div>
<div id="tug-wrap"><div class="tug-lbl" id="tl-p">← PUSH</div><div class="tug-lbl" id="tl-e">PUSH →</div><div id="tug-track"><div id="tug-mid"></div><div id="tug-e"></div><div id="tug-p"></div></div></div>
<div id="wave-toast">WAVE 1</div>
<div id="gameover">
<div id="go-icon">🏆</div><div id="go-title">VICTORY</div>
<div id="go-msg">You pushed the beacon into enemy territory!</div>
<div id="go-card">Units sent: <span id="gs-sent">0</span><br>Units lost: <span id="gs-lost">0</span><br>Wave reached: <span id="gs-wave">1</span></div>
<button id="go-btn">▶ PLAY AGAIN</button>
</div>
</div>
<div id="panel"><div id="dispatch"></div><div id="energy-row"><div id="energy-lbl">⚡ ENERGY</div><div id="energy-bar"><div id="energy-fill" style="width:60%"></div></div><div id="energy-num">60</div></div></div>
</div>`;
_ba(_beaconEl);
(function(){
(()=>{
const DEFS=[
{id:'duckling',emoji:'🐥',label:'SCOUT', energy:10,hp:1, dmg:1,speed:2.8,reward:1, cd:1800},
{id:'duck', emoji:'🦆',label:'DUCK', energy:20,hp:3, dmg:1,speed:1.5,reward:2, cd:2400},
{id:'fox', emoji:'🦊',label:'FOX', energy:30,hp:5, dmg:2,speed:1.8,reward:5, cd:3000},
{id:'eagle', emoji:'🦅',label:'EAGLE', energy:40,hp:4, dmg:3,speed:2.8,reward:7, cd:2200},
{id:'wolf', emoji:'🐺',label:'WOLF', energy:50,hp:8, dmg:3,speed:1.3,reward:9, cd:3600},
{id:'bear', emoji:'🐻',label:'TANK', energy:75,hp:15,dmg:4,speed:0.9,reward:16,cd:5000},
{id:'dragon', emoji:'🐉',label:'DRAGON', energy:100,hp:25,dmg:7,speed:1.2,reward:28,cd:7000},
{id:'yeti', emoji:'🧊',label:'YETI', energy:90,hp:20,dmg:5,speed:0.8,reward:22,cd:6000},
];
const arena=_gi('arena');
const beaconWrap=_gi('beacon-wrap');
const tugP=_gi('tug-p');
const tugE=_gi('tug-e');
const gameover=_gi('gameover');
const goIcon=_gi('go-icon');
const goTitle=_gi('go-title');
const goMsg=_gi('go-msg');
const goBtn=_gi('go-btn');
const gsSent=_gi('gs-sent');
const gsLost=_gi('gs-lost');
const gsWave=_gi('gs-wave');
const snP=_gi('sn-p');
const snE=_gi('sn-e');
const sbP=_gi('sb-p');
const sbE=_gi('sb-e');
const eFill=_gi('energy-fill');
const eNum=_gi('energy-num');
const dispatch=_gi('dispatch');
const waveToast=_gi('wave-toast');
let energy=60,maxEnergy=100,eRegen=8;
let units=[],uid=0;
let beaconX=0;
let gameOver=false,loopId=null,frame=0,waveNum=1;
let aiEnergy=60,aiRegen=8,aiPower=1.0;
let statSent=0,statLost=0;
const cdState={};
const DT=50,CAP_R=55,FIGHT_R=28;
DEFS.forEach(d=>{
cdState[d.id]=0;
const btn=_ce('div');
btn.className='dbtn ready';
btn.id='db-'+d.id;
btn.innerHTML=`<div class="db-em">${d.emoji}</div><div class="db-nm">${d.label}</div><div class="db-en">⚡${d.energy}</div><div class="db-cd"><div class="db-cd-fill"></div></div>`;
btn.addEventListener('click',()=>playerSend(d));
btn.addEventListener('touchstart',e=>{e.preventDefault();playerSend(d);},{passive:false});
dispatch.appendChild(btn);
});
function playerSend(d){
if(gameOver||energy<d.energy||cdState[d.id]>0)return;
energy-=d.energy;
cdState[d.id]=d.cd;
spawn(d,'player');
statSent++;
}
function aiSend(d){
if(aiEnergy<d.energy)return;
aiEnergy-=d.energy;
spawn(d,'enemy');
}
function spawn(def,side){
const fw=arena.offsetWidth,fh=arena.offsetHeight;
const x=side==='player'?fw*0.07+_mr()*fw*0.05:fw*0.88+_mr()*fw*0.05;
const y=fh*0.18+_mr()*fh*0.62;
const el=_ce('div');
el.className='unit '+side;
el.style.cssText=`left:${x}px;top:${y}px;`;
el.innerHTML=`${def.emoji}<div class="uhp"><div class="uhp-fill" style="width:100%"></div></div>`;
arena.appendChild(el);
units.push({id:uid++,def,side,x,y,hp:def.hp,maxHp:def.hp,dmg:def.dmg,speed:def.speed,el,aCd:0,dCd:0,tx:x,ty:y});
}
function kill(u,byS){
units=units.filter(x=>x!==u);
u.el.style.animation='unitDie .3s ease forwards';
setTimeout(()=>u.el.remove(),320);
if(byS==='player'){energy=_mn(maxEnergy,energy+u.def.reward);pop(u.x,u.y,'+'+u.def.reward+'⚡','#00e5ff');}
else{aiEnergy=_mn(200,aiEnergy+u.def.reward);statLost++;}
}
function pop(x,y,t,c){
const el=_ce('div');
el.className='pop';
el.style.cssText=`left:${x-10}px;top:${y-12}px;color:${c};`;
el.textContent=t;
arena.appendChild(el);
setTimeout(()=>el.remove(),750);
}
function aiThink(){
const aff=DEFS.filter(d=>aiEnergy>=d.energy);
if(!aff.length)return;
const behind=beaconX>0;
aff.sort((a,b)=>behind?a.energy-b.energy:b.energy-a.energy);
const pick=_mr()<0.5+aiPower*0.1?aff[0]:aff[_mn(1,aff.length-1)];
aiSend(pick);
}
function tick(){
if(!window._beaconActive||gameOver)return;
frame++;
const fw=arena.offsetWidth,fh=arena.offsetHeight;
const bSX=fw*(0.5+beaconX*0.43),bSY=fh*0.5;
energy=_mn(maxEnergy,energy+eRegen*(DT/1000));
aiEnergy=_mn(200,aiEnergy+aiRegen*(DT/1000)*aiPower);
DEFS.forEach(d=>{if(cdState[d.id]>0)cdState[d.id]=_mx(0,cdState[d.id]-DT);});
if(frame%_mx(6,20-_mf(frame/200))===0)aiThink();
if(frame%500===0){
aiPower=_mn(5,aiPower+0.35);
eRegen=_mn(22,eRegen+0.4);
waveNum++;
toast('WAVE '+waveNum);
}
const pU=units.filter(u=>u.side==='player');
const eU=units.filter(u=>u.side==='enemy');
units.forEach(u=>{
u.dCd--;
if(u.dCd<=0){
const a=_mr()*_pi*2,r=CAP_R*0.7*_mr();
u.tx=_mx(fw*0.06,_mn(fw*0.94,bSX+Math.cos(a)*r));
u.ty=_mx(fh*0.06,_mn(fh*0.9,bSY+Math.sin(a)*r));
u.dCd=45+_mf(_mr()*70);
}
const dx=u.tx-u.x,dy=u.ty-u.y,d=Math.hypot(dx,dy);
if(d>2){u.x+=(dx/d)*u.speed*1.2;u.y+=(dy/d)*u.speed*1.2;}
u.el.style.left=u.x+'px';u.el.style.top=u.y+'px';
});
units.forEach(u=>{
if(u.aCd>0){u.aCd--;return;}
const foes=u.side==='player'?eU:pU;
let tgt=null,td=FIGHT_R;
foes.forEach(f=>{const dd=Math.hypot(u.x-f.x,u.y-f.y);if(dd<td){tgt=f;td=dd;}});
if(!tgt)return;
u.aCd=10;tgt.aCd=10;
u.el.style.animation='unitHit .15s ease';
tgt.el.style.animation='unitHit .15s ease';
setTimeout(()=>{if(u.el)u.el.style.animation='';if(tgt.el)tgt.el.style.animation='';},160);
const _u=u,_t=tgt;
setTimeout(()=>{
if(!units.includes(_u)||!units.includes(_t))return;
_u.hp-=_t.dmg;_t.hp-=_u.dmg;
setHp(_u);setHp(_t);
if(_u.hp<=0)kill(_u,_t.side);
if(_t.hp<=0)kill(_t,_u.side);
},140);
});
let pN=0,eN=0;
units.forEach(u=>{if(Math.hypot(u.x-bSX,u.y-bSY)<CAP_R)u.side==='player'?pN++:eN++;});
const net=pN-eN;
beaconX+=net*0.0007;
if(net===0)beaconX*=0.9985;
beaconX=_mx(-1,_mn(1,beaconX));
updateUI(pU.length,eU.length,fw);
if(beaconX>=1){end(true);return;}
if(beaconX<=-1){end(false);return;}
}
function setHp(u){const f=u.el.querySelector('.uhp-fill');if(f)f.style.width=_mx(0,(u.hp/u.maxHp)*100)+'%';}
function updateUI(pC,eC,fw){
const pct=(beaconX+1)/2;
beaconWrap.style.left=(pct*(fw*0.86)+fw*0.07)+'px';
tugP.style.width=_mx(0,(pct-0.5)/0.5*100)+'%';
tugE.style.width=_mx(0,(0.5-pct)/0.5*100)+'%';
snP.textContent=pC;snE.textContent=eC;
const M=14;
sbP.style.width=_mn(100,(pC/M)*100)+'%';
sbE.style.width=_mn(100,(eC/M)*100)+'%';
eFill.style.width=(energy/maxEnergy*100)+'%';
eNum.textContent=_mf(energy);
DEFS.forEach(d=>{
const btn=_gi('db-'+d.id);
if(!btn)return;
const fill=btn.querySelector('.db-cd-fill');
const onCd=cdState[d.id]>0,hasE=energy>=d.energy;
btn.className='dbtn'+(onCd?' cooldown':hasE?' ready':' locked');
if(fill){
fill.style.background=onCd?'rgba(255,224,102,0.4)':'var(--player)';
fill.style.width=onCd?((1-cdState[d.id]/d.cd)*100)+'%':'100%';
}
});
}
function toast(txt){
waveToast.textContent=txt;waveToast.style.opacity='1';
clearTimeout(waveToast._t);
waveToast._t=setTimeout(()=>waveToast.style.opacity='0',1800);
}
function end(won){
gameOver=true;clearInterval(loopId);
goIcon.textContent=won?'🏆':'💥';
goTitle.textContent=won?'VICTORY':'DEFEATED';
goTitle.style.color=won?'var(--beacon)':'var(--enemy)';
goMsg.textContent=won?'You pushed the beacon into enemy territory!':'The enemy captured the beacon. Try again!';
goBtn.style.background=won?'linear-gradient(90deg,#009bb0,#00e5ff)':'linear-gradient(90deg,#cc2040,#ff3a6e)';
gsSent.textContent=statSent;gsLost.textContent=statLost;gsWave.textContent=waveNum;
gameover.style.display='flex';
goIcon.style.animation='goPop .45s cubic-bezier(.175,.885,.32,1.275)';
}
function reset(){
clearInterval(loopId);
gameOver=false;frame=0;waveNum=1;beaconX=0;
energy=60;aiEnergy=60;eRegen=6;aiPower=0.85;
statSent=0;statLost=0;

DEFS.forEach(d=>cdState[d.id]=0);
units.forEach(u=>{if(u.el&&u.el.parentNode)u.el.remove();});
units=[];uid=0;
gameover.style.display='none';
toast('WAVE 1');
loopId=setInterval(tick,DT);
}
goBtn.addEventListener('click',reset);
_gi('menu-btn').addEventListener('click',()=>{
clearInterval(loopId);
if(window._exitBeacon)window._exitBeacon();
});
document.addEventListener('keydown',function _beaconKeys(e){
if(!_gi('arena'))return document.removeEventListener('keydown',_beaconKeys);
const idx=parseInt(e.key)-1;
if(idx>=0&&idx<DEFS.length){e.preventDefault();playerSend(DEFS[idx]);}
if(e.key==='Escape'){clearInterval(loopId);if(window._exitBeacon)window._exitBeacon();}
});
toast('WAVE 1');
loopId=setInterval(tick,DT);
})();
})();
}
})();
(()=>{
let _dashEl=null;
window._launchDash=function(){
window.paused=true;
if(window._menuEl)window._menuEl.style.display='none';
if(window._homeBtn)window._homeBtn.style.display='';
window._dashActive=true;
if(_dashEl){_dashEl.remove();_dashEl=null;}
_buildDash();
};
window._exitDash=function(){
window._dashActive=false;
window.paused=false;
running=false;
if(typeof rafId!=='undefined'&&rafId){_caf(rafId);rafId=null;}
if(_dashEl){_dashEl.remove();_dashEl=null;}
if(window._menuEl)window._menuEl.style.display='flex';
if(window._randomiseFeatured)window._randomiseFeatured();
if(window._homeBtn)window._homeBtn.style.display='none';
};
function _buildDash(){
if(!_gi('dash-font')){
let lnk=_ce('link');lnk.id='dash-font';
lnk.rel='stylesheet';
lnk.href='https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap';
document.head.appendChild(lnk);
}
if(!_gi('dash-style')){
let st=_ce('style');st.id='dash-style';
st.textContent=`@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
--bg:#0e0f1a;--surface:#14162a;--surface2:#1e2040;
--border:rgba(255,255,255,0.07);
--text:#e8eaff;--text-dim:rgba(232,234,255,0.35);
--font:'Nunito',sans-serif;
}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:var(--font);overflow:hidden;touch-action:manipulation;user-select:none;-webkit-user-select:none;}
#app{display:flex;flex-direction:column;height:100vh;height:100dvh;}
/* header */
#hdr{display:flex;align-items:center;justify-content:space-between;padding:0 14px;height:46px;flex-shrink:0;border-bottom:1px solid var(--border);background:rgba(14,15,26,0.98);}
#hdr-left{display:flex;align-items:center;gap:10px;}
#hdr-title{font-size:14px;font-weight:900;letter-spacing:-.01em;}
#menu-btn{font-size:11px;font-weight:900;color:var(--text-dim);background:rgba(255,255,255,0.06);border:1px solid var(--border);padding:6px 12px;border-radius:8px;cursor:pointer;}
/* top HUD */
#hud{display:flex;align-items:center;justify-content:space-between;padding:0 14px;height:38px;flex-shrink:0;background:rgba(14,15,26,0.9);border-bottom:1px solid var(--border);}
.hud-block{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:900;}
#score-val{font-size:16px;font-weight:900;color:#fff;min-width:50px;}
#best-val{color:rgba(255,255,255,0.35);font-size:11px;}
/* canvas area */
#stage{flex:1;position:relative;overflow:hidden;background:var(--bg);}
canvas{position:absolute;top:0;left:0;width:100%;height:100%;}
/* overlays */
.overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(8,9,18,0.88);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:20;}
#start-screen{}
#gameover-screen{display:none;}
.ov-icon{font-size:58px;line-height:1;}
.ov-title{font-size:26px;font-weight:900;letter-spacing:-.02em;}
.ov-sub{font-size:12px;color:var(--text-dim);text-align:center;max-width:240px;line-height:1.6;}
.ov-card{background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:14px;padding:12px 24px;font-size:12px;color:var(--text-dim);font-weight:700;text-align:center;min-width:200px;}
.ov-card span{color:var(--text);font-weight:900;font-size:14px;}
.big-btn{padding:13px 40px;border-radius:14px;border:none;font-size:14px;font-weight:900;cursor:pointer;font-family:var(--font);color:#fff;background:linear-gradient(90deg,#1a5fd0,#1040a0);letter-spacing:.02em;transition:transform .08s,filter .12s;touch-action:manipulation;}
.big-btn:active{transform:scale(0.95);}
.big-btn:hover{filter:brightness(1.15);}
/* hint */
#hint{font-size:11px;color:rgba(255,255,255,0.22);font-weight:700;text-align:center;}
/* death flash */
#flash{position:absolute;inset:0;background:rgba(255,60,60,0.28);opacity:0;pointer-events:none;z-index:15;transition:opacity .12s;}`;
document.head.appendChild(st);
}
_dashEl=_ce('div');
_dashEl.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000085;overflow:hidden;font-family:Nunito,sans-serif;background:#0e0f1a;';
_dashEl.innerHTML=`
<div id="app" style="display:flex;flex-direction:column;height:100vh;height:100dvh;">
<div id="hdr">
<div id="hdr-left"><div id="hdr-title">🏃 Duck Dash</div></div>
<button id="menu-btn" onclick="window._exitDash()">← Menu</button>
</div>
<div id="hud">
<div class="hud-block">🏃 <span id="score-val">0</span></div>
<div class="hud-block">🏆 <span id="best-val">0</span></div>
</div>
<div id="stage">
<canvas id="c"></canvas>
<div id="flash"></div>
<div class="overlay" id="start-screen">
<div class="ov-icon">🦆</div>
<div class="ov-title">Duck Dash</div>
<div class="ov-sub">Tap or press Space to jump. Double-tap for a double jump. Dodge predators and survive!</div>
<button class="big-btn" id="start-btn">▶ Start Running</button>
<div id="hint">Tap anywhere on the game to jump</div>
</div>
<div class="overlay" id="gameover-screen" style="display:none;">
<div class="ov-icon" id="go-icon">💀</div>
<div class="ov-title" id="go-title">Caught!</div>
<div class="ov-card">
<div>Distance &nbsp;<span id="gs-score">0</span>m</div>
<div style="margin-top:6px;">Best &nbsp;<span id="gs-best">0</span>m</div>
</div>
<button class="big-btn" id="restart-btn">▶ Run Again</button>
</div>
</div>
</div>`;
_ba(_dashEl);
(function(){
(()=>{
'use strict';
const canvas = _gi('c');
const ctx = canvas.getContext('2d');
const stage = _gi('stage');
const startScreen = _gi('start-screen');
const gameoverScreen = _gi('gameover-screen');
const scoreVal = _gi('score-val');
const bestVal = _gi('best-val');
const goScore = _gi('gs-score');
const goBest = _gi('gs-best');
const flash = _gi('flash');
let W, H, GROUND;
function resize(){
const r = stage.getBoundingClientRect();
W = canvas.width = _rnd(r.width * devicePixelRatio);
H = canvas.height = _rnd(r.height * devicePixelRatio);
canvas.style.width = r.width + 'px';
canvas.style.height = r.height + 'px';
GROUND = H * 0.72;
}
resize();
window.addEventListener('resize', resize);
const PX = () => devicePixelRatio;
let running = false, dead = false;
let score = 0, bestScore = 0;
let speed, frame, nextObs, jumpQueued;
const DUCK_X_RATIO = 0.15;
let duck;
let obstacles, particles, groundTiles;
let stars;
function initStars(){
stars = [];
for(let i=0;i<60;i++){
stars.push({
x: _mr()*W,
y: _mr()*(GROUND*0.85),
r: (0.5+_mr()*1.5)*PX(),
speed: (0.1+_mr()*0.4),
alpha: 0.1+_mr()*0.25
});
}
}
function resetGame(){
score=0; frame=0;
speed = 3.5 * PX();
nextObs = 3.5;
jumpQueued = false;
duck = {
x: W * DUCK_X_RATIO,
y: GROUND,
vy: 0,
jumpsLeft: 2,
w: 36*PX(), h: 36*PX(),
dead: false,
frame: 0,
bouncePhase: 0,
};
obstacles = [];
particles = [];
groundTiles = [];
for(let x=0; x<W+80*PX(); x+=48*PX()){
groundTiles.push(x);
}
initStars();
updateHUD();
}
function doJump(){
if(!running || dead) return;
if(duck.jumpsLeft > 0){
duck.vy = -15 * PX();
const isDoubleJump = duck.jumpsLeft === 1;
duck.jumpsLeft--;
for(let i=0;i<8;i++){
particles.push({
x: duck.x, y: duck.y + duck.h*0.4,
vx: (_mr()-.5)*4*PX(),
vy: (0.5+_mr()*1.5)*3*PX(),
life: 1, r: (2+_mr()*4)*PX(),
color: isDoubleJump ? '#60b0ff' : '#ffe066'
});
}
}
}
function handleTap(){
if(!running || dead){ startGame(); return; }
doJump();
}
_gi('start-btn').addEventListener('click', startGame);
_gi('restart-btn').addEventListener('click', startGame);
_gi('menu-btn').addEventListener('click', ()=>{
running=false; dead=false;
startScreen.style.display='flex';
gameoverScreen.style.display='none';
if(window._exitDash) window._exitDash();
});
stage.addEventListener('pointerdown', handleTap);
document.addEventListener('keydown', e=>{
if(e.code==='Space'||e.code==='ArrowUp'){e.preventDefault();handleTap();}
});
const OBS_TYPES = [
{emoji:'🦊', w:32, h:32, y:0,    label:'fox'},
{emoji:'🐍', w:34, h:20, y:10,   label:'snake'},
{emoji:'🐺', w:36, h:36, y:0,    label:'wolf'},
{emoji:'🐻', w:38, h:42, y:-4,   label:'bear'},
{emoji:'🦅', w:32, h:28, y:-200, label:'eagle'},
{emoji:'🦇', w:26, h:24, y:-185, label:'bat'},
];
function spawnObstacle(){
const t = OBS_TYPES[_mf(_mr()*OBS_TYPES.length)];
const wPx = t.w * PX(), hPx = t.h * PX();
const yOff = t.y * PX();
const isDouble = _mr() < 0.05 && t.label !== 'eagle' && t.label !== 'bat';
obstacles.push({
x: W + wPx,
y: GROUND + yOff - hPx,
w: wPx, h: hPx,
emoji: t.emoji,
label: t.label,
flying: t.y < -40,
double: isDouble,
x2: W + wPx + (isDouble ? wPx*1.5 : 0),
});
}
function rectsOverlap(ax,ay,aw,ah, bx,by,bw,bh){
const pad = 9*PX();
return ax+pad < bx+bw-pad &&
ax+aw-pad > bx+pad &&
ay+pad < by+bh-pad &&
ay+ah-pad > by+pad;
}
let lastTime=0, rafId=null;
function startGame(){
startScreen.style.display='none';
gameoverScreen.style.display='none';
dead=false; running=true;
resetGame();
lastTime=0;
if(rafId) _caf(rafId);
rafId = _raf(loop);
}
function loop(ts){
if(!running){ return; }
rafId = _raf(loop);
if(lastTime===0) lastTime=ts;
const raw_dt = ts - lastTime;
lastTime = ts;
const dt = _mn(raw_dt, 50) / 16.667;
ctx.clearRect(0,0,W,H);
if(!dead){
frame += dt;
speed = (3.5 + frame*0.0012) * PX();
speed = _mn(speed, 10*PX());
score = _mf(frame / 6);
}
const sky = ctx.createLinearGradient(0,0,0,GROUND);
sky.addColorStop(0,'#05060f');
sky.addColorStop(1,'#0e1228');
ctx.fillStyle=sky;
ctx.fillRect(0,0,W,GROUND);
if(!dead){
stars.forEach(s=>{
s.x -= s.speed * PX() * dt;
if(s.x < 0) s.x = W;
});
}
stars.forEach(s=>{
ctx.globalAlpha = s.alpha;
ctx.fillStyle='#fff';
ctx.beginPath();
ctx.arc(s.x, s.y, s.r, 0, _pi*2);
ctx.fill();
});
ctx.globalAlpha=1;
ctx.globalAlpha=0.18;
ctx.fillStyle='#e8e0c0';
ctx.beginPath();
ctx.arc(W*0.82, H*0.12, 22*PX(), 0, _pi*2);
ctx.fill();
ctx.globalAlpha=1;
const dirtGrad = ctx.createLinearGradient(0,GROUND,0,H);
dirtGrad.addColorStop(0,'#1a2a14');
dirtGrad.addColorStop(0.3,'#111a0d');
dirtGrad.addColorStop(1,'#080c06');
ctx.fillStyle=dirtGrad;
ctx.fillRect(0,GROUND,W,H-GROUND);
ctx.fillStyle='#2a4020';
ctx.fillRect(0,GROUND,W,4*PX());
ctx.fillStyle='#38582c';
ctx.fillRect(0,GROUND,W,2*PX());
if(!dead){
groundTiles = groundTiles.map(x => x - speed * dt);
if(groundTiles[0] < -48*PX()) groundTiles.shift();
while(groundTiles[groundTiles.length-1] < W+48*PX()) groundTiles.push(groundTiles[groundTiles.length-1]+48*PX());
}
ctx.fillStyle='rgba(255,255,255,0.04)';
groundTiles.forEach(x=>{
ctx.fillRect(x, GROUND+6*PX(), 20*PX(), 2*PX());
});
obstacles = obstacles.filter(o=>{
if(!dead){ o.x -= speed*dt; if(o.double) o.x2 -= speed*dt; }
const fontSize = _rnd(o.w * 0.88);
ctx.font = `${fontSize}px serif`;
ctx.textAlign='center';
ctx.textBaseline='bottom';
ctx.fillStyle='rgba(255,255,255,1)';
ctx.fillText(o.emoji, o.x + o.w/2, o.y + o.h);
if(o.double) ctx.fillText(o.emoji, o.x2 + o.w/2, o.y + o.h);
if(!dead){
if(rectsOverlap(duck.x-duck.w/2, duck.y-duck.h, duck.w, duck.h, o.x, o.y, o.w, o.h)){
killDuck(); return false;
}
if(o.double && rectsOverlap(duck.x-duck.w/2, duck.y-duck.h, duck.w, duck.h, o.x2, o.y, o.w, o.h)){
killDuck(); return false;
}
}
return o.x > -80*PX();
});
if(!dead){
nextObs -= dt;
if(nextObs <= 0){
spawnObstacle();
// Gap scales with screen: wider screen needs more time between obstacles
const crossTime = (W / speed) / 60; // seconds (W and speed both physical px)
const minGap = _mx(crossTime * 0.65, _mx(1.6, 3.0 - _mf(frame/10)*0.04));
nextObs = minGap + _mr()*0.8;
}
}
if(!dead){
const GRAVITY = 0.75 * PX();
duck.vy += GRAVITY * dt;
duck.y += duck.vy * dt;
if(duck.y >= GROUND){
duck.y = GROUND;
duck.vy = 0;
duck.jumpsLeft = 2;
}
duck.frame++;
duck.bouncePhase += (duck.y===GROUND ? 0.25 : 0.05) * dt;
}
const duckFontSize = _rnd(duck.w * 1.0);
ctx.save();
ctx.font = `${duckFontSize}px serif`;
ctx.textAlign='center';
ctx.textBaseline='bottom';
ctx.globalAlpha=0.25;
ctx.fillStyle='#000';
const shadowW = duck.w * (duck.y < GROUND ? _mx(0.4, 1-(GROUND-duck.y)/H*2) : 1);
ctx.beginPath();
ctx.ellipse(duck.x, GROUND+3*PX(), shadowW/2, 5*PX(), 0, 0, _pi*2);
ctx.fill();
ctx.globalAlpha=1;
const scaleY = duck.y < GROUND ? (1 + duck.vy*0.012) : (1 + _ma(Math.sin(duck.bouncePhase))*0.08);
const scaleX = duck.y < GROUND ? (1 - duck.vy*0.006) : 1;
ctx.translate(duck.x, duck.y);
ctx.scale(_mx(0.6, _mn(1.4, scaleX)), _mx(0.6, _mn(1.4, scaleY)));
ctx.fillText('🦆', 0, 0);
ctx.restore();
ctx.globalAlpha=1;
particles = particles.filter(p=>{
p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 0.15*PX()*dt; p.life -= 0.045*dt;
ctx.globalAlpha = _mx(0, p.life);
ctx.fillStyle = p.color;
ctx.beginPath();
ctx.arc(p.x, p.y, p.r * p.life, 0, _pi*2);
ctx.fill();
return p.life > 0;
});
ctx.globalAlpha=1;
updateHUD();
if(speed > 8*PX()){
const alpha = _mn(0.18, (speed/PX()-8)/20);
ctx.strokeStyle=`rgba(255,255,255,${alpha})`;
ctx.lineWidth=PX();
for(let i=0;i<5;i++){
const ly = GROUND*0.2 + _mr()*GROUND*0.5;
const llen = (20+_mr()*60)*PX();
ctx.beginPath();
ctx.moveTo(W*0.4+_mr()*W*0.4, ly);
ctx.lineTo(W*0.4+_mr()*W*0.4-llen, ly);
ctx.stroke();
}
}
}
function killDuck(){
if(dead) return;
dead=true;
for(let i=0;i<20;i++){
const a=_mr()*_pi*2, sp=(2+_mr()*5)*PX();
particles.push({x:duck.x,y:duck.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,r:(3+_mr()*5)*PX(),color:['#ff6060','#ffaa40','#fff','#f5e642'][_mf(_mr()*4)]});
}
flash.style.opacity='1';
setTimeout(()=>flash.style.opacity='0', 200);
if(score > bestScore) bestScore=score;
setTimeout(()=>{
goScore.textContent=score;
goBest.textContent=bestScore;
gameoverScreen.style.display='flex';
running=false;
}, 600);
}
function updateHUD(){
scoreVal.textContent=score;
bestVal.textContent=bestScore;
}
resize();
initStars && initStars();
resetGame();
rafId=_raf(loop);
running=false;
})();
})();
}
})();
(()=>{
let _labEl=null;
window._launchLab=function(){
window.paused=true;
if(window._menuEl)window._menuEl.style.display='none';
if(window._homeBtn)window._homeBtn.style.display='';
window._labActive=true;
if(_labEl){_labEl.remove();_labEl=null;}
_buildLab();
};
window._exitLab=function(){
window._labActive=false;
window.paused=false;
if(_labEl){_labEl.remove();_labEl=null;}
if(window._menuEl)window._menuEl.style.display='flex';
if(window._randomiseFeatured)window._randomiseFeatured();
if(window._homeBtn)window._homeBtn.style.display='none';
};
function _buildLab(){
if(!_gi('lab-font')){
let lnk=_ce('link');lnk.id='lab-font';
lnk.rel='stylesheet';
lnk.href='https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap';
document.head.appendChild(lnk);
}
if(!_gi('lab-style')){
let st=_ce('style');st.id='lab-style';
st.textContent=`@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
--bg:#0c0d18;--s1:#14162a;--s2:#1c1f38;--s3:#242748;
--amber:#ffb347;--ag:rgba(255,179,71,0.5);--ad:rgba(255,179,71,0.1);
--border:rgba(255,255,255,0.07);
--text:#e8eaff;--td:rgba(232,234,255,0.36);
--t1b:rgba(100,180,255,0.2);--t2b:rgba(255,215,60,0.25);
--font:'Nunito',sans-serif;
}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:var(--font);
overflow:hidden;touch-action:manipulation;user-select:none;-webkit-user-select:none;}
#app{display:flex;flex-direction:column;height:100vh;height:100dvh;}
#hdr{display:flex;align-items:center;justify-content:space-between;padding:0 13px;
height:48px;flex-shrink:0;background:var(--s1);border-bottom:1px solid var(--border);}
#hdr-title{font-size:14px;font-weight:900;}
#prog{font-size:10px;font-weight:900;color:var(--amber);background:var(--ad);
border:1px solid rgba(255,179,71,0.22);padding:4px 9px;border-radius:7px;white-space:nowrap;}
#menu-btn{font-size:11px;font-weight:900;color:var(--td);background:rgba(255,255,255,0.05);
border:1px solid var(--border);padding:6px 11px;border-radius:8px;cursor:pointer;}
#tabs{display:flex;flex-shrink:0;background:var(--s1);border-bottom:1px solid var(--border);}
.tab{flex:1;padding:9px 0;font-size:12px;font-weight:900;text-align:center;
color:var(--td);cursor:pointer;border-bottom:2px solid transparent;transition:color .12s,border-color .12s;}
.tab.active{color:var(--amber);border-bottom-color:var(--amber);}
#panels{flex:1;overflow:hidden;position:relative;}
.panel{position:absolute;inset:0;overflow-y:auto;padding:0;
scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.07) transparent;display:none;}
.panel.active{display:block;}
/* slots */
#slots-bar{display:flex;align-items:center;justify-content:center;gap:10px;
padding:12px 14px;background:rgba(12,13,24,0.98);border-bottom:1px solid var(--border);
flex-shrink:0;position:sticky;top:0;z-index:10;}
.slot{width:64px;height:64px;border-radius:14px;background:var(--s2);
border:2px dashed rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:center;
position:relative;cursor:pointer;transition:border-color .15s,box-shadow .15s;flex-shrink:0;overflow:hidden;}
.slot.filled{border-style:solid;border-color:rgba(255,179,71,0.5);box-shadow:0 0 14px rgba(255,179,71,0.2);}
.slot.filled:hover{border-color:rgba(255,80,80,0.6);box-shadow:0 0 14px rgba(255,80,80,0.25);}
.slot-hint{font-size:9px;font-weight:900;color:rgba(255,255,255,0.14);text-align:center;line-height:1.3;padding:4px;}
.slot-clear{position:absolute;top:2px;right:3px;font-size:10px;color:rgba(255,255,255,0.25);display:none;}
.slot.filled .slot-clear{display:block;}
.plus-sign{font-size:20px;color:rgba(255,255,255,0.15);font-weight:900;flex-shrink:0;}
#combine-btn{padding:0 18px;height:64px;border-radius:14px;border:none;
background:linear-gradient(135deg,#3a2a00,#7a5200);color:rgba(255,179,71,0.4);
font-size:12px;font-weight:900;font-family:var(--font);cursor:default;
transition:all .15s;flex-shrink:0;line-height:1.3;text-align:center;}
#combine-btn.ready{background:linear-gradient(135deg,#8a5f00,var(--amber));color:#1a0f00;
cursor:pointer;box-shadow:0 4px 18px rgba(255,179,71,0.35);}
#combine-btn.ready:active{transform:scale(0.95);}
/* emoji compositing */
.em-wrap{position:relative;width:44px;height:44px;flex-shrink:0;}
.em-single{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:32px;line-height:1;}
.em-a{position:absolute;top:2px;left:2px;font-size:26px;line-height:1;transform:rotate(-10deg);filter:drop-shadow(1px 1px 0 rgba(0,0,0,0.4));}
.em-b{position:absolute;bottom:2px;right:2px;font-size:26px;line-height:1;transform:rotate(8deg);filter:drop-shadow(-1px -1px 0 rgba(0,0,0,0.4));}
.em-glow{position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(255,200,80,0.18),transparent 65%);pointer-events:none;}
.slot .em-wrap{width:48px;height:48px;}
.slot .em-a{font-size:28px;}
.slot .em-b{font-size:28px;}
.slot .em-single{font-size:34px;}
.em-wrap.lg{width:72px;height:72px;}
.em-wrap.lg .em-a{font-size:40px;top:3px;left:3px;}
.em-wrap.lg .em-b{font-size:40px;bottom:3px;right:3px;}
.em-wrap.lg .em-single{font-size:50px;}
/* lab grid */
#lab-scroll{padding:10px 12px 24px;}
#lab-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:8px;}
.sec-lbl{grid-column:1/-1;font-size:9px;font-weight:900;color:var(--td);
letter-spacing:.13em;text-transform:uppercase;margin:10px 0 4px;
display:flex;align-items:center;gap:6px;}
.sec-lbl::after{content:'';flex:1;height:1px;background:var(--border);}
.card{background:var(--s2);border:1.5px solid var(--border);border-radius:12px;
padding:8px 4px 7px;display:flex;flex-direction:column;align-items:center;gap:3px;
cursor:pointer;position:relative;transition:border-color .12s,box-shadow .12s,transform .1s;}
.card:active{transform:scale(0.94);}
.card.t1{border-color:var(--t1b);}
.card.t2{border-color:var(--t2b);background:rgba(255,215,60,0.04);}
.card.selected-a{border-color:var(--amber);box-shadow:0 0 14px rgba(255,179,71,0.4);background:rgba(255,179,71,0.08);}
.card.selected-b{border-color:#80c0ff;box-shadow:0 0 14px rgba(100,160,255,0.4);background:rgba(100,160,255,0.07);}
.c-nm{font-size:8px;font-weight:900;color:var(--td);text-align:center;line-height:1.2;width:100%;padding:0 2px;}
/* book */
#book-scroll{padding:10px 12px 24px;}
#book-hdr{font-size:10px;font-weight:700;color:var(--td);text-align:center;margin-bottom:10px;line-height:1.5;}
#book-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(66px,1fr));gap:6px;}
.be{background:var(--s2);border:1.5px solid var(--border);border-radius:10px;
padding:7px 3px 6px;display:flex;flex-direction:column;align-items:center;gap:2px;}
.be.found{cursor:pointer;transition:border-color .12s,transform .1s;}
.be.found:hover{transform:translateY(-2px);}
.be.found.t1{border-color:var(--t1b);}
.be.found.t2{border-color:var(--t2b);background:rgba(255,215,60,0.04);}
.be-em{font-size:20px;line-height:1.2;filter:grayscale(1) brightness(0.15);}
.be-nm{font-size:7px;font-weight:900;text-align:center;line-height:1.2;}
.be-nm.dark{color:var(--td);}
.be-tier{font-size:6px;font-weight:900;color:rgba(255,215,60,0.65);}
.be .em-wrap{width:36px;height:36px;}
.be .em-a{font-size:22px;top:1px;left:1px;}
.be .em-b{font-size:22px;bottom:1px;right:1px;}
.be .em-single{font-size:26px;}
/* overlay */
#ov-bg{position:fixed;inset:0;background:rgba(6,7,16,0.9);backdrop-filter:blur(8px);
-webkit-backdrop-filter:blur(8px);display:none;z-index:200;cursor:pointer;}
#ov{position:fixed;inset:0;pointer-events:none;z-index:201;display:flex;align-items:center;justify-content:center;}
#ov-box{display:none;flex-direction:column;align-items:center;gap:10px;pointer-events:auto;
background:var(--s1);border:1px solid rgba(255,255,255,0.1);border-radius:20px;
padding:26px 26px 22px;max-width:260px;width:90%;box-shadow:0 24px 60px rgba(0,0,0,0.7);}
#ov-preview{position:relative;display:flex;align-items:center;justify-content:center;width:90px;height:90px;}
.spark-ring{position:absolute;inset:0;pointer-events:none;}
.sp{position:absolute;font-size:14px;animation:sparkFly .75s ease forwards;}
@keyframes sparkFly{0%{opacity:1;transform:translate(var(--sx),var(--sy));}100%{opacity:0;transform:translate(var(--ex),var(--ey)) scale(0.2);}}
#ov-badge{font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;padding:4px 12px;border-radius:7px;}
#ov-badge.new{color:#0c0d18;background:var(--amber);}
#ov-badge.known{color:var(--td);background:rgba(255,255,255,0.07);}
#ov-name{font-size:21px;font-weight:900;text-align:center;}
#ov-recipe{font-size:12px;color:var(--td);display:flex;align-items:center;gap:5px;flex-wrap:wrap;justify-content:center;}
#ov-desc{font-size:11px;color:var(--td);text-align:center;line-height:1.6;max-width:210px;}
#ov-dismiss{font-size:10px;font-weight:900;color:rgba(255,255,255,0.18);margin-top:2px;}
#toast{position:fixed;bottom:70px;left:50%;transform:translateX(-50%);
background:rgba(20,22,42,0.96);border:1px solid rgba(255,255,255,0.1);border-radius:9px;
padding:7px 16px;font-size:11px;font-weight:900;color:var(--td);pointer-events:none;
z-index:300;opacity:0;transition:opacity .18s;white-space:nowrap;}
@keyframes ovPop{from{transform:scale(0.5);opacity:0;}to{transform:scale(1);opacity:1;}}
@keyframes cardPop{0%{transform:scale(0.7);opacity:0;}70%{transform:scale(1.1);}100%{transform:scale(1);opacity:1;}}`;
document.head.appendChild(st);
}
_labEl=_ce('div');
_labEl.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000085;overflow:hidden;font-family:Nunito,sans-serif;background:#0c0d18;';
_labEl.innerHTML=`
<div id="app" style="display:flex;flex-direction:column;height:100vh;height:100dvh;">
<div id="hdr"><button id="menu-btn" onclick="window._exitLab()">← Menu</button><div id="hdr-title">🔬 Pond Lab</div><div id="prog">0 / 78</div></div>
<div id="tabs"><div class="tab active" data-tab="lab">🧪 Lab</div><div class="tab" data-tab="book">📖 Duck Book</div></div>
<div id="panels">
<div class="panel active" id="panel-lab">
<div id="slots-bar">
<div class="slot" id="slot-a" onclick="clearSlot('a')"><div class="slot-hint">Tap a<br>creature</div><span class="slot-clear">✕</span></div>
<div class="plus-sign">+</div>
<div class="slot" id="slot-b" onclick="clearSlot('b')"><div class="slot-hint">Tap a<br>creature</div><span class="slot-clear">✕</span></div>
<button id="combine-btn" onclick="doCombine()">⚗️<br>Brew</button>
</div>
<div id="lab-scroll"><div id="lab-grid"></div></div>
</div>
<div class="panel" id="panel-book">
<div id="book-scroll"><div id="book-hdr">Discover all 78 entries to complete the Duck Book</div><div id="book-grid"></div></div>
</div>
</div>
</div>
<div id="ov-bg"></div>
<div id="ov"><div id="ov-box">
<div id="ov-preview"><div class="spark-ring" id="spark-ring"></div><div id="ov-em-wrap"></div></div>
<div id="ov-badge" class="new">✨ New Discovery!</div>
<div id="ov-name"></div><div id="ov-recipe"></div><div id="ov-desc"></div>
<div id="ov-dismiss">Tap anywhere to continue</div>
</div></div>
<div id="toast"></div>`;
_ba(_labEl);
(function(){
(()=>{
'use strict';
const C={
duck: {e:'🦆',n:'Duck', t:0,d:'The classic pond dweller'},
duckling: {e:'🐥',n:'Duckling', t:0,d:'Small but mighty'},
egg: {e:'🥚',n:'Egg', t:0,d:'Full of potential'},
fox: {e:'🦊',n:'Fox', t:0,d:'Cunning predator'},
wolf: {e:'🐺',n:'Wolf', t:0,d:'Pack hunter'},
snake: {e:'🐍',n:'Snake', t:0,d:'Silent stalker'},
eagle: {e:'🦅',n:'Eagle', t:0,d:'Sky ruler'},
bear: {e:'🐻',n:'Bear', t:0,d:'Forest titan'},
lion: {e:'🦁',n:'Lion', t:0,d:'King of beasts'},
yeti: {e:'🧊',n:'Yeti', t:0,d:'Frozen terror of the mountains'},
dragon: {e:'🐉',n:'Dragon', t:0,d:'Fire-breathing legend of the pond'},
alien: {e:'👽',n:'Alien', t:0,d:'Arrived uninvited. Never left.'},
almost_there: {n:'Almost There', t:1,d:'So close to hatching'},
alpha_wolf: {n:'Alpha Wolf', t:1,d:'Commands the whole pack'},
apex_fox: {n:'Apex Fox', t:1,d:'At the very top of everything'},
apex_predator: {n:'Apex Predator', t:1,d:'Nothing in this pond hunts this'},
arctic_duck: {n:'Arctic Duck', t:1,d:'Permanently frostbitten but still quacking'},
arctic_fox: {n:'Arctic Fox', t:1,d:'White coat, cold heart, fast paws'},
alien_chick: {n:'Alien Chick', t:1,d:'Hatched somewhere very far away'},
alien_egg: {n:'Alien Egg', t:1,d:'Do NOT open this'},
alien_fox: {n:'Alien Fox', t:1,d:'Abducted foxes, kept the instincts'},
alien_serpent: {n:'Alien Serpent', t:1,d:'Slithers through dimensions'},
basilisk: {n:'Basilisk', t:1,d:'One glance turns prey to stone'},
bear_egg: {n:'Bear Egg', t:1,d:'Inside: hibernating'},
blizzard_bird: {n:'Blizzard Bird', t:1,d:'Brings the storm wherever it flies'},
boa_bear: {n:'Boa Bear', t:1,d:'Crushing, fierce, unstoppable'},
cosmic_bear: {n:'Cosmic Bear', t:1,d:'Enormous. Floats. Terrifying.'},
croc_duck: {n:'Croc Duck', t:1,d:'Snappy, webbed and deeply confusing'},
cub: {n:'Cub', t:1,d:'A lion wearing duckling fluff'},
cunning_duck: {n:'Cunning Duck', t:1,d:'Outwits its own predators'},
dire_bear: {n:'Dire Bear', t:1,d:'An ancient terror of the forest'},
dire_fox: {n:'Dire Fox', t:1,d:'Ancient and very dangerous'},
dove: {n:'Dove', t:1,d:'Peace in the pond at last'},
dragon_chick: {n:'Dragon Chick', t:1,d:'Small flames, big attitude'},
dragon_egg: {n:'Dragon Egg', t:1,d:'Handle with fireproof gloves'},
eaglet: {n:'Eaglet', t:1,d:'Learning to soar'},
fire_duck: {n:'Fire Duck', t:1,d:'QUACK (but it is fire)'},
fox_egg: {n:'Fox Egg', t:1,d:'Handle with cunning'},
fox_pack: {n:'Fox Pack', t:1,d:'Double cunning, double chaos'},
foxy_chick: {n:'Foxy Chick', t:1,d:'Trouble from day one'},
frost_king: {n:'Frost King', t:1,d:'Rules the frozen tundra absolutely'},
griffin: {n:'Griffin', t:1,d:'Noble and absolutely terrifying'},
grizzly_fox: {n:'Grizzly Fox', t:1,d:'Fast AND terrifyingly strong'},
howling_duck: {n:'Howling Duck', t:1,d:'QUAAOOOOO'},
hydra: {n:'Hydra', t:1,d:'Cut one head, two more appear'},
majestic_mallard:{n:'Majestic Mallard', t:1,d:'King of the pond'},
mama_duck: {n:'Mama Duck', t:1,d:'Fiercely protective mother'},
manticore: {n:'Manticore', t:1,d:'The tail sting is just the start'},
mega_bear: {n:'Mega Bear', t:1,d:'The biggest bear. The only bear.'},
nesting_duck: {n:'Nesting Duck', t:1,d:'Quietly waiting for something special'},
pack_leader: {n:'Pack Leader', t:1,d:'Commands all predators'},
polar_bear: {n:'Polar Bear', t:1,d:'Bigger. Whiter. Angrier.'},
pride_egg: {n:'Pride Egg', t:1,d:'Born to rule'},
pride_king: {n:'Pride King', t:1,d:'Ruler of all land creatures'},
pudding: {n:'Pudding', t:1,d:'Dangerously cute'},
pudgy_paddler: {n:'Pudgy Paddler', t:1,d:'Round, unstoppable, adorable'},
pup: {n:'Pup', t:1,d:'Best friends immediately'},
scrambled: {n:'Scrambled', t:1,d:'Oops'},
serpent_egg: {n:'Serpent Egg', t:1,d:'Handle with extreme caution'},
sky_egg: {n:'Sky Egg', t:1,d:'Destined for heights'},
sky_fox: {n:'Sky Fox', t:1,d:'Hunts from far above'},
sky_invader: {n:'Sky Invader', t:1,d:'Arrived from above. Never left.'},
snowflake_chick: {n:'Snowflake Chick', t:1,d:'Tiny and ice cold'},
space_duck: {n:'Space Duck', t:1,d:'Quack... quack... quack...'},
space_wolf: {n:'Space Wolf', t:1,d:'Howls at multiple moons'},
storm_wolf: {n:'Storm Wolf', t:1,d:'Strikes from storm clouds'},
swan: {n:'Swan', t:1,d:'Two ducks in perfect harmony'},
thunderbird: {n:'Thunderbird', t:1,d:'Storm made flesh and feathers'},
twin_cheeps: {n:'Twin Cheeps', t:1,d:'Twice the peeping, twice the chaos'},
ufo: {n:'UFO', t:1,d:'Two aliens, one saucer'},
war_eagle: {n:'War Eagle', t:1,d:'Unstoppable aerial predator'},
wiggly_chick: {n:'Wiggly Chick', t:1,d:'Slithery but somehow fluffy'},
winter_wolf: {n:'Winter Wolf', t:1,d:'Howls only during blizzards'},
wolf_egg: {n:'Wolf Egg', t:1,d:'Handle with caution'},
wyrm: {n:'Wyrm', t:1,d:'Ancient serpent beast of legend'},
ancient_dragon: {n:'Ancient Dragon', t:2,d:'Older than the pond itself'},
blizzard_beast: {n:'Blizzard Beast', t:2,d:'A wall of ice and fur and fury'},
chimera: {n:'Chimera', t:2,d:'Part lion, serpent, eagle. All chaos.'},
cosmic_dragon: {n:'Cosmic Dragon', t:2,d:'Older than the stars themselves'},
cryo_alien: {n:'Cryo Alien', t:2,d:'Came to freeze, stayed to conquer'},
divine_swan: {n:'Divine Swan', t:2,d:'Ascended beyond all comprehension'},
dragon_king: {n:'Dragon King', t:2,d:'Ruler of sky, land, and sea'},
elder_drake: {n:'Elder Drake', t:2,d:'Dragon royalty, absolute terror'},
frost_dragon: {n:'Frost Dragon', t:2,d:'Breathes absolute zero'},
galactic_lion: {n:'Galactic Lion', t:2,d:'King of an entire solar system'},
god_of_pond: {n:'God of Pond', t:2,d:'The ultimate being. The pond is theirs.'},
nine_tailed_fox: {n:'Nine-Tailed Fox', t:2,d:'Ancient, magical, unknowable'},
polar_dragon: {n:'Polar Dragon', t:2,d:'Breathes blizzards instead of fire'},
sea_dragon: {n:'Sea Dragon', t:2,d:'Rules the deepest part of the pond'},
shadow_wolf: {n:'Shadow Wolf', t:2,d:'Half wolf, half nightmare'},
storm_dragon: {n:'Storm Dragon', t:2,d:'Lightning given teeth and wings'},
werewolf: {n:'Werewolf', t:2,d:'The wolf that hunts under moonlight'},
};
const BASE=['duck','duckling','egg','fox','wolf','snake','eagle','bear','lion','yeti','dragon','alien'];
const HYBRIDS=Object.keys(C).filter(id=>!BASE.includes(id));
const TOTAL=HYBRIDS.length;
const COMBOS={
'alpha_wolf+lion':'werewolf',
'bear+bear':'mega_bear','bear+duck':'pudgy_paddler','bear+duckling':'pudding',
'bear+eagle':'war_eagle','bear+egg':'bear_egg','bear+fox':'grizzly_fox',
'bear+lion':'apex_predator','bear+snake':'boa_bear','bear+wolf':'dire_bear',
'dragon+dragon':'ancient_dragon','dragon+griffin':'elder_drake',
'dragon+hydra':'sea_dragon','dragon+mega_bear':'polar_dragon',
'dragon+pride_king':'god_of_pond','dragon+swan':'divine_swan',
'dragon+thunderbird':'storm_dragon',
'duck+duck':'swan','duck+duckling':'mama_duck','duck+eagle':'dove',
'duck+egg':'nesting_duck','duck+fox':'cunning_duck','duck+lion':'majestic_mallard',
'duck+snake':'croc_duck','duck+wolf':'howling_duck',
'duckling+duckling':'twin_cheeps','duckling+eagle':'eaglet',
'duckling+egg':'almost_there','duckling+fox':'foxy_chick','duckling+lion':'cub',
'duckling+snake':'wiggly_chick','duckling+wolf':'pup',
'eagle+eagle':'thunderbird','eagle+egg':'sky_egg','eagle+fox':'sky_fox',
'eagle+lion':'griffin','eagle+wolf':'storm_wolf',
'egg+egg':'scrambled','egg+fox':'fox_egg','egg+lion':'pride_egg',
'egg+snake':'serpent_egg','egg+wolf':'wolf_egg',
'fox+fox':'fox_pack','fox+lion':'apex_fox','fox+snake':'basilisk','fox+wolf':'dire_fox',
'fox_pack+snake':'nine_tailed_fox',
'griffin+manticore':'chimera',
'lion+lion':'pride_king','lion+snake':'manticore','lion+wolf':'pack_leader',
'snake+snake':'hydra','snake+wolf':'wyrm','wolf+wolf':'alpha_wolf',
'duck+yeti':'arctic_duck','fox+yeti':'arctic_fox','wolf+yeti':'winter_wolf',
'eagle+yeti':'blizzard_bird','bear+yeti':'polar_bear','lion+yeti':'frost_king',
'duckling+yeti':'snowflake_chick','yeti+yeti':'blizzard_beast',
'dragon+yeti':'frost_dragon','alien+yeti':'cryo_alien',
'alien+duck':'space_duck','alien+egg':'alien_egg','alien+fox':'alien_fox',
'alien+wolf':'space_wolf','alien+eagle':'sky_invader','alien+bear':'cosmic_bear',
'alien+lion':'galactic_lion','alien+alien':'ufo','alien+dragon':'cosmic_dragon',
'alien+snake':'alien_serpent','alien+duckling':'alien_chick',
'dragon+duck':'fire_duck','dragon+egg':'dragon_egg','dragon+wolf':'shadow_wolf',
'dragon+lion':'dragon_king','dragon+duckling':'dragon_chick',
'duck+penguin':'cozy_duck','wolf+penguin':'tundra_wolf','fox+penguin':'arctic_fox',
'eagle+penguin':'polar_eagle','bear+penguin':'ice_bear',
'duck+zombie':'zombie_duck','fox+zombie':'zombie_fox','wolf+zombie':'zombie_wolf',
'duck+bat':'vampire_duck','eagle+bat':'shadow_eagle','wolf+bat':'werewolf_bat',
'phoenix+duck':'flame_duck','phoenix+egg':'phoenix_egg','phoenix+wolf':'fire_wolf',
'phoenix+dragon':'eternal_dragon','phoenix+eagle':'sun_eagle',
'duck+snake':'sea_duck','fox+eagle':'sky_fox_king','wolf+bear':'thunder_beast',
'lion+eagle':'celestial_lion','bear+snake':'python_bear',
'duck+ghost':'spirit_duck','wolf+ghost':'spectral_wolf','fox+ghost':'phantom_fox',
'bear+dragon':'dragon_bear','eagle+dragon':'storm_drake',
'duck+bee':'bee_duck','wolf+bee':'swarm_wolf','bear+bee':'honey_bear',
'duck+robot':'mech_duck','wolf+robot':'cyber_wolf','eagle+robot':'drone_eagle',
};
const PARENTS={
almost_there:['duckling','egg'],alpha_wolf:['wolf','wolf'],
ancient_dragon:['dragon','dragon'],apex_fox:['fox','lion'],
apex_predator:['bear','lion'],arctic_duck:['yeti','duck'],
arctic_fox:['yeti','fox'],alien_chick:['alien','duckling'],
alien_egg:['alien','egg'],alien_fox:['alien','fox'],
alien_serpent:['alien','snake'],basilisk:['fox','snake'],
bear_egg:['bear','egg'],blizzard_bird:['yeti','eagle'],
blizzard_beast:['yeti','yeti'],boa_bear:['bear','snake'],
chimera:['griffin','manticore'],cosmic_bear:['alien','bear'],
cosmic_dragon:['alien','dragon'],croc_duck:['duck','snake'],
cryo_alien:['alien','yeti'],cub:['duckling','lion'],
cunning_duck:['duck','fox'],dire_bear:['bear','wolf'],
dire_fox:['fox','wolf'],divine_swan:['dragon','swan'],
dove:['duck','eagle'],dragon_chick:['dragon','duckling'],
dragon_egg:['dragon','egg'],dragon_king:['dragon','lion'],
eaglet:['duckling','eagle'],elder_drake:['dragon','griffin'],
fire_duck:['dragon','duck'],fox_egg:['egg','fox'],
fox_pack:['fox','fox'],foxy_chick:['duckling','fox'],
frost_dragon:['dragon','yeti'],frost_king:['yeti','lion'],
galactic_lion:['alien','lion'],griffin:['eagle','lion'],
grizzly_fox:['bear','fox'],howling_duck:['duck','wolf'],
hydra:['snake','snake'],majestic_mallard:['duck','lion'],
mama_duck:['duck','duckling'],manticore:['lion','snake'],
mega_bear:['bear','bear'],nesting_duck:['duck','egg'],
nine_tailed_fox:['fox_pack','snake'],pack_leader:['lion','wolf'],
polar_bear:['yeti','bear'],polar_dragon:['dragon','mega_bear'],
pride_egg:['egg','lion'],pride_king:['lion','lion'],
pudding:['bear','duckling'],pudgy_paddler:['bear','duck'],
pup:['duckling','wolf'],scrambled:['egg','egg'],
sea_dragon:['dragon','hydra'],serpent_egg:['egg','snake'],
shadow_wolf:['dragon','wolf'],sky_egg:['eagle','egg'],
sky_fox:['eagle','fox'],sky_invader:['alien','eagle'],
snowflake_chick:['yeti','duckling'],space_duck:['alien','duck'],
space_wolf:['alien','wolf'],storm_dragon:['dragon','thunderbird'],
storm_wolf:['eagle','wolf'],swan:['duck','duck'],
thunderbird:['eagle','eagle'],twin_cheeps:['duckling','duckling'],
ufo:['alien','alien'],war_eagle:['bear','eagle'],
werewolf:['alpha_wolf','lion'],wiggly_chick:['duckling','snake'],
winter_wolf:['yeti','wolf'],wolf_egg:['egg','wolf'],wyrm:['snake','wolf'],
};
function baseEmoji(id){
if(C[id]?.e)return C[id].e;
const p=PARENTS[id];
if(p)return baseEmoji(p[0]);
return '✨';
}
function makeEmoji(id,cls=''){
const wrap=_ce('div');
wrap.className='em-wrap'+(cls?' '+cls:'');
if(BASE.includes(id)){
const s=_ce('div');
s.className='em-single';s.textContent=C[id].e;
wrap.appendChild(s);
} else {
const [pA,pB]=PARENTS[id]||['duck','duck'];
const a=_ce('div');a.className='em-a';a.textContent=baseEmoji(pA);
const b=_ce('div');b.className='em-b';b.textContent=baseEmoji(pB);
const g=_ce('div');g.className='em-glow';
wrap.appendChild(a);wrap.appendChild(b);wrap.appendChild(g);
}
return wrap;
}
let discovered=new Set(BASE);
function save(){}
function comboKey(a,b){return[...[a,b]].sort().join('+');}
function discCount(){return[...discovered].filter(id=>!BASE.includes(id)).length;}
let slotA=null,slotB=null;
const labGrid=_gi('lab-grid');
const bookGrid=_gi('book-grid');
const prog=_gi('prog');
const slotAEl=_gi('slot-a');
const slotBEl=_gi('slot-b');
const combineBtn=_gi('combine-btn');
const ovBg=_gi('ov-bg');
const ovBox=_gi('ov-box');
const ovEmWrap=_gi('ov-em-wrap');
const ovBadge=_gi('ov-badge');
const ovName=_gi('ov-name');
const ovRecipe=_gi('ov-recipe');
const ovDesc=_gi('ov-desc');
const sparkRing=_gi('spark-ring');
const toastEl=_gi('toast');
function setSlot(which,id){
const el=which==='a'?slotAEl:slotBEl;
if(which==='a')slotA=id;else slotB=id;
el.innerHTML='';el.classList.add('filled');
el.appendChild(makeEmoji(id));
const x=_ce('span');x.className='slot-clear';x.textContent='✕';
el.appendChild(x);
updateCombineBtn();highlightCards();
}
window.clearSlot=function(which){
const el=which==='a'?slotAEl:slotBEl;
if(which==='a')slotA=null;else slotB=null;
el.innerHTML='<div class="slot-hint">Tap a<br>creature</div><span class="slot-clear">✕</span>';
el.classList.remove('filled');
updateCombineBtn();highlightCards();
};
function updateCombineBtn(){combineBtn.classList.toggle('ready',slotA!==null&&slotB!==null);}
function highlightCards(){
_qsa('.card').forEach(c=>{
c.classList.remove('selected-a','selected-b');
if(c.dataset.id===slotA)c.classList.add('selected-a');
if(c.dataset.id===slotB)c.classList.add('selected-b');
});
}
function onCardClick(id){
if(slotA===id){clearSlot('a');return;}
if(slotB===id){clearSlot('b');return;}
if(!slotA){setSlot('a',id);return;}
if(!slotB){setSlot('b',id);return;}
setSlot('b',id);
}
window.doCombine=function(){
if(!slotA||!slotB)return;
const key=comboKey(slotA,slotB);
const result=COMBOS[key];
if(!result){showToast('💭 No reaction... try something else!');return;}
const isNew=!discovered.has(result);
if(isNew){discovered.add(result);save();updateProg();renderLab();renderBook();}
showResult(result,isNew);
clearSlot('a');clearSlot('b');
};
function renderLab(){
labGrid.innerHTML='';
addSec('Base Creatures');
BASE.forEach(id=>makeCard(id));
const hybs=[...discovered].filter(id=>!BASE.includes(id));
if(hybs.length){
addSec('Discovered Hybrids · '+hybs.length);
hybs.sort((a,b)=>C[a].t-C[b].t||C[a].n.localeCompare(C[b].n)).forEach(id=>makeCard(id));
}
}
function addSec(txt){
const el=_ce('div');el.className='sec-lbl';el.textContent=txt;
labGrid.appendChild(el);
}
function makeCard(id){
const c=C[id];
const el=_ce('div');
el.className='card t'+c.t;el.dataset.id=id;
if(id===slotA)el.classList.add('selected-a');
if(id===slotB)el.classList.add('selected-b');
el.appendChild(makeEmoji(id));
const nm=_ce('div');nm.className='c-nm';nm.textContent=c.n;
el.appendChild(nm);
el.addEventListener('click',()=>onCardClick(id));
labGrid.appendChild(el);
}
function renderBook(){
bookGrid.innerHTML='';
HYBRIDS.forEach(id=>{
const c=C[id],found=discovered.has(id);
const el=_ce('div');
el.className='be'+(found?' found t'+c.t:'');
if(found){el.appendChild(makeEmoji(id));}
else{const ph=_ce('div');ph.className='be-em';ph.textContent='?';el.appendChild(ph);}
const nm=_ce('div');nm.className='be-nm'+(found?'':' dark');
nm.textContent=found?c.n:'???';el.appendChild(nm);
if(found&&c.t===2){const t=_ce('div');t.className='be-tier';t.textContent='✨ RARE';el.appendChild(t);}
if(found)el.addEventListener('click',()=>showResult(id,false));
bookGrid.appendChild(el);
});
}
function updateProg(){prog.textContent=discCount()+' / '+TOTAL;}
function showResult(id,isNew){
const c=C[id];
ovEmWrap.innerHTML='';
const em=makeEmoji(id,'lg');
em.style.animation='cardPop .45s cubic-bezier(.175,.885,.32,1.275) .08s both';
ovEmWrap.appendChild(em);
ovName.textContent=c.n;ovDesc.textContent=c.d;
ovBadge.textContent=isNew?'✨ New Discovery!':'Already in Duck Book';
ovBadge.className='ov-badge '+(isNew?'new':'known');
ovRecipe.innerHTML='';
const rp=PARENTS[id];
if(rp){
ovRecipe.innerHTML=`<span>${baseEmoji(rp[0])} ${C[rp[0]]?.n||rp[0]}</span><span style="opacity:.3">+</span><span>${baseEmoji(rp[1])} ${C[rp[1]]?.n||rp[1]}</span>`;
}
ovBox.style.display='flex';
ovBox.style.animation='none';void ovBox.offsetWidth;
ovBox.style.animation='ovPop .4s cubic-bezier(.175,.885,.32,1.275)';
ovBg.style.display='block';
if(isNew)spawnSparks();
}
const SPARKS=['✨','⭐','💫','🌟','🪄','🔮','💥','🎊'];
function spawnSparks(){
sparkRing.innerHTML='';
for(let i=0;i<14;i++){
const sp=_ce('div');sp.className='sp';
const a=(i/14)*_pi*2,r=42+_mr()*32;
sp.style.setProperty('--sx',Math.cos(a)*6+'px');sp.style.setProperty('--sy',Math.sin(a)*6+'px');
sp.style.setProperty('--ex',Math.cos(a)*r+'px');sp.style.setProperty('--ey',Math.sin(a)*r+'px');
sp.style.left='50%';sp.style.top='50%';
sp.style.animationDelay=_mr()*0.2+'s';
sp.textContent=SPARKS[_mf(_mr()*SPARKS.length)];
sparkRing.appendChild(sp);
}
}
function closeOverlay(){ovBg.style.display='none';ovBox.style.display='none';}
ovBg.addEventListener('click',closeOverlay);
ovBox.addEventListener('click',closeOverlay);
let toastT;
function showToast(msg){
toastEl.textContent=msg;toastEl.style.opacity='1';
clearTimeout(toastT);toastT=setTimeout(()=>toastEl.style.opacity='0',1800);
}
_qsa('.tab').forEach(t=>{
t.addEventListener('click',()=>{
const tab=t.dataset.tab;
_qsa('.tab,.panel').forEach(x=>x.classList.remove('active'));
t.classList.add('active');
_gi('panel-'+tab).classList.add('active');
});
});
_gi('menu-btn').addEventListener('click',()=>{
if(window._exitLab)window._exitLab();
});
document.addEventListener('keydown',function _labKeys(e){
if(!_gi('lab-grid'))return document.removeEventListener('keydown',_labKeys);
if(e.key==='Enter'){e.preventDefault();doCombine();}
if(e.key==='Escape'){if(window._exitLab)window._exitLab();}
});
renderLab();renderBook();updateProg();
})();
})();
}
})();
(()=>{
let _cardsEl=null;
window._launchCards=function(){
window.paused=true;
if(window._menuEl)window._menuEl.style.display='none';
if(window._homeBtn)window._homeBtn.style.display='';
window._cardsActive=true;
if(_cardsEl){_cardsEl.remove();_cardsEl=null;}
_buildCards();
};
window._exitCards=function(){
window._cardsActive=false;
window.paused=false;
if(typeof timerInterval!=='undefined'&&timerInterval){clearInterval(timerInterval);timerInterval=null;}
if(_cardsEl){_cardsEl.remove();_cardsEl=null;}
if(window._menuEl)window._menuEl.style.display='flex';
if(window._randomiseFeatured)window._randomiseFeatured();
if(window._homeBtn)window._homeBtn.style.display='none';
};
function _buildCards(){
if(!_gi('cards-font')){
let lnk=_ce('link');lnk.id='cards-font';
lnk.rel='stylesheet';
lnk.href='https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap';
document.head.appendChild(lnk);
}
if(!_gi('cards-style')){
let st=_ce('style');st.id='cards-style';
st.textContent=`@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
--bg:#0c0d1a;--s1:#14162e;--s2:#1c1f40;--s3:#252850;
--gold:#f5c842;--gold-g:rgba(245,200,66,0.4);
--green:#27ae60;--red:#e74c3c;
--border:rgba(255,255,255,0.07);
--text:#e8eaff;--td:rgba(232,234,255,0.4);
--font:'Nunito',sans-serif;
}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:var(--font);
overflow:hidden;touch-action:manipulation;user-select:none;-webkit-user-select:none;}
#app{display:flex;flex-direction:column;height:100vh;height:100dvh;}
/* header */
#hdr{display:flex;align-items:center;justify-content:space-between;
padding:0 14px;height:50px;flex-shrink:0;
background:var(--s1);border-bottom:1px solid var(--border);}
#hdr-title{font-size:14px;font-weight:900;}
#menu-btn{font-size:11px;font-weight:900;color:var(--td);background:rgba(255,255,255,0.05);
border:1px solid var(--border);padding:6px 12px;border-radius:8px;cursor:pointer;}
/* hud bar */
#hud{display:flex;align-items:center;gap:0;height:40px;flex-shrink:0;
background:rgba(12,13,26,0.95);border-bottom:1px solid var(--border);}
.hud-seg{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;
font-size:12px;font-weight:900;border-right:1px solid var(--border);}
.hud-seg:last-child{border-right:none;}
.hud-val{font-size:14px;font-weight:900;color:#fff;}
#timer-val{color:var(--gold);}
#timer-val.danger{color:var(--red);animation:timerPulse .5s ease-in-out infinite;}
@keyframes timerPulse{0%,100%{opacity:1;}50%{opacity:.4;}}
#level-val{color:var(--gold);}
#pairs-val{color:#80d0ff;}
/* main arena */
#arena{flex:1;display:flex;align-items:center;justify-content:center;
padding:10px;overflow:hidden;position:relative;}
/* card grid */
#card-grid{display:grid;gap:8px;}
/* card */
.card-wrap{cursor:pointer;perspective:600px;}
.card-inner{position:relative;width:100%;height:100%;
transform-style:preserve-3d;transition:transform .35s cubic-bezier(.4,0,.2,1);
border-radius:12px;}
.card-wrap.flipped .card-inner{transform:rotateY(180deg);}
.card-wrap.matched .card-inner{transform:rotateY(180deg);}
.card-face{position:absolute;inset:0;border-radius:12px;
display:flex;align-items:center;justify-content:center;
backface-visibility:hidden;-webkit-backface-visibility:hidden;}
/* back face */
.card-back{
background:linear-gradient(135deg,#1a1c38,#252848);
border:1.5px solid rgba(255,255,255,0.1);
font-size:22px;
box-shadow:0 2px 8px rgba(0,0,0,0.4);
}
.card-back::after{
content:'🃏';font-size:inherit;
filter:opacity(0.6);
}
/* front face */
.card-front{
background:linear-gradient(135deg,#1e2244,#2a3060);
border:1.5px solid rgba(255,255,255,0.12);
transform:rotateY(180deg);
flex-direction:column;gap:3px;
box-shadow:0 2px 8px rgba(0,0,0,0.4);
}
.card-emoji{font-size:32px;line-height:1;}
.card-wrap.matched .card-front{
background:linear-gradient(135deg,#0d2e1a,#1a5030);
border-color:rgba(39,174,96,0.5);
box-shadow:0 0 14px rgba(39,174,96,0.3);
}
.card-wrap.wrong .card-inner{animation:cardWrong .4s ease;}
@keyframes cardWrong{0%,100%{transform:rotateY(180deg);}25%{transform:rotateY(180deg) translateX(-4px);}75%{transform:rotateY(180deg) translateX(4px);}}
/* match burst */
.match-burst{
position:absolute;pointer-events:none;z-index:20;
font-size:20px;animation:burstPop .6s ease forwards;
}
@keyframes burstPop{
0%{opacity:1;transform:translate(-50%,-50%) scale(0);}
60%{opacity:1;transform:translate(-50%,-50%) scale(1.4);}
100%{opacity:0;transform:translate(-50%,-50%) scale(1.8) translateY(-20px);}
}
/* overlays */
.overlay{position:absolute;inset:0;display:flex;flex-direction:column;
align-items:center;justify-content:center;gap:14px;
background:rgba(8,9,20,0.9);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
z-index:30;}
.ov-icon{font-size:56px;line-height:1;}
.ov-title{font-size:26px;font-weight:900;letter-spacing:-.01em;}
.ov-sub{font-size:12px;color:var(--td);text-align:center;max-width:260px;line-height:1.6;}
/* level complete card */
#complete-card,#gameover-card,#start-card{
background:var(--s1);border:1px solid rgba(255,255,255,0.1);
border-radius:18px;padding:18px 24px;
display:flex;flex-direction:column;align-items:center;gap:8px;
min-width:220px;
}
.score-row{display:flex;justify-content:space-between;align-items:center;
width:100%;font-size:12px;color:var(--td);font-weight:700;padding:3px 0;}
.score-row span{color:var(--text);font-weight:900;}
.big-btn{padding:12px 36px;border-radius:12px;border:none;font-size:13px;
font-weight:900;cursor:pointer;font-family:var(--font);color:#fff;
transition:transform .08s,filter .12s;touch-action:manipulation;margin-top:4px;}
.big-btn:active{transform:scale(0.95);}
.big-btn.green{background:linear-gradient(90deg,#1a8040,#107030);}
.big-btn.blue{background:linear-gradient(90deg,#1a40a0,#103080);}
.big-btn.red{background:linear-gradient(90deg,#a01820,#701010);}
/* streak badge */
#streak-badge{
position:absolute;top:8px;right:8px;
background:linear-gradient(135deg,#7a4000,var(--gold));
color:#1a0800;font-size:10px;font-weight:900;
padding:4px 9px;border-radius:20px;
opacity:0;transition:opacity .2s;pointer-events:none;z-index:10;
}
#streak-badge.visible{opacity:1;}
/* level bar */
#level-bar{
position:absolute;bottom:0;left:0;right:0;height:3px;
background:rgba(255,255,255,0.04);pointer-events:none;
}
#level-fill{height:100%;background:linear-gradient(90deg,#1a40a0,var(--gold));
border-radius:0 2px 2px 0;transition:width .3s ease;}
/* screen transitions */
.overlay{animation:ovIn .2s ease;}
@keyframes ovIn{from{opacity:0;}to{opacity:1;}}`;
document.head.appendChild(st);
}
_cardsEl=_ce('div');
_cardsEl.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000085;overflow:hidden;font-family:Nunito,sans-serif;background:#0c0d1a;';
_cardsEl.innerHTML=`
<div id="app" style="display:flex;flex-direction:column;height:100vh;height:100dvh;">
<div id="hdr">
<button id="menu-btn" onclick="window._exitCards()">← Menu</button>
<div id="hdr-title">🃏 Duck Cards</div>
<div style="width:60px"></div>
</div>
<div id="hud">
<div class="hud-seg">⏱️ <span class="hud-val" id="timer-val">30</span></div>
<div class="hud-seg">🃏 Lv <span class="hud-val" id="level-val">1</span></div>
<div class="hud-seg">🔵 <span class="hud-val" id="pairs-val">0/4</span></div>
<div class="hud-seg">⭐ <span class="hud-val" id="score-val">0</span></div>
</div>
<div id="arena">
<div id="card-grid"></div>
<div id="streak-badge">🔥 x3 Streak!</div>
<div id="level-bar"><div id="level-fill" style="width:0%"></div></div>
<div class="overlay" id="start-screen">
<div class="ov-icon">🃏</div>
<div class="ov-title">Duck Cards</div>
<div class="ov-sub">Flip cards to find matching pairs. Beat the clock and build streaks for bonus points!</div>
<div id="start-card"><div class="score-row">Levels <span>12</span></div></div>
<button class="big-btn blue" id="start-btn">▶ Start Playing</button>
</div>
<div class="overlay" id="complete-screen" style="display:none;">
<div class="ov-icon">🎉</div>
<div class="ov-title" id="complete-title">Level Clear!</div>
<div id="complete-card">
<div class="score-row">Time bonus <span id="cb-time">+0</span></div>
<div class="score-row">Pairs found <span id="cb-pairs">0</span></div>
<div class="score-row">Streak bonus <span id="cb-streak">+0</span></div>
<div class="score-row" style="border-top:1px solid var(--border);margin-top:4px;padding-top:8px;">Total score <span id="cb-total" style="color:var(--gold);font-size:16px;">0</span></div>
</div>
<button class="big-btn green" id="next-btn">Next Level ▶</button>
</div>
<div class="overlay" id="gameover-screen" style="display:none;">
<div class="ov-icon">⏰</div>
<div class="ov-title">Time's Up!</div>
<div id="gameover-card">
<div class="score-row">Level reached <span id="go-level">1</span></div>
<div class="score-row">Final score <span id="go-score" style="color:var(--gold);">0</span></div>
</div>
<button class="big-btn green" id="retry-btn">▶ Try Again</button>
<button class="big-btn blue" id="menu2-btn" style="padding:8px 24px;font-size:11px;margin-top:-6px;">Main Menu</button>
</div>
<div class="overlay" id="win-screen" style="display:none;">
<div class="ov-icon">🏆</div>
<div class="ov-title">Duck Master!</div>
<div class="ov-sub">You completed all 12 levels!</div>
<div id="complete-card"><div class="score-row">Final score <span id="win-score" style="color:var(--gold);font-size:16px;">0</span></div></div>
<button class="big-btn green" id="play-again-btn">▶ Play Again</button>
</div>
</div>
</div>`;
_ba(_cardsEl);
(function(){
(()=>{
'use strict';
const CREATURES=['🦆','🐥','🥚','🦊','🐺','🐍','🦅','🐻','🦁','🧊','🐉','👽','🧟','🦇','🐊','🦢','🦉','🐙','🦑','🐝','🦋','🐢','🦕','💀','👾','🦈','🦍','🐗','🦏','🐇','⚡','🔥','💥','🌪️','☄️','🎭'];
const LEVELS=[{pairs:4,cols:4,rows:2,time:30},{pairs:6,cols:4,rows:3,time:45},{pairs:8,cols:4,rows:4,time:60},{pairs:10,cols:5,rows:4,time:70},{pairs:12,cols:6,rows:4,time:80},{pairs:15,cols:6,rows:5,time:90},{pairs:18,cols:6,rows:6,time:100},{pairs:20,cols:5,rows:8,time:110},{pairs:24,cols:6,rows:8,time:120},{pairs:28,cols:7,rows:8,time:130},{pairs:32,cols:8,rows:8,time:140},{pairs:36,cols:9,rows:8,time:150}];
const arena=_gi('arena');
const grid=_gi('card-grid');
const timerEl=_gi('timer-val');
const levelEl=_gi('level-val');
const pairsEl=_gi('pairs-val');
const scoreEl=_gi('score-val');
const streakBadge=_gi('streak-badge');
const levelFill=_gi('level-fill');
const startScreen=_gi('start-screen');
const completeScreen=_gi('complete-screen');
const gameoverScreen=_gi('gameover-screen');
const winScreen=_gi('win-screen');
const startBtn=_gi('start-btn');
const nextBtn=_gi('next-btn');
const retryBtn=_gi('retry-btn');
const playAgainBtn=_gi('play-again-btn');
let levelIdx=0,score=0,timeLeft=0,streak=0,bestStreak=0;
let flipped=[],matched=0,locked=false,timerInterval=null;
let cards=[];
function shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=_mf(_mr()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
function showOnly(el){[startScreen,completeScreen,gameoverScreen,winScreen].forEach(s=>{s.style.display=s===el?'flex':'none';});}
function updateHUD(){timerEl.textContent=timeLeft;timerEl.className=timeLeft<=10?'hud-val danger':'hud-val';levelEl.textContent=levelIdx+1;const lv=LEVELS[levelIdx];pairsEl.textContent=matched+'/'+lv.pairs;scoreEl.textContent=score;levelFill.style.width=((levelIdx/LEVELS.length)*100)+'%';}
function pop(x,y,txt){const d=_ce('div');d.className='match-burst';d.textContent=txt;d.style.cssText='left:'+x+'px;top:'+y+'px;';arena.appendChild(d);setTimeout(()=>d.remove(),700);}
function showStreak(){if(streak<2)return;streakBadge.textContent='🔥 x'+streak+' Streak!';streakBadge.classList.add('visible');clearTimeout(streakBadge._t);streakBadge._t=setTimeout(()=>streakBadge.classList.remove('visible'),1200);}
function buildLevel(){const lv=LEVELS[levelIdx];grid.innerHTML='';cards=[];flipped=[];matched=0;locked=false;const pool=shuffle([...CREATURES]).slice(0,lv.pairs);const deck=shuffle([...pool,...pool]);const arenaW=arena.clientWidth-20;const arenaH=arena.clientHeight-20;const cardW=_mf(_mn(arenaW/lv.cols,arenaH/lv.rows)-8);const cardH=_mf(cardW*1.2);grid.style.cssText='display:grid;gap:6px;grid-template-columns:repeat('+lv.cols+','+cardW+'px);';deck.forEach((emoji,i)=>{const wrap=_ce('div');wrap.className='card-wrap';wrap.style.cssText='width:'+cardW+'px;height:'+cardH+'px;';wrap.dataset.emoji=emoji;wrap.dataset.idx=i;wrap.innerHTML='<div class="card-inner"><div class="card-face card-back"></div><div class="card-face card-front"><div class="card-emoji">'+emoji+'</div></div></div>';wrap.addEventListener('click',()=>flipCard(wrap));grid.appendChild(wrap);cards.push(wrap);});updateHUD();}
function flipCard(wrap){if(locked)return;if(wrap.classList.contains('flipped'))return;if(wrap.classList.contains('matched'))return;if(flipped.length>=2)return;wrap.classList.add('flipped');flipped.push(wrap);if(flipped.length===2)checkMatch();}
function checkMatch(){locked=true;const[a,b]=flipped;if(a.dataset.emoji===b.dataset.emoji){streak++;if(streak>bestStreak)bestStreak=streak;const bonus=streak>=3?streak*10:0;score+=20+bonus+_mc(timeLeft/2);showStreak();setTimeout(()=>{a.classList.add('matched');b.classList.add('matched');const ar=a.getBoundingClientRect(),br=arena.getBoundingClientRect();pop(ar.left-br.left+ar.width/2,ar.top-br.top+ar.height/2,'✨');matched++;flipped=[];locked=false;updateHUD();if(matched===LEVELS[levelIdx].pairs)levelComplete();},300);}else{streak=0;setTimeout(()=>{a.classList.add('wrong');b.classList.add('wrong');setTimeout(()=>{a.classList.remove('flipped','wrong');b.classList.remove('flipped','wrong');flipped=[];locked=false;},400);},600);}}
function startTimer(){clearInterval(timerInterval);timeLeft=LEVELS[levelIdx].time;updateHUD();timerInterval=setInterval(()=>{timeLeft--;updateHUD();if(timeLeft<=0){clearInterval(timerInterval);gameOver();}},1000);}
function levelComplete(){clearInterval(timerInterval);const timeBonus=timeLeft*5;const streakBonus=bestStreak>=3?bestStreak*15:0;score+=timeBonus+streakBonus;updateHUD();_gi('cb-time').textContent='+'+timeBonus;_gi('cb-pairs').textContent=LEVELS[levelIdx].pairs;_gi('cb-streak').textContent='+'+streakBonus;_gi('cb-total').textContent=score;if(levelIdx===LEVELS.length-1){_gi('win-score').textContent=score;showOnly(winScreen);}else{_gi('complete-title').textContent='Level '+(levelIdx+1)+' Clear!';showOnly(completeScreen);}}
function gameOver(){_gi('go-level').textContent=levelIdx+1;_gi('go-score').textContent=score;showOnly(gameoverScreen);}
function startGame(){levelIdx=0;score=0;streak=0;bestStreak=0;showOnly(null);buildLevel();startTimer();}
function nextLevel(){levelIdx++;streak=0;bestStreak=0;showOnly(null);buildLevel();startTimer();}
startBtn.addEventListener('click',startGame);
nextBtn.addEventListener('click',nextLevel);
retryBtn.addEventListener('click',startGame);
playAgainBtn.addEventListener('click',startGame);
_gi('menu2-btn').addEventListener('click',()=>window._exitCards());
})();
})();
}
})();
(()=>{
let _kingdomEl=null;
window._launchKingdom=function(){
window.paused=true;
if(window._menuEl)window._menuEl.style.display='none';
if(window._homeBtn)window._homeBtn.style.display='';
window._kingdomActive=true;
if(_kingdomEl){_kingdomEl.remove();_kingdomEl=null;}
_buildKingdom();
};
window._exitKingdom=function(){
window._kingdomActive=false;
window.paused=false;
if(_kingdomEl){
if(_kingdomEl._resizeH)window.removeEventListener('resize',_kingdomEl._resizeH);
_kingdomEl.remove();_kingdomEl=null;
}
if(window._menuEl)window._menuEl.style.display='flex';
if(window._randomiseFeatured)window._randomiseFeatured();
if(window._homeBtn)window._homeBtn.style.display='none';
};
function _buildKingdom(){
if(!_gi('kd-font')){
let lnk=_ce('link');lnk.id='kd-font';
lnk.rel='stylesheet';
lnk.href='https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=Nunito:wght@600;700;800;900&display=swap';
document.head.appendChild(lnk);
}
if(!_gi('kd-style')){
let st=_ce('style');st.id='kd-style';
st.textContent=`
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
--bg:#1a1208;
--bg2:#221a0c;
--bg3:#2e2210;
--border:rgba(180,140,60,0.2);
--border2:rgba(180,140,60,0.4);
--gold:#d4a832;
--gold2:#f0c84a;
--text:#e8d8a8;
--text2:rgba(232,216,168,0.55);
--green:#4a8c38;
--red:#9c3020;
--wood:#8c5a20;
--stone:#6a6050;
}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:'Nunito',sans-serif;overflow:hidden;user-select:none;-webkit-user-select:none;touch-action:manipulation}
#app{display:flex;flex-direction:column;height:100vh;height:100dvh;height:100svh;position:relative}
/* ── HUD ── */
#hud{
display:flex;align-items:center;gap:3px;height:38px;flex-shrink:0;
background:var(--bg2);overflow-x:auto;scrollbar-width:none;
border-bottom:2px solid var(--border2);
padding:0 8px;
box-shadow:0 2px 12px rgba(0,0,0,0.5);
overflow-x:auto;
scrollbar-width:none;
}
#hud::-webkit-scrollbar{display:none;}
#kd-menu-btn{margin-left:auto;font-size:16px;background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:8px;padding:4px 8px;cursor:pointer;color:var(--text);font-family:inherit;line-height:1;}
.hud-res{
display:flex;align-items:center;gap:3px;
font-size:11px;font-weight:800;
background:rgba(0,0,0,0.3);
border:1px solid var(--border);
border-radius:6px;padding:2px 6px;
font-family:'Nunito',sans-serif;
flex-shrink:0;
}
.hud-res .val{color:var(--gold2);font-size:12px;font-weight:900}
.hud-res .delta{font-size:8px;margin-left:1px;color:#6abf50}
.hud-res .delta.neg{color:#c05040}
#hud-nest{
display:flex;align-items:center;gap:4px;
font-size:12px;font-weight:800;
background:rgba(120,40,20,0.35);
border:1px solid rgba(180,80,40,0.4);
border-radius:8px;padding:4px 8px;color:#e08060;
}
#hud-timer{
margin-left:auto;
display:flex;align-items:center;gap:4px;
font-size:12px;font-weight:900;
border-radius:8px;padding:4px 9px;
background:rgba(40,100,30,0.35);
border:1px solid rgba(60,140,40,0.4);
color:#80c860;
font-family:'Nunito',sans-serif;
transition:background .4s,border-color .4s,color .4s;
}
#hud-timer.danger{background:rgba(120,30,20,0.45);border-color:rgba(200,60,40,0.5);color:#e06040}
#hud-season{font-size:10px;font-weight:800;color:var(--text2);padding:0 2px;white-space:nowrap}
/* ── GRID ── */
#grid-wrap{position:relative;flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--bg)}
/* subtle parchment texture via gradient */
#grid-wrap::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,rgba(60,40,10,0.0),rgba(0,0,0,0.45));pointer-events:none;z-index:1}
#grid{position:relative;display:grid;z-index:2}
.tile{
position:relative;display:flex;align-items:center;justify-content:center;
font-size:20px;cursor:pointer;
border:1px solid rgba(100,70,20,0.25);
transition:background .15s,border-color .15s;
overflow:hidden;
}
.tile.locked{background:rgba(10,8,4,0.7);cursor:default}
.tile.locked::after{content:'';font-size:10px;opacity:0.18;position:absolute;bottom:2px;right:2px}
.tile.claimable{
background:rgba(40,28,8,0.8);
border-color:rgba(160,120,40,0.35);cursor:pointer;
}
.tile.claimable:hover{background:rgba(55,38,10,0.9);border-color:rgba(200,160,60,0.55)}
.tile.claimable::after{content:'＋';font-size:13px;opacity:0.4;color:var(--gold);position:absolute}
.tile.empty{background:rgba(30,22,8,0.6)}
.tile.empty:hover{background:rgba(48,34,10,0.8);border-color:rgba(160,120,40,0.4)}
.tile.rubble{background:rgba(50,35,10,0.7);border-color:rgba(120,90,30,0.3)}
.tile.building{background:rgba(26,18,6,0.85)}
.tile.building:hover{background:rgba(38,26,8,0.95);border-color:rgba(180,140,50,0.4)}
.tile.nest-tile{
background:radial-gradient(ellipse at 50% 50%,rgba(80,60,10,0.5),rgba(20,14,4,0.9));
border:2px solid rgba(200,160,50,0.6)!important;
cursor:default;
}
.tile.can-build{background:rgba(30,50,20,0.6)!important;border-color:rgba(80,140,50,0.45)!important}
.tile.selected-tile{border:2px solid var(--gold2)!important;box-shadow:inset 0 0 8px rgba(210,168,40,0.25)}
.tile-hp{position:absolute;bottom:2px;left:3px;right:3px;height:3px;background:rgba(0,0,0,0.55);border-radius:2px;overflow:hidden}
.tile-hp-fill{height:100%;border-radius:2px;transition:width .3s}
.tile-tier{position:absolute;top:2px;right:3px;font-size:8px;font-weight:900;color:var(--gold);letter-spacing:-1px}
#canvas{position:absolute;top:0;left:0;pointer-events:none;z-index:3}
/* ── TOOLBAR ── */
#toolbar{
flex-shrink:0;
background:var(--bg2);
border-top:2px solid var(--border2);
padding:6px 8px 6px;
box-shadow:0 -2px 12px rgba(0,0,0,0.4);
}
#toolbar-label{
font-size:8px;font-weight:700;letter-spacing:0.12em;
color:var(--text2);text-transform:uppercase;
font-family:'Nunito',sans-serif;
margin-bottom:5px;padding-left:2px;
}
#toolbar-grid{
display:flex;
flex-direction:row;
gap:5px;
overflow-x:auto;
scrollbar-width:none;
padding-bottom:2px;
}
#toolbar-grid::-webkit-scrollbar{display:none;}
#toolbar-scroll-hint{position:absolute;right:0;top:0;bottom:2px;width:28px;background:linear-gradient(90deg,transparent,rgba(10,8,20,0.88));pointer-events:none;z-index:5;display:flex;align-items:center;justify-content:flex-end;padding-right:4px;font-size:11px;color:rgba(255,255,255,0.45);}
.tool-btn{
display:flex;flex-direction:column;align-items:center;gap:1px;
padding:5px 8px 4px;
border-radius:9px;
border:1px solid var(--border);
background:rgba(0,0,0,0.3);
cursor:pointer;
font-size:9px;font-weight:800;
color:var(--text2);
font-family:'Nunito',sans-serif;
transition:all .15s;
flex-shrink:0;
min-width:52px;
}
.tool-btn .te{font-size:20px;line-height:1.1}
.tool-btn .cost{font-size:8px;color:var(--text2);margin-top:1px;line-height:1.3;text-align:center}
.tool-btn:hover{background:rgba(80,55,15,0.5);border-color:var(--border2);color:var(--text)}
.tool-btn.active{
background:rgba(100,70,10,0.55);
border-color:var(--gold);
color:var(--gold2);
box-shadow:0 0 10px rgba(200,160,40,0.2);
}
.tool-btn.cant-afford{opacity:0.35}
.free-badge{
font-size:7px;font-weight:900;
background:var(--green);color:#fff;
border-radius:4px;padding:1px 4px;margin-top:1px;
letter-spacing:0.04em;
}
/* ── PANEL ── */
#panel{
position:fixed;bottom:0;left:0;right:0;max-width:600px;margin:0 auto;
background:linear-gradient(180deg,var(--bg3) 0%,var(--bg2) 100%);
border-top:2px solid var(--border2);
padding:14px 16px 14px;
z-index:1000090;
transform:translateY(100%);transition:transform .22s cubic-bezier(.4,0,.2,1);
box-shadow:0 -6px 32px rgba(0,0,0,0.7),0 -1px 0 rgba(180,140,60,0.1);
}
#panel.open{transform:translateY(0)}
#panel-title{
font-size:15px;font-weight:900;
font-family:'Cinzel',serif;
color:var(--gold2);
margin-bottom:8px;
letter-spacing:0.04em;
display:flex;align-items:center;gap:6px;
}
#panel-stats{
margin-bottom:12px;
display:flex;flex-wrap:wrap;gap:6px;
}
.stat-chip{
display:inline-flex;align-items:center;gap:4px;
background:rgba(0,0,0,0.35);
border:1px solid rgba(180,140,60,0.18);
border-radius:7px;
padding:4px 9px;
font-size:11px;font-weight:800;
color:var(--text);
font-family:'Nunito',sans-serif;
}
.stat-chip b{color:var(--gold2);font-weight:900;}
.stat-chip.trait{border-color:rgba(160,200,100,0.3);background:rgba(60,100,30,0.3);}
.stat-chip.warn{border-color:rgba(200,80,30,0.4);background:rgba(100,30,10,0.3);color:#e09060;}
.stat-chip.note{border-color:rgba(100,140,255,0.25);background:rgba(30,50,120,0.3);color:rgba(200,215,255,0.8);font-style:italic;}
#panel-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px;}
#panel-hp-bar{height:5px;background:rgba(0,0,0,0.5);border-radius:3px;margin-bottom:10px;overflow:hidden;border:1px solid rgba(0,0,0,0.4)}
#panel-hp-fill{height:100%;border-radius:3px;transition:width .3s}
.panel-btn{
padding:8px 14px;border-radius:9px;border:none;
font-size:11px;font-weight:900;cursor:pointer;color:#fff;
font-family:'Nunito',sans-serif;letter-spacing:0.02em;
transition:filter .1s,transform .08s,box-shadow .1s;
}
.panel-btn:hover{filter:brightness(1.18);box-shadow:0 2px 8px rgba(0,0,0,0.4);}
.panel-btn:active{transform:scale(0.95)}
.panel-btn.upgrade{background:linear-gradient(135deg,#5a3a10,#9a6020);box-shadow:inset 0 1px 0 rgba(255,255,255,0.08);}
.panel-btn.branch{background:linear-gradient(135deg,#183a60,#2060a0);box-shadow:inset 0 1px 0 rgba(255,255,255,0.08);}
.panel-btn.sell{background:linear-gradient(135deg,#2a5a18,#3a8022)}
.panel-btn.sell-wood{background:linear-gradient(135deg,#5a3808,#8a5410)}
.panel-btn.close-p{background:rgba(255,255,255,0.07);color:var(--text2);border:1px solid rgba(255,255,255,0.08);}
.panel-btn:disabled{opacity:0.28;cursor:default;filter:none;transform:none;box-shadow:none;}
/* ── OVERLAYS ── */
.overlay{
position:absolute;inset:0;
display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
background:rgba(8,5,0,0.93);
backdrop-filter:blur(8px);z-index:100;
}
.ov-icon{font-size:64px}
.ov-title{
font-size:28px;font-weight:900;
font-family:'Cinzel',serif;
color:var(--gold2);letter-spacing:0.04em;
}
.ov-sub{font-size:13px;color:var(--text2);text-align:center;max-width:260px;line-height:1.6;font-weight:700}
.ov-card{
background:rgba(0,0,0,0.45);
border:1px solid var(--border2);
border-radius:14px;padding:14px 24px;min-width:210px;
}
.ov-row{display:flex;justify-content:space-between;font-size:12px;color:var(--text2);padding:4px 0;font-weight:700}
.ov-row span{color:var(--gold2);font-weight:900}
.big-btn{
padding:13px 38px;border-radius:12px;border:none;
font-size:13px;font-weight:900;cursor:pointer;color:#fff;
font-family:'Nunito',sans-serif;
transition:transform .08s,filter .12s;
}
.big-btn:active{transform:scale(0.95)}
.big-btn.green{background:linear-gradient(135deg,#2a6018,#3a8020)}
.big-btn.blue{background:linear-gradient(135deg,#1a3870,#102458)}
/* ── EFFECTS ── */
#raid-flash{position:absolute;inset:0;background:rgba(160,40,20,0.2);pointer-events:none;opacity:0;z-index:60;transition:opacity .35s}
#raid-announce{
position:absolute;top:54px;left:50%;transform:translateX(-50%);
background:rgba(100,20,10,0.92);
border:1px solid rgba(220,80,50,0.6);
border-radius:10px;padding:8px 20px;
font-size:13px;font-weight:900;
font-family:'Cinzel',serif;
color:#f09070;z-index:80;opacity:0;
transition:opacity .3s;pointer-events:none;white-space:nowrap;
box-shadow:0 0 20px rgba(160,40,20,0.4);
}
#log{
position:absolute;bottom:6px;left:8px;right:8px;
font-size:10px;color:rgba(210,190,130,0.7);font-weight:700;
pointer-events:none;z-index:40;
display:flex;flex-direction:column;gap:2px;align-items:flex-start;
}
.log-entry{
background:rgba(8,5,0,0.8);
border:1px solid rgba(150,110,30,0.2);
padding:3px 9px;border-radius:6px;
animation:logFade 3.2s ease forwards;
}
@keyframes logFade{0%{opacity:1}65%{opacity:1}100%{opacity:0}}
@keyframes nestPulse{0%,100%{text-shadow:none}50%{text-shadow:0 0 12px rgba(230,100,60,0.9)}}
.nest-hit{animation:nestPulse .5s ease}
@keyframes shake{0%,100%{transform:translate(0,0)}20%{transform:translate(-3px,2px)}40%{transform:translate(3px,-2px)}60%{transform:translate(-2px,3px)}80%{transform:translate(2px,-1px)}}
.shake{animation:shake 0.35s ease;}`;
document.head.appendChild(st);
}
_kingdomEl=_ce('div');
_kingdomEl.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;z-index:1000085;overflow:hidden;background:#1a1208;';
_kingdomEl.innerHTML=`
<div id="app">
<div id="hud">
<div class="hud-res">🌾<span class="val" id="h-food">50</span><span class="delta" id="d-food"></span></div>
<div class="hud-res">💰<span class="val" id="h-gold">30</span><span class="delta" id="d-gold"></span></div>
<div class="hud-res">🪵<span class="val" id="h-wood">20</span><span class="delta" id="d-wood"></span></div>
<div class="hud-res">⚡<span class="val" id="h-energy">0</span></div>
<div class="hud-res">🪨<span class="val" id="h-rock">0</span></div>
<div class="hud-res">🔩<span class="val" id="h-iron">0</span></div>
<div id="hud-nest">🪺 <span id="h-nest">50</span><span style="font-size:9px;opacity:0.6">/50</span></div>
<div class="hud-res">👥<span class="val" id="h-pop">0</span><span style="font-size:9px;opacity:0.6">/<span id="h-popcap">5</span></span></div>
<div id="hud-timer">⚔️ <span id="h-timer">--</span>s</div>
<div id="hud-season">Season <span id="h-season">1</span></div>
<button id="kd-menu-btn" onclick="if(window._exitKingdom)window._exitKingdom()">🏠</button>
</div>
<div id="grid-wrap">
<div id="grid"></div>
<canvas id="canvas"></canvas>
<div id="raid-flash"></div>
<div id="raid-announce">⚔️ Raid Incoming!</div>
<div id="log"></div>
</div>
<div id="toolbar">
<div id="toolbar-label">Build — select a building then tap a tile</div>
<div style="position:relative;overflow:hidden;"><div id="toolbar-grid"></div><div id="toolbar-scroll-hint">›</div></div>
</div>
<div id="panel">
<div id="panel-hp-bar"><div id="panel-hp-fill" style="width:100%"></div></div>
<div id="panel-title"></div>
<div id="panel-stats"></div>
<div id="panel-btns"></div>
</div>
</div>
<script>
'use strict';
const GS=17,NR=8,NC=8;
const BDEF={
farm: {e:'🌾',name:'Farm', cost:{g:15,w:10},bldHp:60,
tiers:[
{food:1},
{food:3,ug:20},
{food:5,ug:80,ab:'+30% crop sell price (stacks)'},
{food:8, eugc:50, ab:'Auto-sells 10 food every 12s (1 energy)',auto:true,interval:12,sell:8, nameLabel:'Auto Farm', eLabel:'🤖🌾'},
{food:12,eugc:100,ab:'Auto-sells every 9s (1 energy)', auto:true,interval:9, sell:14, nameLabel:'Auto Farm+',eLabel:'🤖🌾'},
{food:18,eugc:180,ab:'Auto-sells every 6s (2 energy)', auto:true,interval:6, sell:22,ecycl:2,nameLabel:'Mega Farm',eLabel:'🌾⚡'},
]},
sawmill: {e:'🪚',name:'Sawmill', cost:{g:15,w:5}, bldHp:60,
tiers:[
{wood:1},
{wood:3,ug:20},
{wood:5,ug:80,ab:'+30% wood sell price at markets (stacks)'},
{wood:8, eugc:40, ab:'Rubble clears free', nameLabel:'Auto Sawmill', eLabel:'🤖🪚'},
{wood:12,eugc:80, ab:'Rubble clears free + soldiers +15% speed', nameLabel:'Mega Sawmill', eLabel:'🪚⚡'},
]},
market: {e:'🏪',name:'Market', cost:{g:20,w:15},bldHp:50,
tiers:[
{sell:5},
{sell:8, ug:20},
{sell:12,ug:40,ab:'Also sell 10 wood for 6g'},
{sell:18,eugc:60, ab:'Also sell 10 wood for 8g', nameLabel:'Power Market',eLabel:'🏪⚡'},
{sell:26,eugc:120,ab:'Also sell 10 wood for 12g', nameLabel:'Mega Market', eLabel:'🏬'},
]},
wall: {e:'🧱',name:'Wall', cost:{g:5,w:8}, bldHp:40,
tiers:[{hp:40},{hp:80,ug:15},{hp:150,ug:30,ab:'Slows attackers 30%'}]},
tower: {e:'🗼',name:'Tower', cost:{g:25,w:20},bldHp:70,
tiers:[
{dmg:8, spd:1.8,rng:2.0, ab:'Basic arrow tower'},
{dmg:16,spd:1.5,rng:2.5,ug:20, ab:'Improved aim and range'},
{dmg:28,spd:1.2,rng:3.0,ug:40, ab:'Hits 2 enemies per shot'},
{dmg:45,spd:1.0,rng:3.5,ug:70, ab:'Hits 3 enemies, armour piercing'},
{dmg:70, spd:0.8,rng:4.0,eugc:60, ecost:1,chain:3,ab:'Electrified — chains to 3 enemies (1 energy/shot)', nameLabel:'Volt Tower', eLabel:'🗼⚡'},
{dmg:110,spd:0.6,rng:4.5,eugc:120,ecost:2,chain:4,ab:'Overcharged — chain 4, armour pierce (2 energy/shot)',nameLabel:'Arc Tower', eLabel:'🗼🔋'},
{dmg:160,spd:0.4,rng:5.0,eugc:200,ecost:3,chain:5,ab:'Apex — chain 5, stuns on hit (3 energy/shot)', nameLabel:'Apex Tower', eLabel:'🗼💥'},
]},
barracks:{e:'⚔️',name:'Barracks', cost:{g:30,w:25},bldHp:80,
tiers:[
{sol:1,shp:30, dmg:2,atkSpd:1.0,rng:1.5,spd:60, ab:'Basic soldier — 2 dmg/s'},
{sol:2,shp:40, dmg:3,atkSpd:1.0,rng:1.6,spd:65, ug:25, ab:'2 soldiers, +10 HP'},
{sol:2,shp:55, dmg:4,atkSpd:0.9,rng:1.7,spd:70, ug:50, ab:'+50% HP, faster attack'},
{sol:3,shp:60, dmg:5,atkSpd:0.9,rng:1.8,spd:75, ug:80, ab:'3 soldiers, improved range'},
{sol:3,shp:80, dmg:7,atkSpd:0.8,rng:2.0,spd:80, ug:120, ab:'Elite soldiers — +range, +speed'},
{sol:4,shp:100,dmg:10,atkSpd:0.7,rng:2.2,spd:90, eugc:60, ab:'4 soldiers, energy-forged weapons', nameLabel:'Elite Guard', eLabel:'⚔️⚡'},
{sol:5,shp:130,dmg:14,atkSpd:0.6,rng:2.5,spd:100,eugc:120,ab:'5 soldiers, lightning fast strikes', nameLabel:'Royal Guard', eLabel:'⚔️👑'},
]},

house: {e:'🏠',name:'House', cost:{g:20,w:15},bldHp:50,
tiers:[{pop:2},{pop:3,ug:20},{pop:5,ug:40,ab:'Attracts wandering ducks to defend'}]},
windmill: {e:'🌀',name:'Windmill', cost:{g:25,w:20},bldHp:60,
tiers:[
{energy:1},
{energy:2,ug:30},
{energy:3,ug:60,ab:'Boosts nearby +10%'},
{energy:5,eugc:40,ab:'Boosts nearby +20%', nameLabel:'Power Mill',eLabel:'🌀⚡'},
{energy:8,eugc:80,ab:'Boosts nearby +30%', nameLabel:'Mega Mill', eLabel:'🌀🔋'},
]},
factory: {e:'🏭',name:'Factory', cost:{g:60,w:50},bldHp:100,
tiers:[
{energy:3},
{energy:6,ug:40},
{energy:10,ug:80, ab:'Produces bonus wood each tick'},
{energy:15,eugc:60, ab:'Also produces +2 wood/s', nameLabel:'Power Factory',eLabel:'🏭⚡'},
{energy:22,eugc:120,ab:'Also produces +4 wood/s', nameLabel:'Mega Factory', eLabel:'🏭🔋'},
{energy:30,eugc:200,ab:'Also produces +6 wood/s + auto-clears rubble',nameLabel:'Apex Factory', eLabel:'🏭💡'},
]},
quarry: {e:'⛏️',name:'Quarry', cost:{g:30,w:20},bldHp:80,
tiers:[
{rock:1, ab:'Chips rock from the earth'},
{rock:2,ug:25, ab:'Deeper shafts — double output'},
{rock:3,ug:50, ab:'Ready to branch — choose Gold Mine or Iron Mine!'},
]},
gold_mine:{e:'💎',name:'Gold Mine', cost:{g:0,w:0}, bldHp:80,hidden:true,
tiers:[
{gold_ps:2, ab:'Veins of gold run deep'},
{gold_ps:4,eugc:40, ab:'Reinforced shafts double output'},
{gold_ps:7,eugc:80, ab:'Master miners at work',nameLabel:'Rich Vein',eLabel:'💰⛏️'},
]},
iron_mine:{e:'🔩',name:'Iron Mine', cost:{g:0,w:0}, bldHp:80,hidden:true,
tiers:[
{iron:2, ab:'Iron ore strengthens your buildings'},
{iron:4,eugc:40, ab:'Better furnaces — double output'},
{iron:7,eugc:80, ab:'Iron surplus: soldiers gain +20% attack',nameLabel:'Iron Forge',eLabel:'⚙️⛏️'},
]},
warship:{e:'🚢',name:'Warship',cost:{g:30,w:15,i:8},bldHp:90,
tiers:[
{dmg:20,spd:2.5,rng:3.2,ab:'Fires cannonballs at enemies. Best placed on grid edges.'},
{dmg:35,spd:2.0,rng:3.8,ug:30,ab:'Reinforced hull — improved range and damage'},
{dmg:55,spd:1.5,rng:4.5,ugic:20,ab:'Ironclad — double shot, armour piercing',nameLabel:'Ironclad',eLabel:'⚓🚢'},
]},
armory:{e:'⚔️',name:'Armory',cost:{g:20,w:10,i:5},bldHp:70,
tiers:[
{solBuff:3,ab:'Soldiers gain +3 attack while Armory stands'},
{solBuff:6,ugic:10,ab:'Advanced forging — soldiers +6 attack'},
{solBuff:10,ugic:25,ab:'Master forge — soldiers +10 attack',nameLabel:'Master Armory',eLabel:'⚔️🔥'},
]},
};

const ETYPES={
fox: {e:'🦊',name:'Fox', spd:55,hp:20, nestDmg:3, bldDmg:6, atkSpd:1.2,rng:1.2},
eagle:{e:'🦅',name:'Eagle', spd:75,hp:15, nestDmg:5, bldDmg:5, atkSpd:1.0,rng:1.2},
wolf: {e:'🐺',name:'Wolf', spd:35,hp:40, nestDmg:7, bldDmg:12,atkSpd:1.5,rng:1.2},
bear: {e:'🐻',name:'Bear', spd:22,hp:80, nestDmg:15,bldDmg:22,atkSpd:2.0,rng:1.3},
croc: {e:'🐊',name:'Croc', spd:18,hp:120,nestDmg:20,bldDmg:28,atkSpd:2.2,rng:1.3},
};
const RAID_TIMES=[45,60,80,90];
let G={}, R={food:50,gold:30,wood:20,energy:0,rock:0,iron:0};
let nestHp=50, season=1;
let raidCd=0, nextRaid=0, firstRaid=true;
let enemies=[], soldiers=[], bullets=[];
let autoAcc={}, ptAcc={};
let particles=[], pSeq=0;
let tool=null, selTile=null;
let sawmillFree=true, marketFree=true, farmFree=true, dead=false;
let lastT=0, resAcc=0, towerAcc={};
let eidSeq=0, sidSeq=0, bidSeq=0;
function initGrid(){
for(let r=0;r<GS;r++){G[r]={};for(let c=0;c<GS;c++){
const inStart=(r>=6&&r<=10&&c>=6&&c<=10);
G[r][c]={state:inStart?'empty':'locked',type:null,tier:0,hp:0,maxHp:0};
}}
G[NR][NC]={state:'nest',type:'nest',tier:0,hp:50,maxHp:50};
scheduleRaid();
}
function scheduleRaid(){
if(firstRaid){ nextRaid=90; firstRaid=false; }
else nextRaid=RAID_TIMES[Math.floor(Math.random()*RAID_TIMES.length)];
raidCd=nextRaid;
}
function buildGridDOM(){
const gEl=document.getElementById('grid');
const wrap=document.getElementById('grid-wrap');
// Compute available space robustly for iPad/desktop
const hud=document.getElementById('hud');
const toolbar=document.getElementById('toolbar');
const hudH=hud?hud.getBoundingClientRect().height:42;
const tbH=toolbar?toolbar.getBoundingClientRect().height:90;
const totalH=window.innerHeight||screen.height||600;
const totalW=window.innerWidth||screen.width||400;
const rawW=wrap.clientWidth||wrap.getBoundingClientRect().width||totalW;
const rawH=wrap.clientHeight||wrap.getBoundingClientRect().height||Math.max(200,totalH-hudH-tbH);
const maxW=rawW-4, maxH=rawH-4;
const ts=Math.floor(Math.min(maxW,maxH)/GS);
if(ts<=0){requestAnimationFrame(buildGridDOM);return;}
const gs=ts*GS;
gEl.style.cssText=\`display:grid;grid-template-columns:repeat(\${GS},\${ts}px);width:\${gs}px;height:\${gs}px;position:relative\`;
gEl.innerHTML='';
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const d=document.createElement('div');
d.id=\`t\${r}_\${c}\`;
d.style.cssText=\`width:\${ts}px;height:\${ts}px;\`;
d.addEventListener('click',()=>onTileClick(r,c));
gEl.appendChild(d);
}
const cv=document.getElementById('canvas');
const gRect=gEl.getBoundingClientRect(), wRect=wrap.getBoundingClientRect();
cv.width=gs; cv.height=gs;
cv.style.cssText=\`position:absolute;left:\${gRect.left-wRect.left}px;top:\${gRect.top-wRect.top}px;z-index:3\`;
renderGrid();
}
function renderGrid(){for(let r=0;r<GS;r++)for(let c=0;c<GS;c++)renderTile(r,c);}
function renderTile(r,c){
const t=G[r][c], el=document.getElementById(\`t\${r}_\${c}\`);
if(!el) return;
const isClaimable=t.state==='locked'&&isAdjUnlocked(r,c);
let cls='tile', inner='';
if(t.state==='nest'){cls+=' nest-tile';inner='🪺';}
else if(t.state==='locked'){cls+=isClaimable?' claimable':' locked';}
else if(t.state==='empty'){
cls+=' empty';
if(tool) cls+=' can-build';
}
else if(t.state==='rubble'){cls+=' rubble';inner='🪨';}
else if(t.state==='building'){
cls+=' building';
const tierDef=BDEF[t.type].tiers[t.tier];
const tileEmoji=tierDef&&tierDef.eLabel?tierDef.eLabel.split(' ')[0]:BDEF[t.type].e;
inner=tileEmoji;
const pct=Math.max(0,(t.hp/t.maxHp)*100);
inner+=\`<div class="tile-hp"><div class="tile-hp-fill" style="width:\${pct}%;background:\${pct>50?'#4a8c38':pct>25?'#c08820':'#902820'}"></div></div>\`;
const multiTier=['windmill','sawmill','market','farm','tower'];
if(t.tier>0)inner+=\`<div class="tile-tier">\${multiTier.includes(t.type)?'T'+(t.tier+1):'★'.repeat(Math.min(t.tier,3))}</div>\`;
}
if(selTile&&selTile.r===r&&selTile.c===c) cls+=' selected-tile';
el.className=cls;
el.innerHTML=inner;
}
function isAdjUnlocked(r,c){
for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){
const nr=r+dr,nc=c+dc;
if(nr>=0&&nr<GS&&nc>=0&&nc<GS&&G[nr][nc].state!=='locked') return true;
}
return false;
}
function tileSize(){return document.getElementById('grid')?document.getElementById('grid').clientWidth/GS:44;}
function buildToolbar(){
const tb=document.getElementById('toolbar-grid');
const _tbHint=document.getElementById('toolbar-scroll-hint');
if(tb&&_tbHint){tb.addEventListener('scroll',()=>{_tbHint.style.opacity=tb.scrollLeft+tb.clientWidth>=tb.scrollWidth-4?'0':'1';});}
tb.innerHTML='';
Object.entries(BDEF).forEach(([id,b])=>{
if(b.hidden)return;
const isFree=(id==='sawmill'&&sawmillFree)||(id==='market'&&marketFree)||(id==='farm'&&farmFree);
const canAfford=isFree||(R.gold>=b.cost.g&&R.wood>=b.cost.w&&(R.iron>=(b.cost.i||0)));
const btn=document.createElement('div');
btn.className='tool-btn'+(tool===id?' active':'')+((!canAfford&&!isFree)?' cant-afford':'');
const costStr=isFree?'<div class="free-badge">FREE</div>':\`<div class="cost">\${b.cost.g}g&nbsp;\${b.cost.w}w</div>\`;
btn.innerHTML=\`<div class="te">\${b.e}</div><div>\${b.name}</div>\${costStr}\`;
btn.addEventListener('click',()=>{
tool=tool===id?null:id;
selTile=null;closePanel();
buildToolbar();renderGrid();
});
tb.appendChild(btn);
});
}
function onTileClick(r,c){
const t=G[r][c];
if(t.state==='nest'){openNestPanel();return;}
if(t.state==='locked'){if(isAdjUnlocked(r,c))claimTile(r,c);return;}
if(t.state==='building'){selTile={r,c};tool=null;openBuildingPanel(r,c);buildToolbar();renderGrid();return;}
if(t.state==='rubble'){tryClearRubble(r,c);return;}
if(tool&&t.state==='empty'){tryBuild(r,c,tool);return;}
selTile=null;closePanel();buildToolbar();renderGrid();
}
function claimTile(r,c){
if(R.gold<15){logMsg('Need 15g to claim tile');return;}
R.gold-=15;
G[r][c].state='empty';
updateHUD();renderGrid();logMsg('New land claimed for 15g');
}
function tryBuild(r,c,bid){
const b=BDEF[bid];
const ts=tileSize();
const blocked=soldiers.some(s=>Math.floor(s.px/ts)===c&&Math.floor(s.py/ts)===r);
if(blocked){logMsg('A soldier duck is standing there!');return;}
const isFree=(bid==='sawmill'&&sawmillFree)||(bid==='market'&&marketFree)||(bid==='farm'&&farmFree);
if(!isFree&&(R.gold<b.cost.g||R.wood<b.cost.w||(b.cost.i&&R.iron<b.cost.i))){logMsg('Not enough resources!');return;}
if(!isFree){R.gold-=b.cost.g;R.wood-=b.cost.w;if(b.cost.i)R.iron-=b.cost.i;}else{if(bid==='sawmill')sawmillFree=false;if(bid==='market')marketFree=false;if(bid==='farm')farmFree=false;}
const t0=b.tiers[0];
const hp=bid==='wall'?t0.hp:b.bldHp;
G[r][c]={state:'building',type:bid,tier:0,hp,maxHp:hp};
if(bid==='tower')towerAcc[\`\${r}_\${c}\`]=0;
tool=null;closePanel();buildToolbar();renderTile(r,c);updateHUD();
logMsg(\`\${b.e} \${b.name} built\`);
}
function tryClearRubble(r,c){
const free=hasEliteSawmill();
const cg=free?0:8, cw=free?0:5;
if(R.gold<cg||R.wood<cw){logMsg(\`Need \${cg}g \${cw}w to clear rubble\`);return;}
R.gold-=cg;R.wood-=cw;
G[r][c]={state:'empty',type:null,tier:0,hp:0,maxHp:0};
renderTile(r,c);updateHUD();logMsg('Rubble cleared');
}
function hasEliteSawmill(){for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){const t=G[r][c];if(t.state==='building'&&t.type==='sawmill'&&t.tier>=2)return true;}return false;}
function hasEliteFarm(){for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){const t=G[r][c];if(t.state==='building'&&t.type==='farm'&&t.tier===2)return true;}return false;}
function marketBonus(){
let count=0;
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c];
if(t.state==='building'&&t.type==='farm'&&t.tier>=2) count++;
}
return count*0.3;
}
function sawmillBonus(){
let count=0;
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c];
if(t.state==='building'&&t.type==='sawmill'&&t.tier>=2) count++;
}
return count*0.3;
}
function marketSellRate(marketTierIdx){
const base=BDEF.market.tiers[marketTierIdx]&&BDEF.market.tiers[marketTierIdx].sell||5;
return Math.round(base*(1+marketBonus()));
}
function woodSellRate(marketTierIdx){
const base=[0,0,6,8,12][marketTierIdx]||0;
return Math.round(base*(1+sawmillBonus()));
}
function popCap(){
let cap=5;
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c];
if(t.state==='building'&&t.type==='house') cap+=BDEF.house.tiers[t.tier].pop;
}
return cap;
}
function closePanel(){selTile=null;document.getElementById('panel').classList.remove('open');}
function openNestPanel(){
selTile={r:NR,c:NC};
const p=document.getElementById('panel');
document.getElementById('panel-hp-fill').style.width=(nestHp/50*100)+'%';
document.getElementById('panel-hp-fill').style.background=nestHp>25?'#4a8c38':nestHp>10?'#c08820':'#902820';
document.getElementById('panel-title').textContent='🪺 The Nest';
document.getElementById('panel-stats').innerHTML=\`HP: <b>\${Math.ceil(nestHp)}/50</b><br>Heart of your kingdom. If it falls, all is lost.\`;
document.getElementById('panel-btns').innerHTML='';
document.getElementById('panel-btns').appendChild(mkBtn('Close','close-p',closePanel));
p.classList.add('open');renderGrid();
}
function openBuildingPanel(r,c){
const t=G[r][c],b=BDEF[t.type],tier=b.tiers[t.tier];
const p=document.getElementById('panel');
const pct=Math.max(0,(t.hp/t.maxHp)*100);
document.getElementById('panel-hp-fill').style.width=pct+'%';
document.getElementById('panel-hp-fill').style.background=pct>50?'#4a8c38':pct>25?'#c08820':'#902820';
document.getElementById('panel-title').textContent=(tier.eLabel||b.e)+' '+(tier.nameLabel||b.name);
function chip(label,val,cls){return '<span class="stat-chip'+(cls?' '+cls:'')+'">'+label+': <b>'+val+'</b></span>';}
let stats='';
stats+=chip('HP',_mc(t.hp)+'/'+t.maxHp);
stats+=chip('Tier',(t.tier+1)+'/'+b.tiers.length);
if(t.type==='farm'){
const mb=marketBonus();
stats+=chip('Food','+'+tier.food+'/s','trait');
if(mb>0)stats+=chip('Mkt bonus','+'+_rnd(mb*100)+'%','trait');
if(t.tier>=3&&tier.auto)stats+=chip('Auto-sell','every '+tier.interval+'s ('+(tier.ecycl||1)+'⚡)','note');
}
if(t.type==='sawmill') stats+=chip('Wood','+'+tier.wood+'/s','trait');
if(t.type==='market'){
const rate=marketSellRate(t.tier);const bonus=marketBonus();const isAuto=t.tier>=3&&tier.auto;
stats+=chip('Sell',rate+'g per 10 food','trait');
if(bonus>0)stats+=chip('Bonus','+'+_rnd(bonus*100)+'%','trait');
if(isAuto)stats+=chip('Auto','every '+tier.interval+'s','note');
}
if(t.type==='wall') stats+=chip('Wall HP',tier.hp,'trait');
if(t.type==='tower'){
stats+=chip('Dmg',tier.dmg,'warn');
stats+=chip('Fire',tier.spd+'s');
stats+=chip('Range',tier.rng+'t');
if(t.tier>=4){stats+=chip('Chain',tier.chain,'warn');stats+=chip('Cost',tier.ecost+'⚡/shot','warn');}
}
if(t.type==='barracks'){stats+=chip('Soldiers',tier.sol+' per raid','trait');stats+=chip('HP',tier.shp);stats+=chip('Dmg',tier.dmg+'/s','warn');stats+=chip('Spd',tier.spd);stats+=chip('Range',tier.rng+'t');}
if(t.type==='house') stats+=chip('Pop cap','+'+tier.pop,'trait');
if(t.type==='windmill') stats+=chip('Energy','+'+tier.energy+'⚡/s','trait');
if(t.type==='factory'){const wb=[0,0,1,2,4,6][t.tier]||0;stats+=chip('Energy','+'+tier.energy+'⚡/s','trait');if(wb>0)stats+=chip('Wood','+'+wb+'/s','trait');}
if(t.type==='quarry') stats+=chip('Rock','+'+tier.rock+'/s','trait');
if(t.type==='gold_mine')stats+=chip('Gold','+'+tier.gold_ps+'/s','trait');
if(t.type==='iron_mine')stats+=chip('Iron','+'+tier.iron+'/s','trait');
if(tier.ab)stats+='<span class="stat-chip note" style="width:100%">ℹ️ '+tier.ab+'</span>';
document.getElementById('panel-stats').innerHTML=stats;
const btns=document.getElementById('panel-btns');
btns.innerHTML='';
const nextTier=b.tiers[t.tier+1];
if(nextTier){
const ugCost=nextTier.ug||nextTier.eugc||nextTier.ugic||0;
const isEnergy=!!nextTier.eugc;
const isIron=!!nextTier.ugic;
const canAfford=isEnergy?(R.energy>=ugCost):isIron?(R.iron>=ugCost):(R.gold>=ugCost);
const ub=mkBtn('Upgrade ('+ugCost+(isEnergy?'⚡':isIron?'🔩':'g')+')','upgrade',function(){
if(isEnergy){if(R.energy<ugCost){logMsg('Not enough energy');return;}R.energy-=ugCost;}
else if(isIron){if(R.iron<ugCost){logMsg('Not enough iron');return;}R.iron-=ugCost;}
else{if(R.gold<ugCost){logMsg('Not enough gold');return;}R.gold-=ugCost;}
t.tier++;
if(b.bldHp){t.maxHp=Math.round(b.bldHp*(1+t.tier*0.5));t.hp=t.maxHp;}
const nt2=b.tiers[t.tier];
openBuildingPanel(r,c);updateHUD();renderTile(r,c);logMsg((nt2.eLabel||b.e)+' '+(nt2.nameLabel||b.name)+' upgraded to tier '+(t.tier+1));
});
ub.disabled=!canAfford;
btns.appendChild(ub);
}
if(t.type==='market'){
const foodRate=marketSellRate(t.tier);
const sfb=mkBtn('Sell 10\ud83c\udf3e \u2192 '+foodRate+'\ud83d\udcb0','sell',function(){
if(R.food<10){logMsg('Need 10 food');return;}
R.food-=10;R.gold+=foodRate;
openBuildingPanel(r,c);updateHUD();logMsg('Sold food for '+foodRate+'g');
});
sfb.disabled=R.food<10;
btns.appendChild(sfb);
if(t.tier>=2){
const woodRate=woodSellRate(t.tier);
const swb=mkBtn('Sell 10\ud83e\udeb5 \u2192 '+woodRate+'\ud83d\udcb0','sell-wood',function(){
if(R.wood<10){logMsg('Need 10 wood');return;}
R.wood-=10;R.gold+=woodRate;
openBuildingPanel(r,c);updateHUD();logMsg('Sold wood for '+woodRate+'g');
});
swb.disabled=R.wood<10;
btns.appendChild(swb);
}
}
if(t.type==='quarry'&&t.tier===2){
const branchLabel=document.createElement('div');branchLabel.style.cssText='width:100%;font-size:10px;font-weight:900;color:var(--gold);letter-spacing:.06em;text-transform:uppercase;margin-bottom:2px;';branchLabel.textContent='⚒️ Choose specialisation:';btns.appendChild(branchLabel);
const goldBtn=mkBtn('⛏️ → 💎 Gold Mine','branch',function(){
G[r][c]={state:'building',type:'gold_mine',tier:0,hp:80,maxHp:80};
closePanel();buildToolbar();renderTile(r,c);updateHUD();
logMsg('Quarry converted to Gold Mine!');
});
const ironBtn=mkBtn('⛏️ → 🔩 Iron Mine','branch',function(){
G[r][c]={state:'building',type:'iron_mine',tier:0,hp:80,maxHp:80};
closePanel();buildToolbar();renderTile(r,c);updateHUD();
logMsg('Quarry converted to Iron Mine!');
});
btns.appendChild(goldBtn);btns.appendChild(ironBtn);
}
const db=mkBtn('Demolish','close-p',function(){
G[r][c]={state:'empty',type:null,tier:0,hp:0,maxHp:0};
closePanel();buildToolbar();renderTile(r,c);updateHUD();
logMsg(b.e+' '+b.name+' demolished');
});
btns.appendChild(db);
btns.appendChild(mkBtn('Close','close-p',closePanel));
p.classList.add('open');renderGrid();
}
function mkBtn(txt,cls,fn){
const b=document.createElement('button');
b.className='panel-btn '+cls;b.textContent=txt;
b.addEventListener('click',fn);return b;
}
function updateHUD(){
document.getElementById('h-food').textContent=Math.floor(R.food);
document.getElementById('h-gold').textContent=Math.floor(R.gold);
document.getElementById('h-wood').textContent=Math.floor(R.wood);
document.getElementById('h-energy').textContent=Math.floor(R.energy);
document.getElementById('h-rock').textContent=Math.floor(R.rock||0);
document.getElementById('h-iron').textContent=Math.floor(R.iron||0);
document.getElementById('h-nest').textContent=Math.ceil(nestHp);
document.getElementById('h-season').textContent=season;
document.getElementById('h-pop').textContent=soldiers.length;
document.getElementById('h-popcap').textContent=popCap();
const tc=Math.ceil(raidCd);
document.getElementById('h-timer').textContent=tc>0?tc:'!';
const te=document.getElementById('hud-timer');
te.className=tc<=15?'danger':'';
setDelta('d-food',foodDelta());
setDelta('d-gold',0);
setDelta('d-wood',woodDelta());
}
function setDelta(id,v){
const el=document.getElementById(id);if(!el)return;
if(v>0){el.textContent='+'+v;el.className='delta';}
else if(v<0){el.textContent=v;el.className='delta neg';}
else el.textContent='';
}
function foodDelta(){
let d=0;
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c]; if(t.state!=='building') continue;
if(t.type==='farm') d+=BDEF.farm.tiers[t.tier].food;
}
return Math.round(d*10)/10;
}
function woodDelta(){
let d=0;
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c]; if(t.state!=='building') continue;
if(t.type==='sawmill') d+=BDEF.sawmill.tiers[t.tier].wood;
}
return d;
}
function findPath(sr,sc,er,ec){
const INF=1e9,dist=Array.from({length:GS},()=>Array(GS).fill(INF));
const prev=Array.from({length:GS},()=>Array(GS).fill(null));
dist[sr][sc]=0;const open=[{r:sr,c:sc,d:0}];
while(open.length){
open.sort((a,b)=>a.d-b.d);const{r,c,d}=open.shift();
if(d>dist[r][c])continue;if(r===er&&c===ec)break;
for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){
const nr=r+dr,nc=c+dc;
if(nr<0||nr>=GS||nc<0||nc>=GS)continue;
const nt=G[nr][nc];
let cost=1;if(nt.state==='locked')cost=2;if(nt.state==='building'&&nt.type==='wall')cost=8;
const nd=d+cost;
if(nd<dist[nr][nc]){dist[nr][nc]=nd;prev[nr][nc]={r,c};open.push({r:nr,c:nc,d:nd});}
}
}
if(dist[er][ec]===INF)return[];
const path=[];let cur={r:er,c:ec};
while(cur){path.unshift({...cur});cur=prev[cur.r][cur.c];}
return path;
}
function spawnRaid(){
flashRaid();
const count=2+Math.floor(season*1.4);
const pool=raidPool();
for(let i=0;i<count;i++){
const eType=pool[Math.floor(Math.random()*pool.length)];
const def=ETYPES[eType];
let r,c;const side=Math.floor(Math.random()*4);
if(side===0){r=0;c=Math.floor(Math.random()*GS);}
else if(side===1){r=GS-1;c=Math.floor(Math.random()*GS);}
else if(side===2){r=Math.floor(Math.random()*GS);c=0;}
else{r=Math.floor(Math.random()*GS);c=GS-1;}
const ts=tileSize();
enemies.push({
id:eidSeq++,type:eType,...def,r,c,
px:(c+0.5)*ts,py:(r+0.5)*ts,
hp:def.hp*(1+season*0.08),maxHp:def.hp*(1+season*0.08),
path:findPath(r,c,NR,NC),pathIdx:1,
atkCd:0,target:null,state:'move',slowTimer:0
});
}
season++;scheduleRaid();spawnSoldiers();updateHUD();buildToolbar();
logMsg(\`⚔️ Raid! \${count} enemies from the wilds\`);
}
function raidPool(){
if(season<3)return['fox','eagle'];
if(season<6)return['fox','eagle','wolf'];
if(season<10)return['fox','wolf','bear'];
return['wolf','bear','croc','fox'];
}
function spawnSoldiers(){
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c];
if(t.state!=='building'||t.type!=='barracks')continue;
const tier=BDEF.barracks.tiers[t.tier];
const ts=tileSize();
for(let s=0;s<tier.sol;s++){
if(soldiers.length>=popCap()) break;
const a=Math.random()*Math.PI*2;
soldiers.push({
id:sidSeq++,e:'🦆',r,c,
px:(c+0.5)*ts+Math.cos(a)*ts*0.5,
py:(r+0.5)*ts+Math.sin(a)*ts*0.5,
hp:tier.shp,maxHp:tier.shp,homeR:r,homeC:c,
dmg:tier.dmg||2,atkSpd:tier.atkSpd||1.0,
rngMult:tier.rng||1.5,spd:tier.spd||60,
atkCd:0,target:null,state:'patrol',
angle:Math.random()*Math.PI*2,patrolR:tileSize()*1.2
});
}
}
}
function flashRaid(){
const f=document.getElementById('raid-flash'),a=document.getElementById('raid-announce');
f.style.opacity='1';a.style.opacity='1';
setTimeout(()=>{f.style.opacity='0';a.style.opacity='0';},1300);
}
function updateAutoBuildings(dt){
const ts=tileSize();
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c]; if(t.state!=='building') continue;
const tier=BDEF[t.type]&&BDEF[t.type].tiers[t.tier];
if(!tier) continue;
const key=r+'_'+c;
if(t.type==='farm' && t.tier>=3 && tier.auto){
if(!autoAcc[key]) autoAcc[key]=0;
autoAcc[key]+=dt;
if(autoAcc[key]>=tier.interval){
autoAcc[key]=0;
const eCost=tier.ecycl||1;
if(R.energy>=eCost && R.food>=tier.sell){
const rate=_rnd(tier.sell*(1+marketBonus()));
R.food-=tier.sell; R.gold+=rate; R.energy-=eCost;
spawnHitParticles(key,rate);
logMsg('Auto Farm sold ' + tier.sell + ' food for ' + rate + 'g');
}
}
}
if(t.type==='market' && t.tier>=3){
if(!autoAcc[key]) autoAcc[key]=0;
autoAcc[key]+=dt;
if(autoAcc[key]>=tier.interval){
autoAcc[key]=0;
const eCost=tier.ecycl||1;
if(R.energy>=eCost && R.food>=10){
const rate=marketSellRate(t.tier);
R.food-=10; R.gold+=rate; R.energy-=eCost;
spawnHitParticles(key,rate);
logMsg(\`🤖 Auto-sold 10🌾 → \${rate}💰\`);
}
}
}
if(t.type==='tower' && t.tier>=3){
if(!ptAcc[key]) ptAcc[key]=0;
ptAcc[key]+=dt;
if(ptAcc[key]<tier.spd) continue;
if(R.energy<tier.ecost) continue;
const cx=(c+0.5)*ts, cy=(r+0.5)*ts, range=tier.rng*ts;
const inRange=enemies.filter(e=>{
const dx=e.px-cx,dy=e.py-cy;
return dx*dx+dy*dy<=range*range;
}).sort((a,b)=>(a.px-cx)**2+(a.py-cy)**2-(b.px-cx)**2-(b.py-cy)**2);
if(inRange.length===0) continue;
ptAcc[key]=0;
R.energy-=tier.ecost;
const chain=tier.chain||1;
for(let n=0;n<Math.min(chain,inRange.length);n++){
const tgt=inRange[n];
bullets.push({id:bidSeq++,px:cx,py:cy,tx:tgt.px,ty:tgt.py,
targetId:tgt.id,dmg:tier.dmg,spd:380,color:'#a0e0ff'});
spawnParticles(cx,cy,4,['#a0e0ff','#60b0ff','#fff'],55,0.2,3);
}
}
}
}
function gameLoop(ts){
if(!window._kingdomActive||dead)return;
const dt=Math.min((ts-lastT)/1000,0.1);lastT=ts;
if(dt>0.5){requestAnimationFrame(gameLoop);lastT=ts;return;}
raidCd-=dt;if(raidCd<=0)spawnRaid();
resAcc+=dt;if(resAcc>=1){resAcc-=1;tickResources();}
updateEnemies(dt);updateSoldiers(dt);updateTowers(dt);updateWarships(dt);updateAutoBuildings(dt);updateBullets(dt);
for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=(p.grav||30)*dt;p.life-=dt;if(p.life<=0)particles.splice(i,1);}
updateHUD();drawCanvas();
requestAnimationFrame(gameLoop);
}
function getArmoryBuff(){
let buff=0;
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c];if(t.state==='building'&&t.type==='armory'){
const tier=BDEF.armory.tiers[t.tier];buff+=tier.solBuff||0;
}
}
return buff;
}
function tickResources(){
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c];if(t.state!=='building')continue;
if(t.type==='farm') R.food +=BDEF.farm.tiers[t.tier].food;
if(t.type==='sawmill')R.wood +=BDEF.sawmill.tiers[t.tier].wood;
if(t.type==='windmill')R.energy+=BDEF.windmill.tiers[t.tier].energy;
if(t.type==='factory'){
 const ftier=BDEF.factory.tiers[t.tier];
 R.energy+=ftier.energy;
 if(t.tier>=2)R.wood+=([0,0,1,2,4,6][t.tier]||0);
 if(t.tier>=5){
 for(let rr=0;rr<GS;rr++)for(let cc=0;cc<GS;cc++){
 if(G[rr][cc].state==='rubble'){G[rr][cc]={state:'empty',type:null,tier:0,hp:0,maxHp:0};renderTile(rr,cc);}
 }
 }
}
if(t.type==='quarry') R.rock=Math.min((R.rock||0)+(BDEF.quarry.tiers[t.tier].rock||0),999);
if(t.type==='gold_mine')R.gold=Math.min(R.gold+(BDEF.gold_mine.tiers[t.tier].gold_ps||0),9999);
if(t.type==='iron_mine')R.iron=Math.min((R.iron||0)+(BDEF.iron_mine.tiers[t.tier].iron||0),999);
}
R.food=Math.min(R.food,999);R.gold=Math.min(R.gold,9999);R.wood=Math.min(R.wood,999);R.energy=Math.min(R.energy,999);R.rock=Math.min(R.rock||0,999);R.iron=Math.min(R.iron||0,999);
buildToolbar();
}
function updateEnemies(dt){
const ts=tileSize();
for(let i=enemies.length-1;i>=0;i--){
const e=enemies[i];
e.atkCd=Math.max(0,e.atkCd-dt);
if(e.slowTimer>0)e.slowTimer-=dt;
const ns=findNearestSoldier(e.px,e.py,e.rng*ts);
if(ns){e.state='fight';e.target={type:'soldier',id:ns.id};}
if(e.state==='fight'&&e.target){
const sol=soldiers.find(s=>s.id===e.target.id);
if(!sol){e.state='move';e.target=null;continue;}
const dx=sol.px-e.px,dy=sol.py-e.py,d=Math.sqrt(dx*dx+dy*dy);
if(d>ts*0.5){const sp=(e.slowTimer>0?e.spd*0.4:e.spd)*dt;e.px+=dx/d*sp;e.py+=dy/d*sp;}
else if(e.atkCd<=0){sol.hp-=e.bldDmg||10;if(sol.hp<=0){soldiers.splice(soldiers.indexOf(sol),1);e.state='move';e.target=null;}e.atkCd=e.atkSpd;}
continue;
}
if(!e.path||e.pathIdx>=e.path.length){
const ec=Math.max(0,Math.min(GS-1,Math.round(e.px/ts-0.5)));
const er=Math.max(0,Math.min(GS-1,Math.round(e.py/ts-0.5)));
e.path=findPath(er,ec,NR,NC);e.pathIdx=1;
if(!e.path.length){enemies.splice(i,1);continue;}
}
const wp=e.path[e.pathIdx];
const tx=(wp.c+0.5)*ts,ty=(wp.r+0.5)*ts;
const dx=tx-e.px,dy=ty-e.py,d=Math.sqrt(dx*dx+dy*dy);
const tgt=G[wp.r][wp.c];
if((tgt.state==='building'||tgt.state==='nest')&&d<ts*0.65){
if(tgt.state==='nest'){
if(e.atkCd<=0){
nestHp-=e.nestDmg;e.atkCd=e.atkSpd;
const hn=document.getElementById('hud-nest');
hn.classList.remove('nest-hit');void hn.offsetWidth;hn.classList.add('nest-hit');
const gw=document.getElementById('grid-wrap');
gw.classList.remove('shake');void gw.offsetWidth;gw.classList.add('shake');
spawnParticles((NC+0.5)*tileSize(),(NR+0.5)*tileSize(),10,['#ff4020','#ff8040','#ffd060'],70,0.7,5);
if(nestHp<=0){nestHp=0;gameOver();return;}
}
} else {
if(e.atkCd<=0){
const _bdef=BDEF[tgt.type];const _ct=_bdef&&_bdef.tiers[tgt.tier];
if(_ct&&_ct.nameLabel==='Iron Wall'){e.hp-=Math.ceil(e.bldDmg*0.2);}
tgt.hp-=e.bldDmg;e.atkCd=e.atkSpd;
if(tgt.hp<=0){
const bname=BDEF[tgt.type].name;
G[wp.r][wp.c]={state:'rubble',type:null,tier:0,hp:0,maxHp:0};
renderTile(wp.r,wp.c);
e.path=findPath(wp.r,wp.c,NR,NC);e.pathIdx=1;
spawnParticles((wp.c+0.5)*tileSize(),(wp.r+0.5)*tileSize(),14,['#c08020','#804010','#e0c060','#fff'],75,0.8,5);
logMsg(\`\${BDEF[tgt.type]?.e||''} \${bname} destroyed!\`);
if(selTile&&selTile.r===wp.r&&selTile.c===wp.c)closePanel();
} else renderTile(wp.r,wp.c);
}
}
} else {
const sp=(e.slowTimer>0?e.spd*0.4:e.spd)*dt;
if(d<sp+1){e.px=tx;e.py=ty;e.r=wp.r;e.c=wp.c;e.pathIdx++;}
else{e.px+=dx/d*sp;e.py+=dy/d*sp;}
}
}
}
function findNearestSoldier(px,py,range){
let best=null,bestD=range*range;
for(const s of soldiers){const dx=s.px-px,dy=s.py-py,d2=dx*dx+dy*dy;if(d2<bestD){bestD=d2;best=s;}}
return best;
}
function pickWanderTile(ts){
const opts=[];
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c];
if(t.state==='empty'||t.state==='nest') opts.push({x:(c+0.5)*ts+(Math.random()-0.5)*ts*0.5,y:(r+0.5)*ts+(Math.random()-0.5)*ts*0.5});
}
if(opts.length===0) return {x:(NC+0.5)*ts,y:(NR+0.5)*ts};
return opts[Math.floor(Math.random()*opts.length)];
}
function updateSoldiers(dt){
const ts=tileSize();
for(let i=soldiers.length-1;i>=0;i--){
const s=soldiers[i];s.atkCd=Math.max(0,s.atkCd-dt);
const ne=findNearestEnemy(s.px,s.py,ts*(s.rngMult||1.5));
if(ne){
const dx=ne.px-s.px,dy=ne.py-s.py,d=Math.sqrt(dx*dx+dy*dy);
if(d>ts*0.5){const sp=s.spd||60;s.px+=dx/d*sp*dt;s.py+=dy/d*sp*dt;}
else if(s.atkCd<=0){const dmg=(s.dmg||2)+getArmoryBuff();ne.hp-=dmg;s.atkCd=s.atkSpd||1.0;if(ne.hp<=0){spawnDeathParticles(ne.px,ne.py,ne.type);enemies.splice(enemies.indexOf(ne),1);}}
} else {
if(!s.wanderTx){
const wt=pickWanderTile(ts);
s.wanderTx=wt.x; s.wanderTy=wt.y; s.wanderWait=0;
}
if(s.wanderWait>0){ s.wanderWait-=dt; }
else {
const dx=s.wanderTx-s.px, dy=s.wanderTy-s.py, d=Math.sqrt(dx*dx+dy*dy);
if(d<4){
s.wanderWait=1+Math.random()*2;
const wt=pickWanderTile(ts);
s.wanderTx=wt.x; s.wanderTy=wt.y;
s.flipX=s.wanderTx<s.px;
} else {
s.px+=dx/d*(s.spd||45)*0.75*dt; s.py+=dy/d*(s.spd||45)*0.75*dt;
s.flipX=dx<0;
}
}
}
}
}
function findNearestEnemy(px,py,range){
let best=null,bestD=range*range;
for(const e of enemies){const dx=e.px-px,dy=e.py-py,d2=dx*dx+dy*dy;if(d2<bestD){bestD=d2;best=e;}}
return best;
}
function updateWarships(dt){
const ts=tileSize();
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c];if(t.state!=='building'||t.type!=='warship')continue;
const key=r+'_'+c+'_ws';if(!towerAcc[key])towerAcc[key]=0;
towerAcc[key]+=dt;
const tier=BDEF.warship.tiers[t.tier];
if(towerAcc[key]<tier.spd)continue;
towerAcc[key]=0;
const cx=(c+0.5)*ts,cy=(r+0.5)*ts,range=tier.rng*ts;
const targets=enemies.filter(e=>{const dx=e.px-cx,dy=e.py-cy;return dx*dx+dy*dy<=range*range;})
.sort((a,b)=>((a.px-cx)**2+(a.py-cy)**2)-((b.px-cx)**2+(b.py-cy)**2));
const shots=t.tier>=2?2:1;
for(let n=0;n<Math.min(shots,targets.length);n++){
const tgt=targets[n];
bullets.push({id:bidSeq++,px:cx,py:cy,tx:tgt.px,ty:tgt.py,targetId:tgt.id,dmg:tier.dmg,spd:200,color:'#f0c040'});
spawnParticles(cx,cy,5,['#f0c040','#ff8020','#fff'],70,0.25,4);
}
}
}
function updateTowers(dt){
const ts=tileSize();
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c];if(t.state!=='building'||t.type!=='tower')continue;
const key=\`\${r}_\${c}\`;if(!towerAcc[key])towerAcc[key]=0;
towerAcc[key]+=dt;
const tier=BDEF.tower.tiers[t.tier];
if(towerAcc[key]<tier.spd)continue;
towerAcc[key]=0;
const cx=(c+0.5)*ts,cy=(r+0.5)*ts,range=tier.rng*ts;
const targets=enemies.filter(e=>{const dx=e.px-cx,dy=e.py-cy;return dx*dx+dy*dy<=range*range;})
.sort((a,b)=>(a.px-cx)**2+(a.py-cy)**2-(b.px-cx)**2-(b.py-cy)**2);
const max=tier.chain||(t.tier>=3?3:t.tier===2?2:1);
for(let n=0;n<Math.min(max,targets.length);n++){
const tgt=targets[n];
bullets.push({id:bidSeq++,px:cx,py:cy,tx:tgt.px,ty:tgt.py,targetId:tgt.id,dmg:tier.dmg,spd:280});
spawnParticles(cx,cy,3,['#f0d040','#ffa020'],40,0.2,3);
}
}
}
function updateBullets(dt){
for(let i=bullets.length-1;i>=0;i--){
const b=bullets[i];
const tgt=enemies.find(e=>e.id===b.targetId);
if(!tgt){bullets.splice(i,1);continue;}
b.tx=tgt.px;b.ty=tgt.py;
const dx=b.tx-b.px,dy=b.ty-b.py,d=Math.sqrt(dx*dx+dy*dy);
if(d<b.spd*dt+4){
tgt.hp-=b.dmg;
if(tgt.hp<=0)enemies.splice(enemies.indexOf(tgt),1);
bullets.splice(i,1);
} else {b.px+=dx/d*b.spd*dt;b.py+=dy/d*b.spd*dt;}
}
}
function drawCanvas(){
const cv=document.getElementById('canvas');
const ctx=cv.getContext('2d');
ctx.clearRect(0,0,cv.width,cv.height);
const ts=tileSize();
for(const b of bullets){
const col=b.color||'#f0d040';
const glow=b.color?'rgba(160,220,255,0.25)':'rgba(240,200,60,0.25)';
ctx.beginPath();ctx.arc(b.px,b.py,5,0,Math.PI*2);
ctx.fillStyle=glow;ctx.fill();
ctx.beginPath();ctx.arc(b.px,b.py,2.5,0,Math.PI*2);
ctx.fillStyle=col;ctx.fill();
}
for(const p of particles){
const alpha=Math.max(0,p.life/p.maxLife);
ctx.globalAlpha=alpha;
ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);
ctx.fillStyle=p.color;ctx.fill();
}
ctx.globalAlpha=1;
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c];
if(t.state==='building'&&t.type==='tower'&&selTile&&selTile.r===r&&selTile.c===c){
const tier=BDEF.tower.tiers[t.tier];
ctx.beginPath();ctx.arc((c+0.5)*ts,(r+0.5)*ts,tier.rng*ts,0,Math.PI*2);
ctx.strokeStyle='rgba(210,180,60,0.18)';ctx.lineWidth=1.5;ctx.stroke();
}
}
ctx.textAlign='center';ctx.textBaseline='middle';
for(const s of soldiers){
const fs=Math.floor(ts*0.44);
ctx.save();
ctx.translate(s.px,s.py);
if(s.flipX) ctx.scale(-1,1);
ctx.font=\`\${fs}px serif\`;ctx.fillText('🦆',0,0);
ctx.restore();
const pct=s.hp/s.maxHp,bw=ts*0.48,bh=3,bx=s.px-bw/2,by=s.py+ts*0.27;
ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(bx,by,bw,bh);
ctx.fillStyle=pct>0.5?'#4a8c38':'#a03020';ctx.fillRect(bx,by,bw*pct,bh);
}
for(const e of enemies){
const fs=Math.floor(ts*0.48);
ctx.font=\`\${fs}px serif\`;ctx.fillText(e.e,e.px,e.py);
const pct=e.hp/e.maxHp,bw=ts*0.52,bh=3,bx=e.px-bw/2,by=e.py+ts*0.29;
ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(bx,by,bw,bh);
ctx.fillStyle=pct>0.5?'#4a8c38':pct>0.25?'#c08820':'#902820';
ctx.fillRect(bx,by,bw*pct,bh);
}
}
function gameOver(){
dead=true;
const ov=document.createElement('div');ov.className='overlay';
ov.innerHTML=\`
<div class="ov-icon">🏚️</div>
<div class="ov-title">Kingdom Fallen</div>
<div class="ov-sub">Your Nest was destroyed. The realm is lost.</div>
<div class="ov-card">
<div class="ov-row">Seasons survived <span>\${season}</span></div>
<div class="ov-row">Enemies slain <span>\${eidSeq-enemies.length}</span></div>
</div>
<button class="big-btn green" id="restart-btn">▶ Rise Again</button>\`;
document.getElementById('app').appendChild(ov);
document.getElementById('restart-btn').addEventListener('click',()=>{ov.remove();restartGame();});
}
function restartGame(){
G={};R={food:50,gold:30,wood:20,energy:0,rock:0,iron:0};nestHp=50;season=1;raidCd=0;firstRaid=true;
enemies=[];soldiers=[];bullets=[];towerAcc={};autoAcc={};ptAcc={};particles=[];pSeq=0;
tool=null;selTile=null;sawmillFree=true;marketFree=true;farmFree=true;dead=false;
lastT=0;resAcc=0;eidSeq=0;sidSeq=0;bidSeq=0;
document.getElementById('panel').classList.remove('open');
initGrid();requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{buildGridDOM();buildToolbar();updateHUD();})));
requestAnimationFrame(gameLoop);
}
function logMsg(msg){
const log=document.getElementById('log');
const d=document.createElement('div');d.className='log-entry';d.textContent=msg;
log.appendChild(d);setTimeout(()=>d.remove(),3200);
while(log.children.length>4)log.removeChild(log.firstChild);
}
</script>`;
_ba(_kingdomEl);
(function(){
'use strict';
const GS=17,NR=8,NC=8;
const BDEF={
farm: {e:'🌾',name:'Farm', cost:{g:15,w:10},bldHp:60,
tiers:[
{food:1},
{food:3,ug:20},
{food:5,ug:80,ab:'+30% crop sell price (stacks)'},
{food:8, eugc:50, ab:'Auto-sells 10 food every 12s (1 energy)',auto:true,interval:12,sell:8, nameLabel:'Auto Farm', eLabel:'🤖🌾'},
{food:12,eugc:100,ab:'Auto-sells every 9s (1 energy)', auto:true,interval:9, sell:14, nameLabel:'Auto Farm+',eLabel:'🤖🌾'},
{food:18,eugc:180,ab:'Auto-sells every 6s (2 energy)', auto:true,interval:6, sell:22,ecycl:2,nameLabel:'Mega Farm',eLabel:'🌾⚡'},
]},
sawmill: {e:'🪚',name:'Sawmill', cost:{g:15,w:5}, bldHp:60,
tiers:[
{wood:1},
{wood:3,ug:20},
{wood:5,ug:80,ab:'+30% wood sell price at markets (stacks)'},
{wood:8, eugc:40, ab:'Rubble clears free', nameLabel:'Auto Sawmill', eLabel:'🤖🪚'},
{wood:12,eugc:80, ab:'Rubble clears free + soldiers +15% speed', nameLabel:'Mega Sawmill', eLabel:'🪚⚡'},
]},
market: {e:'🏪',name:'Market', cost:{g:20,w:15},bldHp:50,
tiers:[
{sell:5},
{sell:8, ug:20},
{sell:12,ug:40,ab:'Also sell 10 wood for 6g'},
{sell:18,eugc:60, ab:'Also sell 10 wood for 8g', nameLabel:'Power Market',eLabel:'🏪⚡'},
{sell:26,eugc:120,ab:'Also sell 10 wood for 12g', nameLabel:'Mega Market', eLabel:'🏬'},
]},
wall: {e:'🧱',name:'Wall', cost:{g:5,w:8}, bldHp:40,
tiers:[{hp:40},{hp:80,ug:15},{hp:150,ug:30,ab:'Slows attackers 30%'}]},
tower: {e:'🗼',name:'Tower', cost:{g:25,w:20},bldHp:70,
tiers:[
{dmg:8, spd:1.8,rng:2.0, ab:'Basic arrow tower'},
{dmg:16,spd:1.5,rng:2.5,ug:20, ab:'Improved aim and range'},
{dmg:28,spd:1.2,rng:3.0,ug:40, ab:'Hits 2 enemies per shot'},
{dmg:45,spd:1.0,rng:3.5,ug:70, ab:'Hits 3 enemies, armour piercing'},
{dmg:70, spd:0.8,rng:4.0,eugc:60, ecost:1,chain:3,ab:'Electrified — chains to 3 enemies (1 energy/shot)', nameLabel:'Volt Tower', eLabel:'🗼⚡'},
{dmg:110,spd:0.6,rng:4.5,eugc:120,ecost:2,chain:4,ab:'Overcharged — chain 4, armour pierce (2 energy/shot)',nameLabel:'Arc Tower', eLabel:'🗼🔋'},
{dmg:160,spd:0.4,rng:5.0,eugc:200,ecost:3,chain:5,ab:'Apex — chain 5, stuns on hit (3 energy/shot)', nameLabel:'Apex Tower', eLabel:'🗼💥'},
]},
barracks:{e:'⚔️',name:'Barracks', cost:{g:30,w:25},bldHp:80,
tiers:[
{sol:1,shp:30, dmg:2,atkSpd:1.0,rng:1.5,spd:60, ab:'Basic soldier — 2 dmg/s'},
{sol:2,shp:40, dmg:3,atkSpd:1.0,rng:1.6,spd:65, ug:25, ab:'2 soldiers, +10 HP'},
{sol:2,shp:55, dmg:4,atkSpd:0.9,rng:1.7,spd:70, ug:50, ab:'+50% HP, faster attack'},
{sol:3,shp:60, dmg:5,atkSpd:0.9,rng:1.8,spd:75, ug:80, ab:'3 soldiers, improved range'},
{sol:3,shp:80, dmg:7,atkSpd:0.8,rng:2.0,spd:80, ug:120, ab:'Elite soldiers — +range, +speed'},
{sol:4,shp:100,dmg:10,atkSpd:0.7,rng:2.2,spd:90, eugc:60, ab:'4 soldiers, energy-forged weapons', nameLabel:'Elite Guard', eLabel:'⚔️⚡'},
{sol:5,shp:130,dmg:14,atkSpd:0.6,rng:2.5,spd:100,eugc:120,ab:'5 soldiers, lightning fast strikes', nameLabel:'Royal Guard', eLabel:'⚔️👑'},
]},

house: {e:'🏠',name:'House', cost:{g:20,w:15},bldHp:50,
tiers:[{pop:2},{pop:3,ug:20},{pop:5,ug:40,ab:'Attracts wandering ducks to defend'}]},
windmill: {e:'🌀',name:'Windmill', cost:{g:25,w:20},bldHp:60,
tiers:[
{energy:1},
{energy:2,ug:30},
{energy:3,ug:60,ab:'Boosts nearby +10%'},
{energy:5,eugc:40,ab:'Boosts nearby +20%', nameLabel:'Power Mill',eLabel:'🌀⚡'},
{energy:8,eugc:80,ab:'Boosts nearby +30%', nameLabel:'Mega Mill', eLabel:'🌀🔋'},
]},
factory: {e:'🏭',name:'Factory', cost:{g:60,w:50},bldHp:100,
tiers:[
{energy:3},
{energy:6,ug:40},
{energy:10,ug:80, ab:'Produces bonus wood each tick'},
{energy:15,eugc:60, ab:'Also produces +2 wood/s', nameLabel:'Power Factory',eLabel:'🏭⚡'},
{energy:22,eugc:120,ab:'Also produces +4 wood/s', nameLabel:'Mega Factory', eLabel:'🏭🔋'},
{energy:30,eugc:200,ab:'Also produces +6 wood/s + auto-clears rubble',nameLabel:'Apex Factory', eLabel:'🏭💡'},
]},
quarry: {e:'⛏️',name:'Quarry', cost:{g:30,w:20},bldHp:80,
tiers:[
{rock:1, ab:'Chips rock from the earth'},
{rock:2,ug:25, ab:'Deeper shafts — double output'},
{rock:3,ug:50, ab:'Ready to branch — choose Gold Mine or Iron Mine!'},
]},
gold_mine:{e:'💎',name:'Gold Mine', cost:{g:0,w:0}, bldHp:80,hidden:true,
tiers:[
{gold_ps:2, ab:'Veins of gold run deep'},
{gold_ps:4,eugc:40, ab:'Reinforced shafts double output'},
{gold_ps:7,eugc:80, ab:'Master miners at work',nameLabel:'Rich Vein',eLabel:'💰⛏️'},
]},
iron_mine:{e:'🔩',name:'Iron Mine', cost:{g:0,w:0}, bldHp:80,hidden:true,
tiers:[
{iron:2, ab:'Iron ore strengthens your buildings'},
{iron:4,eugc:40, ab:'Better furnaces — double output'},
{iron:7,eugc:80, ab:'Iron surplus: soldiers gain +20% attack',nameLabel:'Iron Forge',eLabel:'⚙️⛏️'},
]},
};

const ETYPES={
fox: {e:'🦊',name:'Fox', spd:55,hp:20, nestDmg:3, bldDmg:6, atkSpd:1.2,rng:1.2},
eagle:{e:'🦅',name:'Eagle', spd:75,hp:15, nestDmg:5, bldDmg:5, atkSpd:1.0,rng:1.2},
wolf: {e:'🐺',name:'Wolf', spd:35,hp:40, nestDmg:7, bldDmg:12,atkSpd:1.5,rng:1.2},
bear: {e:'🐻',name:'Bear', spd:22,hp:80, nestDmg:15,bldDmg:22,atkSpd:2.0,rng:1.3},
croc: {e:'🐊',name:'Croc', spd:18,hp:120,nestDmg:20,bldDmg:28,atkSpd:2.2,rng:1.3},
};
const RAID_TIMES=[45,60,80,90];
let G={}, R={food:50,gold:30,wood:20,energy:0,rock:0,iron:0};
let nestHp=50, season=1;
let raidCd=0, nextRaid=0, firstRaid=true;
let enemies=[], soldiers=[], bullets=[];
let autoAcc={}, ptAcc={};
let particles=[], pSeq=0;
let tool=null, selTile=null;
let sawmillFree=true, marketFree=true, farmFree=true, dead=false;
let lastT=0, resAcc=0, towerAcc={};
let eidSeq=0, sidSeq=0, bidSeq=0;
function initGrid(){
for(let r=0;r<GS;r++){G[r]={};for(let c=0;c<GS;c++){
const inStart=(r>=6&&r<=10&&c>=6&&c<=10);
G[r][c]={state:inStart?'empty':'locked',type:null,tier:0,hp:0,maxHp:0};
}}
G[NR][NC]={state:'nest',type:'nest',tier:0,hp:50,maxHp:50};
scheduleRaid();
}
function scheduleRaid(){
if(firstRaid){ nextRaid=90; firstRaid=false; }
else nextRaid=RAID_TIMES[_mf(_mr()*RAID_TIMES.length)];
raidCd=nextRaid;
}
function buildGridDOM(){
const gEl=_gi('grid');
const wrap=_gi('grid-wrap');
const hud=_gi('hud');const toolbar=_gi('toolbar');
const hudH=hud?hud.getBoundingClientRect().height:42;
const tbH=toolbar?toolbar.getBoundingClientRect().height:90;
const totalH=window.innerHeight||600;const totalW=window.innerWidth||400;
const rawW=wrap.clientWidth||wrap.getBoundingClientRect().width||totalW;
const rawH=wrap.clientHeight||wrap.getBoundingClientRect().height||_mx(200,totalH-hudH-tbH);
const maxW=rawW-4, maxH=rawH-4;
const ts=_mf(_mn(maxW,maxH)/GS);
if(ts<=0){_raf(buildGridDOM);return;}
const gs=ts*GS;
gEl.style.cssText=`display:grid;grid-template-columns:repeat(${GS},${ts}px);width:${gs}px;height:${gs}px;position:relative`;
gEl.innerHTML='';
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const d=_ce('div');
d.id=`t${r}_${c}`;
d.style.cssText=`width:${ts}px;height:${ts}px;`;
d.addEventListener('click',()=>onTileClick(r,c));
gEl.appendChild(d);
}
const cv=_gi('canvas');
const gRect=gEl.getBoundingClientRect(), wRect=wrap.getBoundingClientRect();
cv.width=gs; cv.height=gs;
cv.style.cssText=`position:absolute;left:${gRect.left-wRect.left}px;top:${gRect.top-wRect.top}px;z-index:3`;
renderGrid();
}
function renderGrid(){for(let r=0;r<GS;r++)for(let c=0;c<GS;c++)renderTile(r,c);}
function renderTile(r,c){
const t=G[r][c], el=_gi(`t${r}_${c}`);
if(!el) return;
const isClaimable=t.state==='locked'&&isAdjUnlocked(r,c);
let cls='tile', inner='';
if(t.state==='nest'){cls+=' nest-tile';inner='🪺';}
else if(t.state==='locked'){cls+=isClaimable?' claimable':' locked';}
else if(t.state==='empty'){
cls+=' empty';
if(tool) cls+=' can-build';
}
else if(t.state==='rubble'){cls+=' rubble';inner='🪨';}
else if(t.state==='building'){
cls+=' building';
const tierDef=BDEF[t.type].tiers[t.tier];
const tileEmoji=tierDef&&tierDef.eLabel?tierDef.eLabel.split(' ')[0]:BDEF[t.type].e;
inner=tileEmoji;
const pct=_mx(0,(t.hp/t.maxHp)*100);
inner+=`<div class="tile-hp"><div class="tile-hp-fill" style="width:${pct}%;background:${pct>50?'#4a8c38':pct>25?'#c08820':'#902820'}"></div></div>`;
const multiTier=['windmill','sawmill','market','farm','tower'];
if(t.tier>0)inner+=`<div class="tile-tier">${multiTier.includes(t.type)?'T'+(t.tier+1):'★'.repeat(Math.min(t.tier,3))}</div>`;
}
if(selTile&&selTile.r===r&&selTile.c===c) cls+=' selected-tile';
el.className=cls;
el.innerHTML=inner;
}
function isAdjUnlocked(r,c){
for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){
const nr=r+dr,nc=c+dc;
if(nr>=0&&nr<GS&&nc>=0&&nc<GS&&G[nr][nc].state!=='locked') return true;
}
return false;
}
function tileSize(){return _gi('grid')?_gi('grid').clientWidth/GS:44;}
function buildToolbar(){
const tb=_gi('toolbar-grid');
tb.innerHTML='';
Object.entries(BDEF).forEach(([id,b])=>{
if(b.hidden)return;
const isFree=(id==='sawmill'&&sawmillFree)||(id==='market'&&marketFree)||(id==='farm'&&farmFree);
const canAfford=isFree||(R.gold>=b.cost.g&&R.wood>=b.cost.w);
const btn=_ce('div');
btn.className='tool-btn'+(tool===id?' active':'')+((!canAfford&&!isFree)?' cant-afford':'');
const _ironOk=!b.cost.i||R.iron>=(b.cost.i||0);
const costStr=isFree?'<div class="free-badge">FREE</div>':`<div class="cost">${b.cost.g}g&nbsp;${b.cost.w}w${b.cost.i?'&nbsp;<span style="color:'+(_ironOk?'inherit':'#ff7060')+'">'+b.cost.i+'🔩</span>':''}</div>`;
btn.title=b.cost.i&&R.iron<(b.cost.i||0)?'Need '+b.cost.i+'🔩 — upgrade Quarry to tier 3 and branch to Iron Mine':'';
btn.innerHTML=`<div class="te">${b.e}</div><div>${b.name}</div>${costStr}`;
btn.addEventListener('click',()=>{
tool=tool===id?null:id;
selTile=null;closePanel();
buildToolbar();renderGrid();
});
tb.appendChild(btn);
});
}
function onTileClick(r,c){
const t=G[r][c];
if(t.state==='nest'){openNestPanel();return;}
if(t.state==='locked'){if(isAdjUnlocked(r,c))claimTile(r,c);return;}
if(t.state==='building'){selTile={r,c};tool=null;openBuildingPanel(r,c);buildToolbar();renderGrid();return;}
if(t.state==='rubble'){tryClearRubble(r,c);return;}
if(tool&&t.state==='empty'){tryBuild(r,c,tool);return;}
selTile=null;closePanel();buildToolbar();renderGrid();
}
function claimTile(r,c){
if(R.gold<15){logMsg('Need 15g to claim tile');return;}
R.gold-=15;
G[r][c].state='empty';
updateHUD();renderGrid();logMsg('New land claimed for 15g');
}
function tryBuild(r,c,bid){
const b=BDEF[bid];
const ts=tileSize();
const blocked=soldiers.some(s=>_mf(s.px/ts)===c&&_mf(s.py/ts)===r);
if(blocked){logMsg('A soldier duck is standing there!');return;}
const isFree=(bid==='sawmill'&&sawmillFree)||(bid==='market'&&marketFree)||(bid==='farm'&&farmFree);
if(!isFree&&(R.gold<b.cost.g||R.wood<b.cost.w)){logMsg('Not enough resources!');return;}
if(!isFree){R.gold-=b.cost.g;R.wood-=b.cost.w;}else{if(bid==='sawmill')sawmillFree=false;if(bid==='market')marketFree=false;if(bid==='farm')farmFree=false;}
const t0=b.tiers[0];
const hp=bid==='wall'?t0.hp:b.bldHp;
G[r][c]={state:'building',type:bid,tier:0,hp,maxHp:hp};
if(bid==='tower')towerAcc[`${r}_${c}`]=0;
tool=null;closePanel();buildToolbar();renderTile(r,c);updateHUD();
logMsg(`${b.e} ${b.name} built`);
}
function tryClearRubble(r,c){
const free=hasEliteSawmill();
const cg=free?0:8, cw=free?0:5;
if(R.gold<cg||R.wood<cw){logMsg(`Need ${cg}g ${cw}w to clear rubble`);return;}
R.gold-=cg;R.wood-=cw;
G[r][c]={state:'empty',type:null,tier:0,hp:0,maxHp:0};
renderTile(r,c);updateHUD();logMsg('Rubble cleared');
}
function hasEliteSawmill(){for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){const t=G[r][c];if(t.state==='building'&&t.type==='sawmill'&&t.tier>=2)return true;}return false;}
function hasEliteFarm(){for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){const t=G[r][c];if(t.state==='building'&&t.type==='farm'&&t.tier===2)return true;}return false;}
function marketBonus(){
let count=0;
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c];
if(t.state==='building'&&t.type==='farm'&&t.tier>=2) count++;
}
return count*0.3;
}
function sawmillBonus(){
let count=0;
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c];
if(t.state==='building'&&t.type==='sawmill'&&t.tier>=2) count++;
}
return count*0.3;
}
function marketSellRate(marketTierIdx){
const base=BDEF.market.tiers[marketTierIdx]&&BDEF.market.tiers[marketTierIdx].sell||5;
return _rnd(base*(1+marketBonus()));
}
function woodSellRate(marketTierIdx){
const base=[0,0,6,8,12][marketTierIdx]||0;
return _rnd(base*(1+sawmillBonus()));
}
function popCap(){
let cap=5;
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c];
if(t.state==='building'&&t.type==='house') cap+=BDEF.house.tiers[t.tier].pop;
}
return cap;
}
function closePanel(){selTile=null;_gi('panel').classList.remove('open');}
function openNestPanel(){
selTile={r:NR,c:NC};
const p=_gi('panel');
_gi('panel-hp-fill').style.width=(nestHp/50*100)+'%';
_gi('panel-hp-fill').style.background=nestHp>25?'#4a8c38':nestHp>10?'#c08820':'#902820';
_gi('panel-title').textContent='🪺 The Nest';
_gi('panel-stats').innerHTML=`HP: <b>${Math.ceil(nestHp)}/50</b><br>Heart of your kingdom. If it falls, all is lost.`;
_gi('panel-btns').innerHTML='';
_gi('panel-btns').appendChild(mkBtn('Close','close-p',closePanel));
p.classList.add('open');renderGrid();
}
function openBuildingPanel(r,c){
const t=G[r][c],b=BDEF[t.type],tier=b.tiers[t.tier];
const p=_gi('panel');
const pct=_mx(0,(t.hp/t.maxHp)*100);
_gi('panel-hp-fill').style.width=pct+'%';
_gi('panel-hp-fill').style.background=pct>50?'#4a8c38':pct>25?'#c08820':'#902820';
_gi('panel-title').textContent=(tier.eLabel||b.e)+' '+(tier.nameLabel||b.name);
function chip(label,val,cls){return '<span class="stat-chip'+(cls?' '+cls:'')+'">'+label+': <b>'+val+'</b></span>';}
let stats='';
stats+=chip('HP',_mc(t.hp)+'/'+t.maxHp);
stats+=chip('Tier',(t.tier+1)+'/'+b.tiers.length);
if(t.type==='farm'){
const mb=marketBonus();
stats+=chip('Food','+'+tier.food+'/s','trait');
if(mb>0)stats+=chip('Mkt bonus','+'+_rnd(mb*100)+'%','trait');
if(t.tier>=3&&tier.auto)stats+=chip('Auto-sell','every '+tier.interval+'s ('+(tier.ecycl||1)+'⚡)','note');
}
if(t.type==='sawmill') stats+=chip('Wood','+'+tier.wood+'/s','trait');
if(t.type==='market'){
const rate=marketSellRate(t.tier);const bonus=marketBonus();const isAuto=t.tier>=3&&tier.auto;
stats+=chip('Sell',rate+'g per 10 food','trait');
if(bonus>0)stats+=chip('Bonus','+'+_rnd(bonus*100)+'%','trait');
if(isAuto)stats+=chip('Auto','every '+tier.interval+'s','note');
}
if(t.type==='wall') stats+=chip('Wall HP',tier.hp,'trait');
if(t.type==='tower'){
stats+=chip('Dmg',tier.dmg,'warn');
stats+=chip('Fire',tier.spd+'s');
stats+=chip('Range',tier.rng+'t');
if(t.tier>=4){stats+=chip('Chain',tier.chain,'warn');stats+=chip('Cost',tier.ecost+'⚡/shot','warn');}
}
if(t.type==='barracks'){stats+=chip('Soldiers',tier.sol+' per raid','trait');stats+=chip('HP',tier.shp);stats+=chip('Dmg',tier.dmg+'/s','warn');stats+=chip('Spd',tier.spd);stats+=chip('Range',tier.rng+'t');}
if(t.type==='house') stats+=chip('Pop cap','+'+tier.pop,'trait');
if(t.type==='windmill') stats+=chip('Energy','+'+tier.energy+'⚡/s','trait');
if(t.type==='factory'){const wb=[0,0,1,2,4,6][t.tier]||0;stats+=chip('Energy','+'+tier.energy+'⚡/s','trait');if(wb>0)stats+=chip('Wood','+'+wb+'/s','trait');}
if(t.type==='quarry') stats+=chip('Rock','+'+tier.rock+'/s','trait');
if(t.type==='gold_mine')stats+=chip('Gold','+'+tier.gold_ps+'/s','trait');
if(t.type==='iron_mine')stats+=chip('Iron','+'+tier.iron+'/s','trait');
if(tier.ab)stats+='<span class="stat-chip note" style="width:100%">ℹ️ '+tier.ab+'</span>';
_gi('panel-stats').innerHTML=stats;
const btns=_gi('panel-btns');
btns.innerHTML='';
const nextTier=b.tiers[t.tier+1];
if(nextTier){
const ugCost=nextTier.ug||nextTier.eugc||0;
const isEnergy=!!nextTier.eugc;
const canAfford=isEnergy?(R.energy>=ugCost):(R.gold>=ugCost);
const ub=mkBtn('Upgrade ('+ugCost+(isEnergy?' energy':' gold')+')','upgrade',function(){
if(isEnergy){if(R.energy<ugCost){logMsg('Not enough energy');return;}R.energy-=ugCost;}
else{if(R.gold<ugCost){logMsg('Not enough gold');return;}R.gold-=ugCost;}
t.tier++;
if(b.bldHp){t.maxHp=_rnd(b.bldHp*(1+t.tier*0.5));t.hp=t.maxHp;}
const nt2=b.tiers[t.tier];
openBuildingPanel(r,c);updateHUD();renderTile(r,c);
logMsg((nt2.eLabel||b.e)+' '+(nt2.nameLabel||b.name)+' upgraded to tier '+(t.tier+1));
});
ub.disabled=!canAfford;
btns.appendChild(ub);
}
if(t.type==='market'){
const foodRate=marketSellRate(t.tier);
const sfb=mkBtn('Sell 10 food -> '+foodRate+'g','sell',function(){
if(R.food<10){logMsg('Need 10 food');return;}
R.food-=10;R.gold+=foodRate;
openBuildingPanel(r,c);updateHUD();logMsg('Sold food for '+foodRate+'g');
});
sfb.disabled=R.food<10;
btns.appendChild(sfb);
if(t.tier>=2){
const woodRate=woodSellRate(t.tier);
const swb=mkBtn('Sell 10 wood -> '+woodRate+'g','sell-wood',function(){
if(R.wood<10){logMsg('Need 10 wood');return;}
R.wood-=10;R.gold+=woodRate;
openBuildingPanel(r,c);updateHUD();logMsg('Sold wood for '+woodRate+'g');
});
swb.disabled=R.wood<10;
btns.appendChild(swb);
}
}
if(t.type==='quarry'&&t.tier===2){
const branchLabel=document.createElement('div');branchLabel.style.cssText='width:100%;font-size:10px;font-weight:900;color:var(--gold);letter-spacing:.06em;text-transform:uppercase;margin-bottom:2px;';branchLabel.textContent='⚒️ Choose specialisation:';btns.appendChild(branchLabel);
const goldBtn=mkBtn('⛏️ → 💎 Gold Mine','branch',function(){
G[r][c]={state:'building',type:'gold_mine',tier:0,hp:80,maxHp:80};
closePanel();buildToolbar();renderTile(r,c);updateHUD();
logMsg('Quarry converted to Gold Mine!');
});
const ironBtn=mkBtn('⛏️ → 🔩 Iron Mine','branch',function(){
G[r][c]={state:'building',type:'iron_mine',tier:0,hp:80,maxHp:80};
closePanel();buildToolbar();renderTile(r,c);updateHUD();
logMsg('Quarry converted to Iron Mine!');
});
btns.appendChild(goldBtn);btns.appendChild(ironBtn);
}
const db=mkBtn('Demolish','close-p',function(){
G[r][c]={state:'empty',type:null,tier:0,hp:0,maxHp:0};
closePanel();buildToolbar();renderTile(r,c);updateHUD();
logMsg(b.e+' '+b.name+' demolished');
});
btns.appendChild(db);
btns.appendChild(mkBtn('Close','close-p',closePanel));
p.classList.add('open');renderGrid();
}
function mkBtn(txt,cls,fn){
const b=_ce('button');
b.className='panel-btn '+cls;b.textContent=txt;
b.addEventListener('click',fn);return b;
}
function updateHUD(){
_gi('h-food').textContent=_mf(R.food);
_gi('h-gold').textContent=_mf(R.gold);
_gi('h-wood').textContent=_mf(R.wood);
_gi('h-energy').textContent=_mf(R.energy);
_gi('h-rock').textContent=_mf(R.rock||0);
_gi('h-iron').textContent=_mf(R.iron||0);
_gi('h-nest').textContent=_mc(nestHp);
_gi('h-season').textContent=season;
_gi('h-pop').textContent=soldiers.length;
_gi('h-popcap').textContent=popCap();
const tc=_mc(raidCd);
_gi('h-timer').textContent=tc>0?tc:'!';
const te=_gi('hud-timer');
te.className=tc<=15?'danger':'';
setDelta('d-food',foodDelta());
setDelta('d-gold',0);
setDelta('d-wood',woodDelta());
}
function setDelta(id,v){
const el=_gi(id);if(!el)return;
if(v>0){el.textContent='+'+v;el.className='delta';}
else if(v<0){el.textContent=v;el.className='delta neg';}
else el.textContent='';
}
function foodDelta(){
let d=0;
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c]; if(t.state!=='building') continue;
if(t.type==='farm') d+=BDEF.farm.tiers[t.tier].food;
}
return _rnd(d*10)/10;
}
function woodDelta(){
let d=0;
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c]; if(t.state!=='building') continue;
if(t.type==='sawmill') d+=BDEF.sawmill.tiers[t.tier].wood;
}
return d;
}
function findPath(sr,sc,er,ec){
const INF=1e9,dist=Array.from({length:GS},()=>Array(GS).fill(INF));
const prev=Array.from({length:GS},()=>Array(GS).fill(null));
dist[sr][sc]=0;const open=[{r:sr,c:sc,d:0}];
while(open.length){
open.sort((a,b)=>a.d-b.d);const{r,c,d}=open.shift();
if(d>dist[r][c])continue;if(r===er&&c===ec)break;
for(const[dr,dc]of[[-1,0],[1,0],[0,-1],[0,1]]){
const nr=r+dr,nc=c+dc;
if(nr<0||nr>=GS||nc<0||nc>=GS)continue;
const nt=G[nr][nc];
let cost=1;if(nt.state==='locked')cost=2;if(nt.state==='building'&&nt.type==='wall')cost=8;
const nd=d+cost;
if(nd<dist[nr][nc]){dist[nr][nc]=nd;prev[nr][nc]={r,c};open.push({r:nr,c:nc,d:nd});}
}
}
if(dist[er][ec]===INF)return[];
const path=[];let cur={r:er,c:ec};
while(cur){path.unshift({...cur});cur=prev[cur.r][cur.c];}
return path;
}
function spawnRaid(){
flashRaid();
const count=2+_mf(season*1.4);
const pool=raidPool();
for(let i=0;i<count;i++){
const eType=pool[_mf(_mr()*pool.length)];
const def=ETYPES[eType];
let r,c;const side=_mf(_mr()*4);
if(side===0){r=0;c=_mf(_mr()*GS);}
else if(side===1){r=GS-1;c=_mf(_mr()*GS);}
else if(side===2){r=_mf(_mr()*GS);c=0;}
else{r=_mf(_mr()*GS);c=GS-1;}
const ts=tileSize();
enemies.push({
id:eidSeq++,type:eType,...def,r,c,
px:(c+0.5)*ts,py:(r+0.5)*ts,
hp:def.hp*(1+season*0.08),maxHp:def.hp*(1+season*0.08),
path:findPath(r,c,NR,NC),pathIdx:1,
atkCd:0,target:null,state:'move',slowTimer:0
});
}
season++;scheduleRaid();spawnSoldiers();updateHUD();buildToolbar();
logMsg(`⚔️ Raid! ${count} enemies from the wilds`);
}
function raidPool(){
if(season<3)return['fox','eagle'];
if(season<6)return['fox','eagle','wolf'];
if(season<10)return['fox','wolf','bear'];
return['wolf','bear','croc','fox'];
}
function spawnSoldiers(){
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c];
if(t.state!=='building'||t.type!=='barracks')continue;
const tier=BDEF.barracks.tiers[t.tier];
const ts=tileSize();
for(let s=0;s<tier.sol;s++){
if(soldiers.length>=popCap()) break;
const a=_mr()*_pi*2;
soldiers.push({
id:sidSeq++,e:'🦆',r,c,
px:(c+0.5)*ts+Math.cos(a)*ts*0.5,
py:(r+0.5)*ts+Math.sin(a)*ts*0.5,
hp:tier.shp,maxHp:tier.shp,homeR:r,homeC:c,
dmg:tier.dmg||2,atkSpd:tier.atkSpd||1.0,
rngMult:tier.rng||1.5,spd:tier.spd||60,
atkCd:0,target:null,state:'patrol',
angle:_mr()*_pi*2,patrolR:tileSize()*1.2
});
}
}
}
function flashRaid(){
const f=_gi('raid-flash'),a=_gi('raid-announce');
f.style.opacity='1';a.style.opacity='1';
setTimeout(()=>{f.style.opacity='0';a.style.opacity='0';},1300);
}
function updateAutoBuildings(dt){
const ts=tileSize();
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c]; if(t.state!=='building') continue;
const tier=BDEF[t.type]&&BDEF[t.type].tiers[t.tier];
if(!tier) continue;
const key=r+'_'+c;
if(t.type==='market' && t.tier>=3){
if(!autoAcc[key]) autoAcc[key]=0;
autoAcc[key]+=dt;
if(autoAcc[key]>=tier.interval){
autoAcc[key]=0;
const eCost=tier.ecycl||1;
if(R.energy>=eCost && R.food>=10){
const rate=marketSellRate(t.tier);
R.food-=10; R.gold+=rate; R.energy-=eCost;
spawnHitParticles(key,rate);
logMsg(`🤖 Auto-sold 10🌾 → ${rate}💰`);
}
}
}
if(t.type==='tower' && t.tier>=3){
if(!ptAcc[key]) ptAcc[key]=0;
ptAcc[key]+=dt;
if(ptAcc[key]<tier.spd) continue;
if(R.energy<tier.ecost) continue;
const cx=(c+0.5)*ts, cy=(r+0.5)*ts, range=tier.rng*ts;
const inRange=enemies.filter(e=>{
const dx=e.px-cx,dy=e.py-cy;
return dx*dx+dy*dy<=range*range;
}).sort((a,b)=>(a.px-cx)**2+(a.py-cy)**2-(b.px-cx)**2-(b.py-cy)**2);
if(inRange.length===0) continue;
ptAcc[key]=0;
R.energy-=tier.ecost;
const chain=tier.chain||1;
for(let n=0;n<_mn(chain,inRange.length);n++){
const tgt=inRange[n];
bullets.push({id:bidSeq++,px:cx,py:cy,tx:tgt.px,ty:tgt.py,
targetId:tgt.id,dmg:tier.dmg,spd:380,color:'#a0e0ff'});
spawnParticles(cx,cy,4,['#a0e0ff','#60b0ff','#fff'],55,0.2,3);
}
}
}
}
function spawnParticles(px,py,count,colors,spd,life,size){for(let i=0;i<count;i++){const a=_mr()*_pi*2,s=(0.4+_mr()*0.6)*spd;particles.push({x:px,y:py,vx:Math.cos(a)*s,vy:Math.sin(a)*s,grav:30,life,maxLife:life,size:(0.5+_mr()*0.5)*size,color:colors[_mf(_mr()*colors.length)]});}}
function spawnDeathParticles(px,py,type){const cols={fox:['#f08040','#e06020','#fff'],eagle:['#8080ff','#a0c0ff','#fff'],wolf:['#c0a080','#806040','#fff'],bear:['#8c6030','#604020','#fff'],croc:['#408040','#306030','#a0e080']};spawnParticles(px,py,14,(cols[type]||['#f0d040','#fff','#c08020']),80,0.8,5);}
function spawnHitParticles(key,amount){const parts=key.split('_');const ts=tileSize();const px=(+parts[1]+0.5)*ts,py=(+parts[0]+0.5)*ts;spawnParticles(px,py,6,['#f5e642','#ffd700','#fff'],55,0.5,4);}
function gameLoop(ts){
if(dead)return;
const dt=_mn((ts-lastT)/1000,0.1);lastT=ts;
if(dt>0.5){_raf(gameLoop);lastT=ts;return;}
raidCd-=dt;if(raidCd<=0)spawnRaid();
resAcc+=dt;if(resAcc>=1){resAcc-=1;tickResources();}
updateEnemies(dt);updateSoldiers(dt);updateTowers(dt);updateAutoBuildings(dt);updateBullets(dt);
for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=(p.grav||30)*dt;p.life-=dt;if(p.life<=0)particles.splice(i,1);}
updateHUD();drawCanvas();
_raf(gameLoop);
}
function tickResources(){
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c];if(t.state!=='building')continue;
if(t.type==='farm') R.food +=BDEF.farm.tiers[t.tier].food;
if(t.type==='sawmill')R.wood +=BDEF.sawmill.tiers[t.tier].wood;
if(t.type==='windmill')R.energy+=BDEF.windmill.tiers[t.tier].energy;
if(t.type==='factory'){
 const ftier=BDEF.factory.tiers[t.tier];
 R.energy+=ftier.energy;
 if(t.tier>=2)R.wood+=([0,0,1,2,4,6][t.tier]||0);
 if(t.tier>=5){
 for(let rr=0;rr<GS;rr++)for(let cc=0;cc<GS;cc++){
 if(G[rr][cc].state==='rubble'){G[rr][cc]={state:'empty',type:null,tier:0,hp:0,maxHp:0};renderTile(rr,cc);}
 }
 }
}
if(t.type==='quarry') R.rock=_mn((R.rock||0)+(BDEF.quarry.tiers[t.tier].rock||0),999);
if(t.type==='gold_mine')R.gold=_mn(R.gold+(BDEF.gold_mine.tiers[t.tier].gold_ps||0),9999);
if(t.type==='iron_mine')R.iron=_mn((R.iron||0)+(BDEF.iron_mine.tiers[t.tier].iron||0),999);
}
R.food=_mn(R.food,999);R.gold=_mn(R.gold,9999);R.wood=_mn(R.wood,999);R.energy=_mn(R.energy,999);R.rock=_mn(R.rock||0,999);R.iron=_mn(R.iron||0,999);
buildToolbar();
}
function updateEnemies(dt){
const ts=tileSize();
for(let i=enemies.length-1;i>=0;i--){
const e=enemies[i];
e.atkCd=_mx(0,e.atkCd-dt);
if(e.slowTimer>0)e.slowTimer-=dt;
const ns=findNearestSoldier(e.px,e.py,e.rng*ts);
if(ns){e.state='fight';e.target={type:'soldier',id:ns.id};}
if(e.state==='fight'&&e.target){
const sol=soldiers.find(s=>s.id===e.target.id);
if(!sol){e.state='move';e.target=null;continue;}
const dx=sol.px-e.px,dy=sol.py-e.py,d=_ms(dx*dx+dy*dy);
if(d>ts*0.5){const sp=(e.slowTimer>0?e.spd*0.4:e.spd)*dt;e.px+=dx/d*sp;e.py+=dy/d*sp;}
else if(e.atkCd<=0){sol.hp-=10;if(sol.hp<=0){soldiers.splice(soldiers.indexOf(sol),1);e.state='move';e.target=null;}e.atkCd=e.atkSpd;}
continue;
}
if(!e.path||e.pathIdx>=e.path.length){
const ec=_mx(0,_mn(GS-1,_rnd(e.px/ts-0.5)));
const er=_mx(0,_mn(GS-1,_rnd(e.py/ts-0.5)));
e.path=findPath(er,ec,NR,NC);e.pathIdx=1;
if(!e.path.length){enemies.splice(i,1);continue;}
}
const wp=e.path[e.pathIdx];
const tx=(wp.c+0.5)*ts,ty=(wp.r+0.5)*ts;
const dx=tx-e.px,dy=ty-e.py,d=_ms(dx*dx+dy*dy);
const tgt=G[wp.r][wp.c];
if((tgt.state==='building'||tgt.state==='nest')&&d<ts*0.65){
if(tgt.state==='nest'){
if(e.atkCd<=0){
nestHp-=e.nestDmg;e.atkCd=e.atkSpd;
const hn=_gi('hud-nest');
hn.classList.remove('nest-hit');void hn.offsetWidth;hn.classList.add('nest-hit');
const gw=_gi('grid-wrap');
gw.classList.remove('shake');void gw.offsetWidth;gw.classList.add('shake');
spawnParticles((NC+0.5)*tileSize(),(NR+0.5)*tileSize(),10,['#ff4020','#ff8040','#ffd060'],70,0.7,5);
if(nestHp<=0){nestHp=0;gameOver();return;}
}
} else {
if(e.atkCd<=0){
tgt.hp-=e.bldDmg;e.atkCd=e.atkSpd;
if(tgt.hp<=0){
const bname=BDEF[tgt.type].name;
G[wp.r][wp.c]={state:'rubble',type:null,tier:0,hp:0,maxHp:0};
renderTile(wp.r,wp.c);
e.path=findPath(wp.r,wp.c,NR,NC);e.pathIdx=1;
spawnParticles((wp.c+0.5)*tileSize(),(wp.r+0.5)*tileSize(),14,['#c08020','#804010','#e0c060','#fff'],75,0.8,5);
logMsg(`${BDEF[tgt.type]?.e||''} ${bname} destroyed!`);
if(selTile&&selTile.r===wp.r&&selTile.c===wp.c)closePanel();
} else renderTile(wp.r,wp.c);
}
}
} else {
const sp=(e.slowTimer>0?e.spd*0.4:e.spd)*dt;
if(d<sp+1){e.px=tx;e.py=ty;e.r=wp.r;e.c=wp.c;e.pathIdx++;}
else{e.px+=dx/d*sp;e.py+=dy/d*sp;}
}
}
}
function findNearestSoldier(px,py,range){
let best=null,bestD=range*range;
for(const s of soldiers){const dx=s.px-px,dy=s.py-py,d2=dx*dx+dy*dy;if(d2<bestD){bestD=d2;best=s;}}
return best;
}
function pickWanderTile(ts){
const opts=[];
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c];
if(t.state==='empty'||t.state==='nest') opts.push({x:(c+0.5)*ts+(_mr()-0.5)*ts*0.5,y:(r+0.5)*ts+(_mr()-0.5)*ts*0.5});
}
if(opts.length===0) return {x:(NC+0.5)*ts,y:(NR+0.5)*ts};
return opts[_mf(_mr()*opts.length)];
}
function updateSoldiers(dt){
const ts=tileSize();
for(let i=soldiers.length-1;i>=0;i--){
const s=soldiers[i];s.atkCd=_mx(0,s.atkCd-dt);
const ne=findNearestEnemy(s.px,s.py,ts*(s.rngMult||1.5));
if(ne){
const dx=ne.px-s.px,dy=ne.py-s.py,d=_ms(dx*dx+dy*dy);
if(d>ts*0.5){const sp=s.spd||60;s.px+=dx/d*sp*dt;s.py+=dy/d*sp*dt;}
else if(s.atkCd<=0){const dmg=s.dmg||2;ne.hp-=dmg;s.atkCd=s.atkSpd||1.0;if(ne.hp<=0){spawnDeathParticles(ne.px,ne.py,ne.type);enemies.splice(enemies.indexOf(ne),1);}}
} else {
if(!s.wanderTx){
const wt=pickWanderTile(ts);
s.wanderTx=wt.x; s.wanderTy=wt.y; s.wanderWait=0;
}
if(s.wanderWait>0){ s.wanderWait-=dt; }
else {
const dx=s.wanderTx-s.px, dy=s.wanderTy-s.py, d=_ms(dx*dx+dy*dy);
if(d<4){
s.wanderWait=1+_mr()*2;
const wt=pickWanderTile(ts);
s.wanderTx=wt.x; s.wanderTy=wt.y;
s.flipX=s.wanderTx<s.px;
} else {
s.px+=dx/d*(s.spd||45)*0.75*dt; s.py+=dy/d*(s.spd||45)*0.75*dt;
s.flipX=dx<0;
}
}
}
}
}
function findNearestEnemy(px,py,range){
let best=null,bestD=range*range;
for(const e of enemies){const dx=e.px-px,dy=e.py-py,d2=dx*dx+dy*dy;if(d2<bestD){bestD=d2;best=e;}}
return best;
}
function updateTowers(dt){
const ts=tileSize();
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c];if(t.state!=='building'||t.type!=='tower')continue;
const key=`${r}_${c}`;if(!towerAcc[key])towerAcc[key]=0;
towerAcc[key]+=dt;
const tier=BDEF.tower.tiers[t.tier];
if(towerAcc[key]<tier.spd)continue;
towerAcc[key]=0;
const cx=(c+0.5)*ts,cy=(r+0.5)*ts,range=tier.rng*ts;
const targets=enemies.filter(e=>{const dx=e.px-cx,dy=e.py-cy;return dx*dx+dy*dy<=range*range;})
.sort((a,b)=>(a.px-cx)**2+(a.py-cy)**2-(b.px-cx)**2-(b.py-cy)**2);
const max=tier.chain||(t.tier>=3?3:t.tier===2?2:1);
for(let n=0;n<_mn(max,targets.length);n++){
const tgt=targets[n];
bullets.push({id:bidSeq++,px:cx,py:cy,tx:tgt.px,ty:tgt.py,targetId:tgt.id,dmg:tier.dmg,spd:280});
spawnParticles(cx,cy,3,['#f0d040','#ffa020'],40,0.2,3);
}
}
}
function updateBullets(dt){
for(let i=bullets.length-1;i>=0;i--){
const b=bullets[i];
const tgt=enemies.find(e=>e.id===b.targetId);
if(!tgt){bullets.splice(i,1);continue;}
b.tx=tgt.px;b.ty=tgt.py;
const dx=b.tx-b.px,dy=b.ty-b.py,d=_ms(dx*dx+dy*dy);
if(d<b.spd*dt+4){
tgt.hp-=b.dmg;
if(tgt.hp<=0)enemies.splice(enemies.indexOf(tgt),1);
bullets.splice(i,1);
} else {b.px+=dx/d*b.spd*dt;b.py+=dy/d*b.spd*dt;}
}
}
function drawCanvas(){
const cv=_gi('canvas');
const ctx=cv.getContext('2d');
ctx.clearRect(0,0,cv.width,cv.height);
const ts=tileSize();
for(const b of bullets){
const col=b.color||'#f0d040';
const glow=b.color?'rgba(160,220,255,0.25)':'rgba(240,200,60,0.25)';
ctx.beginPath();ctx.arc(b.px,b.py,5,0,_pi*2);
ctx.fillStyle=glow;ctx.fill();
ctx.beginPath();ctx.arc(b.px,b.py,2.5,0,_pi*2);
ctx.fillStyle=col;ctx.fill();
}
for(const p of particles){
const alpha=_mx(0,p.life/p.maxLife);
ctx.globalAlpha=alpha;
ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,_pi*2);
ctx.fillStyle=p.color;ctx.fill();
}
ctx.globalAlpha=1;
for(let r=0;r<GS;r++)for(let c=0;c<GS;c++){
const t=G[r][c];
if(t.state==='building'&&t.type==='tower'&&selTile&&selTile.r===r&&selTile.c===c){
const tier=BDEF.tower.tiers[t.tier];
ctx.beginPath();ctx.arc((c+0.5)*ts,(r+0.5)*ts,tier.rng*ts,0,_pi*2);
ctx.strokeStyle='rgba(210,180,60,0.18)';ctx.lineWidth=1.5;ctx.stroke();
}
}
ctx.textAlign='center';ctx.textBaseline='middle';
for(const s of soldiers){
const fs=_mf(ts*0.44);
ctx.save();
ctx.translate(s.px,s.py);
if(s.flipX) ctx.scale(-1,1);
ctx.font=`${fs}px serif`;ctx.fillText('🦆',0,0);
ctx.restore();
const pct=s.hp/s.maxHp,bw=ts*0.48,bh=3,bx=s.px-bw/2,by=s.py+ts*0.27;
ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(bx,by,bw,bh);
ctx.fillStyle=pct>0.5?'#4a8c38':'#a03020';ctx.fillRect(bx,by,bw*pct,bh);
}
for(const e of enemies){
const fs=_mf(ts*0.48);
ctx.font=`${fs}px serif`;ctx.fillText(e.e,e.px,e.py);
const pct=e.hp/e.maxHp,bw=ts*0.52,bh=3,bx=e.px-bw/2,by=e.py+ts*0.29;
ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(bx,by,bw,bh);
ctx.fillStyle=pct>0.5?'#4a8c38':pct>0.25?'#c08820':'#902820';
ctx.fillRect(bx,by,bw*pct,bh);
}
}
function gameOver(){
dead=true;
const ov=_ce('div');ov.className='overlay';
ov.innerHTML=`
<div class="ov-icon">🏚️</div>
<div class="ov-title">Kingdom Fallen</div>
<div class="ov-sub">Your Nest was destroyed. The realm is lost.</div>
<div class="ov-card">
<div class="ov-row">Seasons survived <span>${season}</span></div>
<div class="ov-row">Enemies slain <span>${eidSeq-enemies.length}</span></div>
</div>
<button class="big-btn green" id="restart-btn">▶ Rise Again</button>`;
_gi('app').appendChild(ov);
_gi('restart-btn').addEventListener('click',()=>{ov.remove();restartGame();});
}
function restartGame(){
window.paused=false;
G={};R={food:50,gold:30,wood:20,energy:0,rock:0,iron:0};nestHp=50;season=1;raidCd=0;firstRaid=true;
enemies=[];soldiers=[];bullets=[];towerAcc={};autoAcc={};ptAcc={};particles=[];pSeq=0;
tool=null;selTile=null;sawmillFree=true;marketFree=true;farmFree=true;dead=false;
lastT=0;resAcc=0;eidSeq=0;sidSeq=0;bidSeq=0;
_gi('panel').classList.remove('open');
initGrid();_raf(()=>_raf(()=>_raf(()=>{buildGridDOM();buildToolbar();updateHUD();})));
_raf(gameLoop);
}
function logMsg(msg){
const log=_gi('log');
const d=_ce('div');d.className='log-entry';d.textContent=msg;
log.appendChild(d);setTimeout(()=>d.remove(),3200);
while(log.children.length>4)log.removeChild(log.firstChild);
}
initGrid();
_raf(()=>_raf(()=>_raf(()=>{
buildGridDOM();buildToolbar();updateHUD();
lastT=performance.now();
_raf(gameLoop);
})));
logMsg('🏰 Kingdom founded! Claim your free 🪵 Lumber Yard first.');
})();
_kingdomEl._resizeH=(()=>{let _rt;return()=>{clearTimeout(_rt);_rt=setTimeout(()=>_raf(buildGridDOM),150);}})();
window.addEventListener('resize',_kingdomEl._resizeH);
window.addEventListener('orientationchange',_kingdomEl._resizeH);
}
(()=>{
let _disguiseEl=null;
window._launchDisguise=function(){
window.paused=true;
if(window._menuEl)window._menuEl.style.display='none';
if(window._homeBtn)window._homeBtn.style.display='';
window._disguiseActive=true;
if(_disguiseEl){_disguiseEl.remove();_disguiseEl=null;}
_buildDisguise();
};
window._exitDisguise=function(){
window._disguiseActive=false;
window.paused=false;
roundActive=false;
if(typeof timerRAF!=='undefined'&&timerRAF){_caf(timerRAF);timerRAF=null;}
if(typeof timerInterval!=='undefined'&&timerInterval){clearInterval(timerInterval);timerInterval=null;}
if(_disguiseEl){_disguiseEl.remove();_disguiseEl=null;}
if(window._menuEl)window._menuEl.style.display='flex';
if(window._randomiseFeatured)window._randomiseFeatured();
if(window._homeBtn)window._homeBtn.style.display='none';
};
function _buildDisguise(){
if(!_gi('dg-style')){
const st=_ce('style');st.id='dg-style';
st.textContent=`
@import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@600;700;800;900&display=swap');
#dg-app{position:fixed;inset:0;z-index:1000085;background:#0d1117;display:flex;flex-direction:column;font-family:'Nunito',sans-serif;overflow:hidden;user-select:none;}
#dg-header{display:flex;align-items:center;gap:6px;padding:0 10px;height:50px;flex-shrink:0;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.07);overflow-x:auto;scrollbar-width:none;}
#dg-title{font-family:'Fredoka One',cursive;font-size:18px;color:#f0c040;letter-spacing:.03em;}
#dg-score-wrap{display:flex;align-items:center;gap:10px;}
.dg-stat{display:flex;flex-direction:column;align-items:center;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:3px 10px;min-width:52px;}
.dg-stat-label{font-size:8px;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:.08em;}
.dg-stat-val{font-size:15px;font-weight:900;color:#fff;line-height:1.2;}
#dg-menu-btn{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.5);font-size:11px;font-weight:900;padding:6px 12px;border-radius:9px;cursor:pointer;font-family:'Nunito',sans-serif;}
#dg-timer-bar-wrap{height:4px;flex-shrink:0;background:rgba(255,255,255,0.06);}
#dg-timer-bar{height:100%;background:linear-gradient(90deg,#f0c040,#f06040);transition:width .25s linear,background .5s;}
#dg-round-banner{text-align:center;padding:8px 0 4px;font-size:12px;font-weight:800;color:rgba(255,255,255,0.35);letter-spacing:.08em;text-transform:uppercase;flex-shrink:0;}
#dg-grid-wrap{flex:1;display:flex;align-items:center;justify-content:center;padding:8px;overflow:hidden;}
#dg-grid{display:grid;gap:6px;}
.dg-duck{display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.04);border:2px solid rgba(255,255,255,0.07);border-radius:14px;cursor:pointer;position:relative;transition:background .12s,border-color .12s,transform .1s;touch-action:manipulation;flex-direction:column;gap:1px;}
.dg-duck:hover{background:rgba(255,255,255,0.09);border-color:rgba(255,255,255,0.2);}
.dg-duck:active{transform:scale(0.93);}
.dg-duck.selected{border-color:#f0c040;background:rgba(240,192,64,0.12);}
.dg-duck.correct{border-color:#50d080!important;background:rgba(80,208,128,0.18)!important;animation:dgPop .4s ease;}
.dg-duck.wrong{border-color:#e04040!important;background:rgba(224,64,64,0.18)!important;animation:dgShake .35s ease;}
.dg-duck.reveal{border-color:#ff8c00!important;background:rgba(255,140,0,0.18)!important;}
.dg-hat{font-size:.55em;line-height:1;position:absolute;top:-2px;pointer-events:none;}
.dg-acc{font-size:.38em;line-height:1;position:absolute;bottom:4px;right:4px;pointer-events:none;}
@keyframes dgPop{0%{transform:scale(1)}40%{transform:scale(1.18)}100%{transform:scale(1)}}
@keyframes dgShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}
@media(min-width:600px){
 #dg-header{height:58px;padding:0 18px;}
 #dg-title{font-size:20px;}
 .dg-stat{padding:4px 14px;min-width:62px;}
 .dg-stat-val{font-size:17px;}
 #dg-grid-wrap{padding:12px;}
 #dg-grid{gap:8px;}
 .dg-duck{border-radius:16px;border-width:2px;}
 .dg-clue{padding:9px 14px;font-size:13px;border-radius:12px;}
 .dg-clue-icon{font-size:18px;}
 #dg-clues{padding:10px 14px 12px;gap:6px;}
}

#dg-clues{flex-shrink:0;padding:8px 12px 10px;display:flex;flex-direction:column;gap:5px;background:rgba(255,255,255,0.02);border-top:1px solid rgba(255,255,255,0.06);}
#dg-clues-title{font-size:9px;font-weight:900;color:rgba(255,255,255,0.3);letter-spacing:.12em;text-transform:uppercase;margin-bottom:2px;}
.dg-clue{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:10px;padding:7px 11px;font-size:12px;font-weight:700;color:rgba(255,255,255,0.75);}
.dg-clue-icon{font-size:16px;flex-shrink:0;}
.dg-clue.used{opacity:0.4;text-decoration:line-through;}
#dg-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(8,10,18,0.92);backdrop-filter:blur(10px);z-index:20;}
.dg-ov-icon{font-size:64px;line-height:1;}
.dg-ov-title{font-family:'Fredoka One',cursive;font-size:28px;color:#f0c040;letter-spacing:.04em;}
.dg-ov-sub{font-size:13px;color:rgba(255,255,255,0.5);text-align:center;max-width:260px;line-height:1.7;font-weight:700;}
.dg-ov-card{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:14px 28px;min-width:200px;}
.dg-ov-row{display:flex;justify-content:space-between;gap:24px;font-size:12px;color:rgba(255,255,255,0.4);padding:3px 0;font-weight:700;}
.dg-ov-row span{color:#f0c040;font-weight:900;font-size:14px;}
.dg-big-btn{padding:13px 36px;border-radius:13px;border:none;font-size:14px;font-weight:900;cursor:pointer;color:#fff;font-family:'Nunito',sans-serif;letter-spacing:.02em;transition:transform .08s,filter .1s;}
.dg-big-btn:active{transform:scale(0.95);}
.dg-big-btn:hover{filter:brightness(1.15);}
.dg-btn-green{background:linear-gradient(135deg,#228040,#30b050);}
.dg-btn-blue{background:linear-gradient(135deg,#1a3878,#2050c0);}
#dg-streak-flash{position:absolute;top:55px;left:50%;transform:translateX(-50%);font-family:'Fredoka One',cursive;font-size:22px;color:#f0c040;text-shadow:0 0 20px rgba(240,192,64,0.8);pointer-events:none;opacity:0;z-index:30;transition:opacity .3s;}
#dg-score-pop{position:absolute;top:55px;left:50%;transform:translateX(-50%);font-family:'Fredoka One',cursive;font-size:28px;color:#50d080;text-shadow:0 0 16px rgba(80,208,128,0.7);pointer-events:none;opacity:0;z-index:30;transition:opacity .3s,transform .5s;}
`;
document.head.appendChild(st);
}

_disguiseEl=_ce('div');
_disguiseEl.id='dg-app';
_disguiseEl.innerHTML=`
<div id="dg-header">
 <div id="dg-title">🎭 Duck Disguise</div>
 <div id="dg-score-wrap">
 <div class="dg-stat"><div class="dg-stat-label">Score</div><div class="dg-stat-val" id="dg-score">0</div></div>
 <div class="dg-stat"><div class="dg-stat-label">Round</div><div class="dg-stat-val" id="dg-round">1</div></div>
 <div class="dg-stat"><div class="dg-stat-label">Streak</div><div class="dg-stat-val" id="dg-streak">0</div></div>
 </div>
 <button id="dg-menu-btn">🏠 Menu</button>
</div>
<div id="dg-timer-bar-wrap"><div id="dg-timer-bar" style="width:100%"></div></div>
<div id="dg-round-banner" id="dg-round-banner">Round 1 — Find the impostor!</div>
<div id="dg-grid-wrap"><div id="dg-grid"></div></div>
<div id="dg-clues"><div id="dg-clues-title">🔍 Clues</div><div id="dg-clue-list"></div></div>
<div id="dg-streak-flash"></div>
<div id="dg-score-pop"></div>
`;
_ba(_disguiseEl);
window._disguiseEl=_disguiseEl;

// ── Game state ──────────────────────────────────────────────────
const PREDATOR_TYPES=['🦊','🐺','🐻','🦅','🐍'];
const HATS={none:'',tophat:'🎩',cap:'🧢',crown:'👑',bow:'🎀'};
const ACCS={none:'',glasses:'👓',monocle:'🧐',scarf:'🧣',bowtie:'🎀'};
const HAT_KEYS=Object.keys(HATS);
const ACC_KEYS=Object.keys(ACCS);
const SIZES=['small','medium','large'];
const SHADES=['light','normal','dark'];
const SHADE_FILTER={light:'brightness(1.35)',normal:'',dark:'brightness(0.6) saturate(0.7)'};

let score=0,round=1,streak=0,bestStreak=0,totalCorrect=0;
let ducks=[],predatorIdxs=[],clues=[],timerSec=0,timerMax=0;
let timerInterval=null,timerRAF=null,roundActive=false,firstTapThisRound=true;
let bestScore=0,timerLastTs=0;

function getRoundConfig(r){
 if(r<=3) return {cols:3,rows:3,predators:1,clueCount:3,time:20};
 if(r<=6) return {cols:4,rows:4,predators:1,clueCount:3,time:18};
 if(r<=10) return {cols:4,rows:5,predators:1,clueCount:2,time:16};
 if(r<=15) return {cols:5,rows:5,predators:2,clueCount:2,time:14};
 return {cols:5,rows:6,predators:2,clueCount:2,time:12};
}

function rnd(arr){return arr[_mf(_mr()*arr.length)];}
function rndInt(a,b){return a+_mf(_mr()*(b-a+1));}

function genDucks(cfg){
 const total=cfg.cols*cfg.rows;
 ducks=[];
 for(let i=0;i<total;i++){
 const row=_mf(i/cfg.cols), col=i%cfg.cols;
 ducks.push({
 idx:i, row, col,
 hat:rnd(HAT_KEYS),
 acc:rnd(ACC_KEYS),
 size:rnd(SIZES),
 shade:rnd(SHADES),
 wobble:_mr()<0.5?'slow':'fast',
 facing:_mr()<0.5?'left':'right',
 isPredator:false,
 predType:''
 });
 }
 // Pick predators
 predatorIdxs=[];
 const shuffled=[...Array(total).keys()].sort(()=>_mr()-0.5);
 for(let p=0;p<cfg.predators;p++){
 predatorIdxs.push(shuffled[p]);
 ducks[shuffled[p]].isPredator=true;
 ducks[shuffled[p]].predType=rnd(PREDATOR_TYPES);
 }
}

function buildClues(cfg){
 // Generate all possible TRUE clues about the predator(s)
 // For multi-predator: pick clues that are true for ALL predators
 const pool=[];
 const pred=ducks[predatorIdxs[0]]; // anchor on first predator
 const rows=cfg.rows, cols=cfg.cols;

 // Position clues
 const half_row=_mf(rows/2);
 const half_col=_mf(cols/2);
 if(pred.row<half_row) pool.push({icon:'⬆️',text:`The impostor is in the top half`,fn:d=>d.row<half_row});
 else pool.push({icon:'⬇️',text:`The impostor is in the bottom half`,fn:d=>d.row>=half_row});
 if(pred.col<half_col) pool.push({icon:'⬅️',text:`The impostor is in the left half`,fn:d=>d.col<half_col});
 else pool.push({icon:'➡️',text:`The impostor is in the right half`,fn:d=>d.col>=half_col});

 // Exact row/col (for larger grids)
 if(rows>3) pool.push({icon:'📍',text:`The impostor is in row ${pred.row+1}`,fn:d=>d.row===pred.row});
 if(cols>3) pool.push({icon:'📍',text:`The impostor is in column ${pred.col+1}`,fn:d=>d.col===pred.col});

 // Hat
 if(pred.hat==='none') pool.push({icon:'🚫',text:`The impostor is NOT wearing a hat`,fn:d=>d.hat==='none'});
 else pool.push({icon:'🎩',text:`The impostor is wearing a ${pred.hat==='tophat'?'top hat':pred.hat}`,fn:d=>d.hat===pred.hat});

 // Accessory
 if(pred.acc==='none') pool.push({icon:'👀',text:`The impostor has no accessory`,fn:d=>d.acc==='none'});
 else pool.push({icon:'🕵️',text:`The impostor is wearing ${pred.acc==='bowtie'?'a bow tie':pred.acc==='monocle'?'a monocle':pred.acc==='glasses'?'glasses':'a scarf'}`,fn:d=>d.acc===pred.acc});

 // Size
 pool.push({icon:'📏',text:`The impostor is ${pred.size==='large'?'the biggest':'the smallest'} duck in its row`,fn:d=>d.size===pred.size&&d.row===pred.row});
 pool.push({icon:'🔎',text:`The impostor looks ${pred.size}`,fn:d=>d.size===pred.size});

 // Shade
 if(pred.shade!=='normal') pool.push({icon:'🌓',text:`The impostor is ${pred.shade==='dark'?'darker':'lighter'} than most ducks`,fn:d=>d.shade===pred.shade});

 // Wobble
 pool.push({icon:'〰️',text:`The impostor is moving ${pred.wobble==='fast'?'faster':'slower'} than the others`,fn:d=>d.wobble===pred.wobble});

 // Facing
 pool.push({icon:'↔️',text:`The impostor is facing ${pred.facing==='left'?'left':'right'}`,fn:d=>d.facing===pred.facing});

 // Position special
 const isCorner=(pred.row===0||pred.row===rows-1)&&(pred.col===0||pred.col===cols-1);
 if(isCorner) pool.push({icon:'📐',text:`The impostor is hiding in a corner`,fn:d=>(d.row===0||d.row===rows-1)&&(d.col===0||d.col===cols-1)});

 // Neighbour count
 const neighbours=ducks.filter(d=>!d.isPredator&&(Math.abs(d.row-pred.row)+Math.abs(d.col-pred.col))===1);
 if(neighbours.length===0) pool.push({icon:'🏝️',text:`The impostor is alone — no duck directly beside it`,fn:d=>ducks.filter(o=>!o.isPredator&&(Math.abs(o.row-d.row)+Math.abs(o.col-d.col))===1).length===0});
 if(neighbours.length===4) pool.push({icon:'🤝',text:`The impostor is completely surrounded by ducks`,fn:d=>ducks.filter(o=>!o.isPredator&&(Math.abs(o.row-d.row)+Math.abs(o.col-d.col))===1).length===4});

 // Filter pool: only keep clues that are true for ALL predators
 const validPool=pool.filter(c=>predatorIdxs.every(pi=>c.fn(ducks[pi])));

 // Score each clue by how many non-predator ducks it matches (lower = more useful)
 const nonPreds=ducks.filter(d=>!d.isPredator);
 const scored=validPool.map(c=>({...c,matches:nonPreds.filter(d=>c.fn(d)).length}));
 scored.sort((a,b)=>a.matches-b.matches);

 // Pick top N clues (most specific first), with some variety
 const picked=[];
 const used=new Set();
 for(const c of scored){
 if(picked.length>=cfg.clueCount) break;
 // Avoid redundant clues (same icon type)
 if(!used.has(c.icon)){picked.push(c);used.add(c.icon);}
 }
 // Fill remaining slots if needed
 for(const c of scored){
 if(picked.length>=cfg.clueCount) break;
 if(!picked.includes(c)) picked.push(c);
 }
 clues=picked.slice(0,cfg.clueCount);
}

function getCellSize(cfg){
 const wrap=_gi('dg-grid-wrap');
 if(!wrap) return 64;
 const W=wrap.clientWidth-16, H=wrap.clientHeight-16;
 const maxW=_mf((W-(cfg.cols-1)*6)/cfg.cols);
 const maxH=_mf((H-(cfg.rows-1)*6)/cfg.rows);
 return _mn(_mx(44,_mn(maxW,maxH)),88);
}

function renderGrid(cfg){
 const grid=_gi('dg-grid');
 const cs=getCellSize(cfg);
 grid.style.cssText=`display:grid;grid-template-columns:repeat(${cfg.cols},${cs}px);gap:6px;`;
 grid.innerHTML='';
 ducks.forEach(d=>{
 const cell=_ce('div');
 cell.className='dg-duck';
 cell.style.width=cs+'px';
 cell.style.height=cs+'px';
 const em=_mf(cs*0.44);
 // Main duck emoji
 const body=_ce('div');
 body.style.cssText=`font-size:${em}px;line-height:1;${SHADE_FILTER[d.shade]?'filter:'+SHADE_FILTER[d.shade]+';':''}${d.facing==='left'?'transform:scaleX(-1);':''}${d.size==='small'?'transform:'+(d.facing==='left'?'scaleX(-1) ':'')+'scale(0.75);':d.size==='large'?'transform:'+(d.facing==='left'?'scaleX(-1) ':'')+'scale(1.18);':''}`;
 body.textContent='🦆';
 cell.appendChild(body);
 // Hat
 if(d.hat!=='none'){
 const hat=_ce('div');
 hat.className='dg-hat';
 hat.style.fontSize=_mf(em*0.55)+'px';
 hat.textContent=HATS[d.hat];
 hat.style.cssText+=`top:-${_mf(em*0.25)}px;left:50%;transform:translateX(-50%);position:absolute;pointer-events:none;`;
 cell.appendChild(hat);
 }
 // Accessory
 if(d.acc!=='none'){
 const acc=_ce('div');
 acc.style.cssText=`position:absolute;bottom:3px;right:3px;font-size:${_mf(em*0.38)}px;line-height:1;pointer-events:none;`;
 acc.textContent=ACCS[d.acc];
 cell.appendChild(acc);
 }
 cell.addEventListener('click',()=>onDuckClick(d.idx));
 grid.appendChild(cell);
 });
}

function renderClues(){
 const list=_gi('dg-clue-list');
 list.innerHTML='';
 clues.forEach(c=>{
 const el=_ce('div');
 el.className='dg-clue';
 el.innerHTML=`<span class="dg-clue-icon">${c.icon}</span><span>${c.text}</span>`;
 list.appendChild(el);
 });
}

function startRound(){
 roundActive=true;
 firstTapThisRound=true;
 const cfg=getRoundConfig(round);
 genDucks(cfg);
 buildClues(cfg);
 timerSec=cfg.time;
 timerMax=cfg.time;
 _gi('dg-round-banner').textContent=`Round ${round} — ${predatorIdxs.length>1?predatorIdxs.length+' impostors':'Find the impostor!'}`;
 _gi('dg-score').textContent=score;
 _gi('dg-round').textContent=round;
 _gi('dg-streak').textContent=streak;
 renderGrid(cfg);
 renderClues();
 updateTimerBar();
 if(timerInterval)clearInterval(timerInterval);
 if(timerRAF)_caf(timerRAF);
 timerLastTs=0;
 function _timerTick(ts){
 if(!roundActive)return;
 if(timerLastTs)timerSec-=(ts-timerLastTs)/1000;
 timerLastTs=ts;
 if(timerSec<=0){timerSec=0;updateTimerBar();timeUp();return;}
 updateTimerBar();
 timerRAF=_raf(_timerTick);
 }
 timerRAF=_raf(_timerTick);
}

function updateTimerBar(){
 const bar=_gi('dg-timer-bar');
 if(!bar)return;
 const pct=_mx(0,timerSec/timerMax*100);
 bar.style.width=pct+'%';
 bar.style.background=pct>50?'linear-gradient(90deg,#50c080,#40d0c0)':pct>25?'linear-gradient(90deg,#f0c040,#f08020)':'linear-gradient(90deg,#f04040,#d02020)';
}

function highlightMatchingClues(duckIdx){
 const d=ducks[duckIdx];
 const items=_gi('dg-clue-list').querySelectorAll('.dg-clue');
 clues.forEach((c,i)=>{
 items[i].classList.toggle('used',!c.fn(d));
 });
}

function onDuckClick(idx){
 if(!roundActive)return;
 const cell=_gi('dg-grid').children[idx];
 if(!cell)return;
 // Highlight clues
 highlightMatchingClues(idx);
 cell.classList.add('selected');
 setTimeout(()=>cell.classList.remove('selected'),200);
 const isCorrect=ducks[idx].isPredator;
 // Check if all predators found
 if(isCorrect){
 // Mark this predator as found
 ducks[idx]._found=true;
 const allFound=predatorIdxs.every(pi=>ducks[pi]._found);
 if(allFound){
 const cfg=getRoundConfig(round);
 // Score
 const timeBonus=_mf(timerSec*5);
 const perfectBonus=firstTapThisRound?50:0;
 streak++;
 bestStreak=_mx(bestStreak,streak);
 totalCorrect++;
 const mult=streak>=3?1.5:1;
 const gained=_mf((100+timeBonus+perfectBonus)*mult);
 score+=gained;
 bestScore=_mx(bestScore,score);
 roundActive=false;
 if(timerInterval)clearInterval(timerInterval);
 if(timerRAF){_caf(timerRAF);timerRAF=null;}
 // Show found
 predatorIdxs.forEach(pi=>{
 const c=_gi('dg-grid').children[pi];
 if(c){
 c.classList.add('correct');
 // Reveal predator face
 const body=c.querySelector('div');
 if(body)body.textContent=ducks[pi].predType;
 }
 });
 // Score pop
 showScorePop('+'+gained+(mult>1?' 🔥':''));
 if(streak===3||streak===5||streak===10){
 const sf=_gi('dg-streak-flash');
 sf.textContent=streak+'🔥 Streak!';
 sf.style.opacity='1';
 setTimeout(()=>sf.style.opacity='0',1500);
 }
 setTimeout(()=>nextRound(),1200);
 }
 } else {
 firstTapThisRound=false;
 streak=0;
 _gi('dg-streak').textContent=0;
 cell.classList.add('wrong');
 setTimeout(()=>cell.classList.remove('wrong'),400);
 }
}

function timeUp(){
 if(!roundActive)return;
 roundActive=false;
 if(timerInterval)clearInterval(timerInterval);
 if(timerRAF){_caf(timerRAF);timerRAF=null;}
 streak=0;
 revealAndGameOver('⏰','Time\'s Up!');
}

function revealAndGameOver(icon,title){
 // Reveal predators
 predatorIdxs.forEach(pi=>{
 const c=_gi('dg-grid').children[pi];
 if(c){
 c.classList.add('reveal');
 const body=c.querySelector('div');
 if(body)body.textContent=ducks[pi].predType;
 }
 });
 setTimeout(()=>showGameOver(icon,title),900);
}

function showGameOver(icon,title){
 const ov=_ce('div');
 ov.id='dg-overlay';
 ov.innerHTML=`
 <div class="dg-ov-icon">${icon}</div>
 <div class="dg-ov-title">${title}</div>
 <div class="dg-ov-card">
 <div class="dg-ov-row">Final Score <span>${score}</span></div>
 <div class="dg-ov-row">Rounds Survived <span>${round-1}</span></div>
 <div class="dg-ov-row">Best Streak <span>${bestStreak}🔥</span></div>
 </div>
 <div style="display:flex;gap:10px;">
 <button class="dg-big-btn dg-btn-green" id="dg-restart-btn">▶ Play Again</button>
 <button class="dg-big-btn dg-btn-blue" id="dg-menu-btn2">🏠 Menu</button>
 </div>
 `;
 _disguiseEl.appendChild(ov);
 _gi('dg-restart-btn').addEventListener('click',()=>{ov.remove();score=0;round=1;streak=0;bestStreak=0;totalCorrect=0;startRound();});
 _gi('dg-menu-btn2').addEventListener('click',()=>window._exitDisguise());
}

function nextRound(){
 round++;
 _gi('dg-score').textContent=score;
 _gi('dg-round').textContent=round;
 _gi('dg-streak').textContent=streak;
 startRound();
}

function showScorePop(txt){
 const pop=_gi('dg-score-pop');
 pop.textContent=txt;
 pop.style.opacity='1';
 pop.style.transform='translateX(-50%) translateY(0)';
 setTimeout(()=>{pop.style.opacity='0';pop.style.transform='translateX(-50%) translateY(-30px)';},900);
 setTimeout(()=>{pop.style.transform='translateX(-50%) translateY(0)';},1200);
}

// Hook up buttons
_gi('dg-menu-btn').addEventListener('click',()=>window._exitDisguise());

// Show start screen
const startOv=_ce('div');
startOv.id='dg-overlay';
startOv.innerHTML=`
 <div class="dg-ov-icon">🎭</div>
 <div class="dg-ov-title">Duck Disguise</div>
 <div class="dg-ov-sub">A predator is hiding among the ducks.<br>Use the clues to unmask the impostor before time runs out!</div>
 <button class="dg-big-btn dg-btn-green" id="dg-start-btn">▶ Start</button>
`;
_disguiseEl.appendChild(startOv);
_gi('dg-start-btn').addEventListener('click',()=>{startOv.remove();startRound();});

window.addEventListener('resize',()=>{
 if(!window._disguiseActive)return;
 const cfg=getRoundConfig(round);
 renderGrid(cfg);
});
}
})();

(()=>{
let _cookEl=null;
window._launchCooking=function(){
 window.paused=true;
 if(window._menuEl)window._menuEl.style.display='none';
 if(window._homeBtn)window._homeBtn.style.display='';
 window._cookingActive=true;
 if(_cookEl){_cookEl.remove();_cookEl=null;}
 _buildCooking();
};
window._exitCooking=function(){
 window._cookingActive=false;
 window.paused=false;
 if(typeof stopFloatEmojis==='function')stopFloatEmojis();
 if(typeof stopFloatEmojis==='function')stopFloatEmojis();
 if(_cookEl){
 if(_cookEl._raf)_caf(_cookEl._raf);
 _cookEl.remove();_cookEl=null;
 }
 if(window._menuEl)window._menuEl.style.display='flex';
 if(window._randomiseFeatured)window._randomiseFeatured();
 if(window._homeBtn)window._homeBtn.style.display='none';
};

function _buildCooking(){
 if(!_gi('ck2-style')){
 const st=_ce('style');st.id='ck2-style';
 st.textContent=`
@import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@600;700;800;900&display=swap');
#ck2{position:fixed;inset:0;z-index:1000085;background:#1a0e06;display:flex;flex-direction:column;font-family:'Nunito',sans-serif;color:#f0e0c0;overflow:hidden;}
#ck2-hdr{display:flex;align-items:center;gap:4px;padding:0 8px;height:48px;flex-shrink:0;background:#120a04;border-bottom:2px solid #3a2010;overflow-x:auto;scrollbar-width:none;}
#ck2-name{font-family:'Fredoka One',cursive;font-size:17px;color:#f0a030;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ck2-pill{display:flex;align-items:center;gap:4px;background:rgba(0,0,0,0.35);border:1px solid rgba(255,200,100,0.2);border-radius:20px;padding:3px 10px;font-size:12px;font-weight:800;}
.ck2-pill span{color:#f0c040;}
#ck2-menu-btn{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.45);font-size:11px;font-weight:900;padding:5px 11px;border-radius:9px;cursor:pointer;font-family:'Nunito',sans-serif;flex-shrink:0;}
#ck2-sub{display:flex;align-items:center;justify-content:space-between;padding:0 12px;height:34px;flex-shrink:0;background:#0e0804;border-bottom:1px solid #2a1808;font-size:11px;font-weight:800;}
#ck2-day-info{color:rgba(240,200,150,0.6);}
#ck2-timer{color:#f0c040;font-family:'Fredoka One',cursive;font-size:14px;}
#ck2-timer.danger{color:#f05040;animation:ck2pulse .5s ease-in-out infinite;}
.ck2-speed-btn{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.5);font-size:11px;font-weight:900;padding:3px 9px;border-radius:7px;cursor:pointer;font-family:'Nunito',sans-serif;margin-left:4px;}
.ck2-speed-btn.active{background:rgba(240,160,48,0.25);border-color:#f0a030;color:#f0a030;}
@keyframes ck2pulse{0%,100%{opacity:1}50%{opacity:.5}}
#ck2-body{flex:1;display:flex;overflow:hidden;min-height:0;}
#ck2-left{flex:1;display:flex;flex-direction:column;border-right:1px solid #2a1808;overflow:hidden;min-width:0;}
#ck2-right{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;}
.ck2-panel-hdr{padding:6px 10px 5px;font-size:9px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:rgba(240,200,150,0.4);border-bottom:1px solid #2a1808;flex-shrink:0;}
#ck2-orders{flex:1;overflow-y:auto;padding:6px;display:flex;flex-direction:column;gap:5px;scrollbar-width:none;}
#ck2-orders::-webkit-scrollbar{display:none;}
.ck2-order{background:#231408;border:1.5px solid #3a2010;border-radius:11px;padding:8px 10px;transition:border-color .2s;}
.ck2-order.cooking{border-color:#f0a030;}
.ck2-order.done{border-color:#50c870;}
.ck2-order.angry{border-color:#e04030;opacity:.55;}
.ck2-order-top{display:flex;align-items:center;gap:6px;margin-bottom:5px;}
.ck2-order-emoji{font-size:22px;line-height:1;}
.ck2-order-info{flex:1;min-width:0;}
.ck2-order-name{font-size:12px;font-weight:900;color:#f0e0c0;line-height:1.2;}
.ck2-order-price{font-size:10px;color:#f0c040;font-weight:800;}
.ck2-order-customer{font-size:10px;color:rgba(240,200,150,0.5);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ck2-patience-bar{height:3px;background:rgba(0,0,0,0.4);border-radius:2px;overflow:hidden;margin-bottom:4px;}
.ck2-patience-fill{height:100%;border-radius:2px;}
.ck2-cook-bar{height:4px;background:rgba(0,0,0,0.4);border-radius:2px;overflow:hidden;margin-bottom:5px;}
.ck2-cook-fill{height:100%;background:linear-gradient(90deg,#f08020,#f0c040);border-radius:2px;}
.ck2-order-btns{display:flex;gap:5px;}
.ck2-btn{padding:5px 12px;border-radius:7px;border:none;font-size:10px;font-weight:900;cursor:pointer;font-family:'Nunito',sans-serif;transition:filter .1s,transform .08s;touch-action:manipulation;}
.ck2-btn:active{transform:scale(.94);}
.ck2-btn-cook{background:linear-gradient(135deg,#8a4010,#c06020);color:#fff;}
.ck2-btn-cook:hover{filter:brightness(1.15);}
.ck2-btn-serve{background:linear-gradient(135deg,#206a30,#30a050);color:#fff;}
.ck2-btn-serve:hover{filter:brightness(1.15);}
.ck2-btn-disabled{background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.25);cursor:default;}
#ck2-kitchen{flex:1;overflow-y:auto;padding:6px;display:flex;flex-direction:column;gap:5px;scrollbar-width:none;}
#ck2-kitchen::-webkit-scrollbar{display:none;}
.ck2-staff-slot{background:#1e1008;border:1.5px solid #3a2010;border-radius:11px;padding:8px 10px;display:flex;align-items:center;gap:8px;}
.ck2-staff-emoji{font-size:24px;flex-shrink:0;}
.ck2-staff-info{flex:1;min-width:0;}
.ck2-staff-name{font-size:11px;font-weight:900;color:#f0e0c0;}
.ck2-staff-task{font-size:10px;color:rgba(240,200,150,0.5);font-weight:700;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ck2-staff-bar{height:3px;background:rgba(0,0,0,0.4);border-radius:2px;overflow:hidden;margin-top:4px;}
.ck2-staff-bar-fill{height:100%;background:linear-gradient(90deg,#f08020,#f0c040);transition:width .1s;}
#ck2-dock{flex-shrink:0;display:flex;flex-direction:column;transition:none;}#ck2-dock.collapsed #ck2-panel{display:none;}#ck2-dock.collapsed #ck2-tabs{border-top:2px solid #3a2010;}#ck2-tabs{flex-shrink:0;display:flex;border-top:2px solid #3a2010;background:#120a04;}#ck2-dock-toggle{background:rgba(240,160,48,.12);border:none;border-top:1px solid #3a2010;color:rgba(240,200,150,.5);font-size:10px;font-weight:900;padding:3px 0;cursor:pointer;font-family:'Nunito',sans-serif;letter-spacing:.06em;text-transform:uppercase;transition:background .15s,color .15s;width:100%;}#ck2-dock-toggle:hover{background:rgba(240,160,48,.2);color:#f0a030;}
.ck2-tab{flex:1;padding:8px 4px;text-align:center;font-size:10px;font-weight:900;color:rgba(240,200,150,0.4);cursor:pointer;letter-spacing:.04em;text-transform:uppercase;border-top:2px solid transparent;margin-top:-2px;transition:color .15s;touch-action:manipulation;-webkit-tap-highlight-color:rgba(240,160,48,.2);user-select:none;}
.ck2-tab.active{color:#f0a030;border-top-color:#f0a030;background:rgba(240,160,48,.08);}
#ck2-panel{flex-shrink:0;background:#170e06;border-top:1px solid #2a1808;overflow-y:auto;max-height:36vh;scrollbar-width:none;}
#ck2-panel::-webkit-scrollbar{display:none;}
.ck2-panel-content{padding:8px;}
.ck2-menu-item{display:flex;align-items:center;gap:8px;background:#1e1208;border:1.5px solid #2e1a0a;border-radius:10px;padding:8px 10px;margin-bottom:6px;}
.ck2-menu-emoji{font-size:22px;flex-shrink:0;}
.ck2-menu-info{flex:1;min-width:0;}
.ck2-menu-name{font-size:12px;font-weight:900;color:#f0e0c0;}
.ck2-menu-detail{font-size:10px;color:rgba(240,200,150,0.5);font-weight:700;margin-top:1px;}
.ck2-menu-price{font-size:13px;font-weight:900;color:#f0c040;flex-shrink:0;}
.ck2-toggle{width:36px;height:20px;border-radius:10px;background:#3a2010;border:none;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0;}
.ck2-toggle.on{background:#f0a030;}
.ck2-toggle::after{content:'';position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .2s;}
.ck2-toggle.on::after{transform:translateX(16px);}
.ck2-staff-card{display:flex;align-items:center;gap:8px;background:#1e1208;border:1.5px solid #2e1a0a;border-radius:10px;padding:8px 10px;margin-bottom:6px;}
.ck2-staff-card-info{flex:1;min-width:0;}
.ck2-staff-card-name{font-size:12px;font-weight:900;color:#f0e0c0;}
.ck2-staff-card-desc{font-size:10px;color:rgba(240,200,150,0.5);font-weight:700;margin-top:1px;}
.ck2-hire-btn{padding:5px 12px;border-radius:8px;border:none;font-size:11px;font-weight:900;cursor:pointer;font-family:'Nunito',sans-serif;background:linear-gradient(135deg,#6a3810,#a05820);color:#f0e0c0;flex-shrink:0;touch-action:manipulation;}
.ck2-hire-btn:disabled{background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.25);cursor:default;}
.ck2-upgrade-card{background:#1e1208;border:1.5px solid #2e1a0a;border-radius:10px;padding:10px 12px;margin-bottom:6px;}
.ck2-upgrade-name{font-size:13px;font-weight:900;color:#f0e0c0;margin-bottom:4px;}
.ck2-upgrade-desc{font-size:10px;color:rgba(240,200,150,0.5);font-weight:700;margin-bottom:8px;line-height:1.5;}
.ck2-upgrade-btn{padding:6px 16px;border-radius:8px;border:none;font-size:11px;font-weight:900;cursor:pointer;font-family:'Nunito',sans-serif;background:linear-gradient(135deg,#6a3810,#a05820);color:#f0e0c0;touch-action:manipulation;}
.ck2-upgrade-btn:disabled{background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.25);cursor:default;}
#ck2-event{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a0c04;border:2px solid #f0a030;border-radius:16px;padding:20px;min-width:260px;max-width:88vw;z-index:20;box-shadow:0 8px 40px rgba(0,0,0,.85);text-align:center;}
#ck2-event-icon{font-size:48px;margin-bottom:8px;}
#ck2-event-title{font-family:'Fredoka One',cursive;font-size:20px;color:#f0a030;margin-bottom:6px;}
#ck2-event-desc{font-size:12px;color:rgba(240,200,150,0.7);font-weight:700;line-height:1.6;margin-bottom:14px;}
.ck2-event-btns{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;}
.ck2-event-btn{padding:9px 20px;border-radius:10px;border:none;font-size:12px;font-weight:900;cursor:pointer;font-family:'Nunito',sans-serif;touch-action:manipulation;}
.ck2-event-btn-primary{background:linear-gradient(135deg,#a05820,#d08030);color:#fff;}
.ck2-event-btn-secondary{background:rgba(255,255,255,0.08);color:rgba(240,200,150,0.8);border:1px solid rgba(255,200,100,0.2);}
#ck2-overlay{position:absolute;inset:0;background:rgba(10,5,0,.92);backdrop-filter:blur(8px);z-index:15;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px;}
.ck2-ov-icon{font-size:56px;}
.ck2-ov-title{font-family:'Fredoka One',cursive;font-size:26px;color:#f0a030;text-align:center;}
.ck2-ov-card{background:rgba(0,0,0,.4);border:1px solid rgba(240,160,48,.25);border-radius:14px;padding:14px 24px;min-width:200px;}
.ck2-ov-row{display:flex;justify-content:space-between;gap:20px;font-size:12px;color:rgba(240,200,150,.5);padding:3px 0;font-weight:700;}
.ck2-ov-row span{color:#f0c040;font-weight:900;}
.ck2-big-btn{padding:12px 36px;border-radius:12px;border:none;font-size:14px;font-weight:900;cursor:pointer;font-family:'Nunito',sans-serif;touch-action:manipulation;transition:filter .1s,transform .08s;}
.ck2-big-btn:hover{filter:brightness(1.15);}
.ck2-big-btn:active{transform:scale(.95);}
.ck2-btn-orange{background:linear-gradient(135deg,#8a4010,#d07020);color:#fff;}
.ck2-btn-green{background:linear-gradient(135deg,#206a30,#30a050);color:#fff;}
#ck2-log{position:absolute;bottom:calc(36vh + 44px);left:8px;right:8px;pointer-events:none;z-index:5;display:flex;flex-direction:column;gap:3px;align-items:flex-start;}
.ck2-log-entry{background:rgba(10,5,0,.88);border:1px solid rgba(240,160,48,.2);padding:3px 9px;border-radius:6px;font-size:10px;font-weight:700;color:rgba(240,200,150,.85);animation:ck2logFade 3s ease forwards;}
@keyframes ck2logFade{0%{opacity:1}70%{opacity:1}100%{opacity:0}}
.ck2-coin-pop{position:absolute;font-family:'Fredoka One',cursive;font-size:16px;color:#f0c040;text-shadow:0 0 10px rgba(240,192,64,.8);pointer-events:none;z-index:10;transition:transform .8s ease-out,opacity .8s ease-out;}
#ck2-name-screen{position:absolute;inset:0;background:rgba(10,5,0,.97);z-index:25;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:20px;}
#ck2-name-screen h2{font-family:'Fredoka One',cursive;font-size:28px;color:#f0a030;text-align:center;}
#ck2-name-screen p{font-size:13px;color:rgba(240,200,150,.6);font-weight:700;text-align:center;}
#ck2-name-input{background:#231408;border:2px solid #f0a030;border-radius:12px;padding:10px 18px;font-size:16px;font-weight:800;color:#f0e0c0;font-family:'Nunito',sans-serif;text-align:center;width:min(240px,80vw);outline:none;}
.ck2-event-emoji-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:6;}
.ck2-float-emoji{position:absolute;font-size:22px;animation:ck2floatUp 2.5s ease-in forwards;}
@keyframes ck2floatUp{0%{transform:translateY(0) scale(1);opacity:1}80%{opacity:.8}100%{transform:translateY(-120px) scale(.7);opacity:0}}
 `;
 document.head.appendChild(st);
 }

 // ── Data ──────────────────────────────────────────────────────
 const MENU_TIERS=[
 {name:'Starter Menu',cost:0,dishes:[
 {id:'crumbs',name:'Bread Crumbs',emoji:'🍞',price:8,cookTime:5,tier:1},
 {id:'salad',name:'Pond Weed Salad',emoji:'🥗',price:12,cookTime:7,tier:1},
 {id:'nuggets',name:'Duckling Nuggets',emoji:'🍗',price:15,cookTime:9,tier:1},
 ]},
 {name:'Expanded Menu',cost:50,dishes:[
 {id:'burger',name:'Quack Burger',emoji:'🍔',price:22,cookTime:13,tier:2},
 {id:'fries',name:'Feather Fries',emoji:'🍟',price:18,cookTime:8,tier:2},
 {id:'tacos',name:'Beak Tacos',emoji:'🌮',price:24,cookTime:15,tier:2},
 ]},
 {name:"Chef's Special",cost:150,dishes:[
 {id:'wings',name:'Waddle Wings',emoji:'🍖',price:35,cookTime:19,tier:3},
 {id:'confit',name:'Duck Confit',emoji:'🍽️',price:42,cookTime:23,tier:3},
 {id:'soup',name:'Pond Soup',emoji:'🍲',price:30,cookTime:16,tier:3},
 ]},
 {name:'Fine Dining',cost:400,dishes:[
 {id:'grand',name:'Grand Quackling',emoji:'🦆',price:65,cookTime:30,tier:4},
 {id:'risotto',name:'Truffle Egg Risotto',emoji:'🥚',price:58,cookTime:28,tier:4},
 {id:'cake',name:'Swan Lake Cake',emoji:'🎂',price:52,cookTime:25,tier:4},
 ]},
 ];
 const STAFF_DEFS=[
 {id:'rookie',name:'Rookie Chef',emoji:'👨‍🍳',desc:'Auto-cooks 1 order at a time (slow, Tier 1 only)',cost:30,wage:5,speed:0.6,maxTier:1,slots:1,type:'chef'},
 {id:'senior',name:'Senior Chef',emoji:'🧑‍🍳',desc:'Auto-cooks 1 order faster (Tier 1–2)',cost:80,wage:12,speed:1.0,maxTier:2,slots:1,type:'chef'},
 {id:'head',name:'Head Chef',emoji:'👩‍🍳',desc:'Auto-cooks 2 orders fast, any dish',cost:200,wage:30,speed:1.5,maxTier:4,slots:2,type:'chef'},
 {id:'waiter',name:'Waiter Duck',emoji:'🦆',desc:'Auto-serves completed orders instantly',cost:25,wage:8,speed:0,maxTier:0,slots:0,type:'service'},
 {id:'manager',name:'Manager Duck',emoji:'🎩',desc:'Customers wait 40% longer before leaving',cost:120,wage:20,speed:0,maxTier:0,slots:0,type:'service'},
 {id:'cleaner',name:'Cleaner Duck',emoji:'🧹',desc:'Clears angry/expired orders from the queue',cost:40,wage:6,speed:0,maxTier:0,slots:0,type:'service'},
 ];
 const CUSTOMER_NAMES=['Mr Quack','Ducky McDuckface','Sir Flaps','Lady Waddle','Count Beak','Puddles','Gerald','Agnes','Reginald','Baroness Feathers','Dr Splash','Quackers','Señor Plume','Chef Breadsworth'];
 const EVENTS=[
 {id:'robbery',icon:'🦊',title:'Fox Robbery!',desc:'A shifty fox demands Duck Bucks — or else...',floatEmoji:'🦊',choices:[{label:'Pay Up 💸',fn:'robbery_pay'},{label:'Fight Back! 🥊',fn:'robbery_fight'}]},
 {id:'inspector',icon:'🐀',title:'Health Inspector!',desc:'An inspector has arrived. Clean kitchen = reward!',floatEmoji:'📋',choices:[{label:'Let them in 🚪',fn:'inspector'}]},
 {id:'rush',icon:'🦆',title:'Duck Rush!',desc:'A hungry flock is heading your way!',floatEmoji:'🦆',choices:[{label:'Open the doors! 🎉',fn:'rush'}]},
 {id:'fire',icon:'🔥',title:'Kitchen Fire!',desc:"Something's burning! Act fast!",floatEmoji:'🔥',choices:[{label:'Extinguish! 🧯',fn:'fire'}]},
 {id:'critic',icon:'⭐',title:'Food Critic!',desc:'A famous critic just sat down. Impress them!',floatEmoji:'⭐',choices:[{label:'Give it your best 👨‍🍳',fn:'critic'}]},
 {id:'rainy',icon:'🌧️',title:'Rainy Day',desc:"It's pouring outside — fewer customers but bigger tips!",floatEmoji:'🌧️',choices:[{label:'Cosy up ☕',fn:'rainy'}]},
 ];

 // ── State ─────────────────────────────────────────────────────
 let S={
 name:'The Quack Shack',db:80,bestDay:0,rep:3.0,
 menuTier:0,activedishes:new Set(['crumbs','salad','nuggets']),
 staff:[],day:1,totalEarned:0,totalServed:0,
 };
 function saveGame(){}

 let orders=[],orderSeq=0;
 let dayTimer=180,dayRunning=false,gameSpeed=1;
 let lastTs=0,spawnAcc=0,eventCooldown=0;
 let rushActive=false,rushTimer=0;
 let rainyActive=false,rainyTimer=0;
 let fireActive=false,fireTimer=0;
 let criticPending=false;
 let activeEvent=null;
 let activeTab='menu';
 let floatEmojiInterval=null;

 function getAllDishes(){let d=[];for(let i=0;i<=S.menuTier;i++)d=d.concat(MENU_TIERS[i].dishes);return d;}
 function getActiveDishes(){return getAllDishes().filter(d=>S.activedishes.has(d.id));}
 function rndPick(arr){return arr[_mf(_mr()*arr.length)];}
 function getPatience(){let b=45;if(S.staff.includes('manager'))b*=1.4;if(S.rep>=4)b*=1.1;return b;}

 // ── DOM ───────────────────────────────────────────────────────
 _cookEl=_ce('div');_cookEl.id='ck2';
 _cookEl.innerHTML=`
<div id="ck2-hdr">
 <button id="ck2-menu-btn">🏠</button>
 <div id="ck2-name">${S.name}</div>
 <div class="ck2-pill">⭐<span id="ck2-rep">${S.rep.toFixed(1)}</span></div>
 <div class="ck2-pill">🦆💰<span id="ck2-db">${S.db}</span></div>
</div>
<div id="ck2-sub">
 <div id="ck2-day-info">Day <span id="ck2-day">${S.day}</span></div>
 <div id="ck2-timer">3:00</div>
 <div style="display:flex;align-items:center;">
 <button class="ck2-speed-btn active" id="ck2-s1">1×</button>
 <button class="ck2-speed-btn" id="ck2-s2">2×</button>
 <button class="ck2-speed-btn" id="ck2-s3">3×</button>
 </div>
</div>
<div id="ck2-body">
 <div id="ck2-left">
 <div class="ck2-panel-hdr">📋 Orders</div>
 <div id="ck2-orders"></div>
 </div>
 <div id="ck2-right">
 <div class="ck2-panel-hdr">👨‍🍳 Kitchen</div>
 <div id="ck2-kitchen"></div>
 </div>
</div>
<div id="ck2-dock">
 <button id="ck2-dock-toggle">▲ Shop &amp; Staff</button>
 <div id="ck2-tabs">
 <div class="ck2-tab active" data-tab="menu">🍽️ Menu</div>
 <div class="ck2-tab" data-tab="staff">👥 Staff</div>
 <div class="ck2-tab" data-tab="upgrades">⬆️ Upgrades</div>
 </div>
 <div id="ck2-panel"></div>
</div>
<div class="ck2-event-emoji-layer" id="ck2-float-layer"></div>
<div id="ck2-log"></div>
 `;
 _ba(_cookEl);
 window._cookingEl=_cookEl;

 // ── Helpers ───────────────────────────────────────────────────
 function $(id){return _gi(id);}
 function log(msg){
 const el=$('ck2-log');if(!el)return;
 const d=_ce('div');d.className='ck2-log-entry';d.textContent=msg;
 el.appendChild(d);setTimeout(()=>d.remove(),3100);
 while(el.children.length>4)el.removeChild(el.firstChild);
 }
 function coinPop(txt,x,y){
 const d=_ce('div');d.className='ck2-coin-pop';d.textContent=txt;
 d.style.cssText+=`left:${x}px;top:${y}px;`;
 _cookEl.appendChild(d);
 _raf(()=>{d.style.transform='translateY(-44px)';d.style.opacity='0';});
 setTimeout(()=>d.remove(),900);
 }
 function updateHUD(){
 const db=$('ck2-db');if(db)db.textContent=S.db;
 const rep=$('ck2-rep');if(rep)rep.textContent=S.rep.toFixed(1);
 const day=$('ck2-day');if(day)day.textContent=S.day;
 }
 function changeDB(amt,x,y){
 S.db=_mx(0,S.db+amt);
 if(amt>0&&x!=null)coinPop('+'+amt+'🦆',x,y);
 updateHUD();saveGame();
 }
 function changeRep(amt){
 S.rep=_mx(1,_mn(5,S.rep+amt));
 updateHUD();saveGame();
 if(amt>0)log('⭐ Rep up! '+S.rep.toFixed(1));
 else log('⚠️ Rep down: '+S.rep.toFixed(1));
 }

 // ── Floating event emojis ─────────────────────────────────────
 function startFloatEmojis(emoji){
 stopFloatEmojis();
 const layer=$('ck2-float-layer');if(!layer)return;
 floatEmojiInterval=setInterval(()=>{
 if(!layer.parentNode)return;
 const f=_ce('div');f.className='ck2-float-emoji';f.textContent=emoji;
 const x=_mf(_mr()*(layer.offsetWidth||300));
 const delay=_mr()*0.8;
 f.style.cssText=`left:${x}px;bottom:0;animation-delay:${delay}s;font-size:${18+_mf(_mr()*14)}px;`;
 layer.appendChild(f);
 setTimeout(()=>f.remove(),3000);
 },400);
 }
 function stopFloatEmojis(){
 if(floatEmojiInterval){clearInterval(floatEmojiInterval);floatEmojiInterval=null;}
 const layer=$('ck2-float-layer');
 if(layer)layer.innerHTML='';
 }

 // ── Tabs ──────────────────────────────────────────────────────
 let _lastTab=null;
function renderPanel(force){
 const p=$('ck2-panel');if(!p)return;
 if(!force&&_lastTab===activeTab)return; // skip if no change
 _lastTab=activeTab;
 if(activeTab==='menu')renderMenuPanel(p);
 else if(activeTab==='staff')renderStaffPanel(p);
 else renderUpgradesPanel(p);
 }
 function renderMenuPanel(p){
 let html='<div class="ck2-panel-content">';
 getAllDishes().forEach(d=>{
 const on=S.activedishes.has(d.id);
 html+=`<div class="ck2-menu-item">
 <div class="ck2-menu-emoji">${d.emoji}</div>
 <div class="ck2-menu-info"><div class="ck2-menu-name">${d.name}</div><div class="ck2-menu-detail">⏱ ${d.cookTime}s · Tier ${d.tier}</div></div>
 <div class="ck2-menu-price">${d.price}🦆</div>
 <button class="ck2-toggle${on?' on':''}" data-dish="${d.id}"></button>
 </div>`;
 });
 html+='</div>';
 p.innerHTML=html;
 p.querySelectorAll('.ck2-toggle').forEach(btn=>{
 btn.addEventListener('click',()=>{
 const id=btn.dataset.dish;
 if(S.activedishes.has(id)){if(S.activedishes.size>1)S.activedishes.delete(id);}
 else S.activedishes.add(id);
 btn.classList.toggle('on',S.activedishes.has(id));
 saveGame();
 });
 });
 }
 function renderStaffPanel(p){
 const maxStaff=3;
 let html='<div class="ck2-panel-content">';
 if(S.staff.length){
 html+='<div style="font-size:9px;font-weight:900;color:rgba(240,200,150,.4);letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px;">Hired</div>';
 S.staff.forEach((sid,i)=>{
 const def=STAFF_DEFS.find(s=>s.id===sid);if(!def)return;
 html+=`<div class="ck2-staff-card">
 <div style="font-size:22px;flex-shrink:0;">${def.emoji}</div>
 <div class="ck2-staff-card-info"><div class="ck2-staff-card-name">${def.name}</div><div class="ck2-staff-card-desc">Wage: ${def.wage}🦆/day</div></div>
 <button class="ck2-hire-btn" data-fire="${i}" style="background:linear-gradient(135deg,#6a1010,#a02020);">Fire</button>
 </div>`;
 });
 }
 html+=`<div style="font-size:9px;font-weight:900;color:rgba(240,200,150,.4);letter-spacing:.08em;text-transform:uppercase;margin:8px 0 6px;">Hire (${S.staff.length}/${maxStaff} slots)</div>`;
 STAFF_DEFS.forEach(def=>{
 const hired=S.staff.includes(def.id);
 const cantAfford=S.db<def.cost;
 const full=S.staff.length>=maxStaff&&!hired;
 html+=`<div class="ck2-staff-card">
 <div style="font-size:22px;flex-shrink:0;">${def.emoji}</div>
 <div class="ck2-staff-card-info"><div class="ck2-staff-card-name">${def.name}</div><div class="ck2-staff-card-desc">${def.desc}</div></div>
 <button class="ck2-hire-btn" data-hire="${def.id}" ${hired||cantAfford||full?'disabled':''}>${hired?'Hired':def.cost+'🦆'}</button>
 </div>`;
 });
 html+='</div>';
 p.innerHTML=html;
 p.querySelectorAll('[data-hire]').forEach(btn=>{
 btn.addEventListener('click',()=>{
 const def=STAFF_DEFS.find(s=>s.id===btn.dataset.hire);
 if(!def||S.db<def.cost||S.staff.includes(def.id)||S.staff.length>=maxStaff)return;
 changeDB(-def.cost);S.staff.push(def.id);
 log(def.emoji+' '+def.name+' hired!');
 renderPanel();renderKitchen();
 });
 });
 p.querySelectorAll('[data-fire]').forEach(btn=>{
 btn.addEventListener('click',()=>{
 const i=parseInt(btn.dataset.fire);
 const sid=S.staff[i];
 const def=STAFF_DEFS.find(s=>s.id===sid);
 S.staff.splice(i,1);
 if(def)log('👋 '+def.name+' let go');
 renderPanel();renderKitchen();saveGame();
 });
 });
 }
 function renderUpgradesPanel(p){
 let html='<div class="ck2-panel-content">';
 for(let i=1;i<MENU_TIERS.length;i++){
 const tier=MENU_TIERS[i];
 const unlocked=S.menuTier>=i;
 html+=`<div class="ck2-upgrade-card">
 <div class="ck2-upgrade-name">${unlocked?'✅':''} ${tier.name}</div>
 <div class="ck2-upgrade-desc">Unlocks: ${tier.dishes.map(d=>d.emoji+' '+d.name).join(', ')}</div>
 <button class="ck2-upgrade-btn" data-tier="${i}" ${unlocked||S.db<tier.cost?'disabled':''}>${unlocked?'Unlocked':tier.cost+'🦆 Unlock'}</button>
 </div>`;
 }
 html+='</div>';
 p.innerHTML=html;
 p.querySelectorAll('[data-tier]').forEach(btn=>{
 btn.addEventListener('click',()=>{
 const i=parseInt(btn.dataset.tier);
 const tier=MENU_TIERS[i];
 if(S.menuTier>=i||S.db<tier.cost)return;
 changeDB(-tier.cost);
 S.menuTier=_mx(S.menuTier,i);
 tier.dishes.forEach(d=>S.activedishes.add(d.id));
 log('🍽️ '+tier.name+' unlocked!');
 renderPanel();saveGame();
 });
 });
 }

 // ── Orders (event delegation — no per-element listeners) ──────
 function spawnOrder(){
 const dishes=getActiveDishes();if(!dishes.length||orders.length>=6)return;
 const dish=rndPick(dishes);
 const isCritic=criticPending&&_mr()<0.3;
 if(isCritic)criticPending=false;
 const pat=getPatience();
 orders.push({
 seq:orderSeq++,dish,
 patience:pat,maxPatience:pat,
 cookProgress:0,cooking:false,done:false,angry:false,
 customer:rndPick(CUSTOMER_NAMES),
 isCritic,
 tip:rainyActive?_mf(_mr()*10)+5:_mf(_mr()*5),
 _staffIdx:null,
 });
 }
 function renderOrders(){
 const el=$('ck2-orders');if(!el)return;
 // Diff-update: only touch what changed
 // Build a map of existing cards
 const existing={};
 for(const c of el.children)existing[c.dataset.seq]=c;
 const seenSeqs=new Set();

 orders.forEach((o,idx)=>{
 seenSeqs.add(String(o.seq));
 const pct=_mx(0,o.patience/o.maxPatience*100);
 const pColor=pct>60?'#50c870':pct>30?'#f0c040':'#f04030';
 const cPct=o.cooking?_mn(100,(o.cookProgress/o.dish.cookTime)*100):0;
 const status=o.done?'done':o.cooking?'cooking':o.angry?'angry':'idle';

 let card=existing[o.seq];
 if(!card){
 // Create new card
 card=_ce('div');
 card.dataset.seq=o.seq;
 card.innerHTML=`
 <div class="ck2-order-top">
 <div class="ck2-order-emoji">${o.dish.emoji}${o.isCritic?'⭐':''}</div>
 <div class="ck2-order-info">
 <div class="ck2-order-name">${o.dish.name}${o.isCritic?' <span style="color:#f0c040;font-size:9px;">CRITIC</span>':''}</div>
 <div class="ck2-order-price" data-price></div>
 <div class="ck2-order-customer">${o.customer}</div>
 </div>
 </div>
 <div class="ck2-patience-bar"><div class="ck2-patience-fill" data-patience></div></div>
 <div class="ck2-cook-bar" data-cookbar style="display:none"><div class="ck2-cook-fill" data-cookfill></div></div>
 <div class="ck2-order-btns" data-btns></div>
 `;
 el.appendChild(card);
 }

 // Update class
 card.className='ck2-order '+status;

 // Update patience bar
 const pFill=card.querySelector('[data-patience]');
 if(pFill){pFill.style.width=pct+'%';pFill.style.background=pColor;}

 // Update cook bar
 const cookBar=card.querySelector('[data-cookbar]');
 const cookFill=card.querySelector('[data-cookfill]');
 if(cookBar){cookBar.style.display=o.cooking?'block':'none';}
 if(cookFill)cookFill.style.width=cPct+'%';

 // Update price/tip
 const priceEl=card.querySelector('[data-price]');
 if(priceEl)priceEl.innerHTML=`${o.dish.price+o.tip}🦆${o.tip>0?` <span style="color:#50c870;">(+${o.tip} tip)</span>`:''}`;

 // Update buttons (only if state changed)
 const btnsEl=card.querySelector('[data-btns]');
 if(btnsEl){
 const wantCook=!o.cooking&&!o.done&&!o.angry;
 const wantServe=o.done;
 const wantAngry=o.angry;
 const hasCook=!!btnsEl.querySelector('[data-cook]');
 const hasServe=!!btnsEl.querySelector('[data-serve]');
 const hasAngry=!!btnsEl.querySelector('[data-angry]');
 if(wantCook!==hasCook||wantServe!==hasServe||wantAngry!==hasAngry){
 btnsEl.innerHTML='';
 if(wantCook){
 const b=_ce('button');b.className='ck2-btn ck2-btn-cook';b.textContent='🔥 Cook';b.dataset.cook=o.seq;
 btnsEl.appendChild(b);
 }
 if(wantServe){
 const b=_ce('button');b.className='ck2-btn ck2-btn-serve';b.textContent='✅ Serve';b.dataset.serve=o.seq;
 btnsEl.appendChild(b);
 }
 if(wantAngry){
 const b=_ce('button');b.className='ck2-btn ck2-btn-disabled';b.textContent='😤 Left';b.disabled=true;b.dataset.angry='1';
 btnsEl.appendChild(b);
 }
 }
 }
 });

 // Remove cards for gone orders
 for(const c of Array.from(el.children)){
 if(!seenSeqs.has(c.dataset.seq))c.remove();
 }
 }

 // ── Event delegation on orders container ─────────────────────
 function initOrderDelegation(){
 const el=$('ck2-orders');if(!el)return;
 el.addEventListener('click',e=>{
 const cookBtn=e.target.closest('[data-cook]');
 if(cookBtn){startCooking(parseInt(cookBtn.dataset.cook));return;}
 const serveBtn=e.target.closest('[data-serve]');
 if(serveBtn){
 const rect=serveBtn.getBoundingClientRect();
 serveOrder(parseInt(serveBtn.dataset.serve),rect.left,rect.top);
 }
 });
 }

 function startCooking(seq){
 const o=orders.find(x=>x.seq===seq);
 if(!o||o.cooking||o.done||o.angry)return;
 if(fireActive){log('🔥 Kitchen on fire! Cannot cook right now!');return;}
 o.cooking=true;
 renderOrders();
 }
 function serveOrder(seq,x,y){
 const o=orders.find(x=>x.seq===seq);
 if(!o||!o.done)return;
 const earned=o.dish.price+o.tip;
 changeDB(earned,x,y);
 S.totalEarned+=earned;S.totalServed++;
 if(o.patience/o.maxPatience>0.6)changeRep(0.05);
 if(o.isCritic){changeRep(0.5);changeDB(20,x,y);log('⭐ Critic loved it! +0.5⭐ +20🦆');}
 orders=orders.filter(x=>x.seq!==seq);
 renderOrders();
 }

 // ── Kitchen ───────────────────────────────────────────────────
 function renderKitchen(){
 const el=$('ck2-kitchen');if(!el)return;
 if(!S.staff.length){
 el.innerHTML='<div style="padding:16px;text-align:center;font-size:11px;color:rgba(240,200,150,.3);font-weight:700;line-height:1.8;">No staff hired yet.<br>Cook orders manually or<br>hire staff from the Staff tab.</div>';
 return;
 }
 // Diff-update staff slots
 const needed=S.staff.length;
 while(el.children.length<needed){const s=_ce('div');s.className='ck2-staff-slot';el.appendChild(s);}
 while(el.children.length>needed)el.removeChild(el.lastChild);
 S.staff.forEach((sid,i)=>{
 const def=STAFF_DEFS.find(s=>s.id===sid);if(!def)return;
 const slot=el.children[i];
 const assigned=orders.find(o=>o._staffIdx===i&&(o.cooking||o.done));
 let task='Waiting for orders...';
 let barPct=0;
 if(assigned&&assigned.cooking){task='Cooking: '+assigned.dish.name;barPct=(assigned.cookProgress/assigned.dish.cookTime)*100;}
 else if(assigned&&assigned.done){task='Ready: '+assigned.dish.name;barPct=100;}
 else if(def.id==='waiter'){task='Auto-serving completed orders';}
 else if(def.id==='manager'){task='Keeping customers calm 😊';}
 else if(def.id==='cleaner'){task=orders.filter(o=>o.angry).length?'Clearing angry customers 🧹':'Keeping floor clean';}
 slot.innerHTML=`
 <div class="ck2-staff-emoji">${def.emoji}</div>
 <div class="ck2-staff-info">
 <div class="ck2-staff-name">${def.name}</div>
 <div class="ck2-staff-task">${task}</div>
 ${def.type==='chef'?`<div class="ck2-staff-bar"><div class="ck2-staff-bar-fill" style="width:${_mn(100,barPct)}%;"></div></div>`:''}
 </div>
 `;
 });
 }

 // ── Events ────────────────────────────────────────────────────
 function triggerEvent(){
 if(activeEvent)return;
 const pool=['robbery','inspector','rush','fire','critic','rainy'];
 const id=rndPick(pool);
 const def=EVENTS.find(e=>e.id===id);if(!def)return;
 activeEvent=id;
 startFloatEmojis(def.floatEmoji);
 showEventModal(def);
 }
 function showEventModal(def){
 const existing=$('ck2-event');if(existing)existing.remove();
 const ev=_ce('div');ev.id='ck2-event';
 ev.innerHTML=`
 <div id="ck2-event-icon">${def.icon}</div>
 <div id="ck2-event-title">${def.title}</div>
 <div id="ck2-event-desc">${def.desc}</div>
 <div class="ck2-event-btns">
 ${def.choices.map((c,i)=>`<button class="ck2-event-btn ${i===0?'ck2-event-btn-primary':'ck2-event-btn-secondary'}" data-fn="${c.fn}">${c.label}</button>`).join('')}
 </div>
 `;
 _cookEl.appendChild(ev);
 ev.querySelectorAll('[data-fn]').forEach(btn=>{
 btn.addEventListener('click',()=>{
 resolveEvent(btn.dataset.fn);
 ev.remove();activeEvent=null;eventCooldown=50;
 stopFloatEmojis();
 });
 });
 }
 function resolveEvent(fn){
 if(fn==='robbery_pay'){const loss=_mx(10,_mf(S.db*0.2));changeDB(-loss);log('🦊 Paid the fox '+loss+'🦆 to leave');}
 else if(fn==='robbery_fight'){if(_mr()<0.5){log('🥊 You fought off the fox!');changeRep(0.1);}else{const loss=_mx(10,_mf(S.db*0.3));changeDB(-loss);log('😢 Fox won... lost '+loss+'🦆');}}
 else if(fn==='inspector'){if(S.rep>=3){changeDB(20);log('🐀 Inspector impressed! +20🦆');}else{changeDB(-30);log('🐀 Fined 30🦆 for poor hygiene!');}}
 else if(fn==='rush'){rushActive=true;rushTimer=30;log('🦆 Duck Rush! Double orders for 30s!');}
 else if(fn==='fire'){if(S.staff.includes('head')){log('🧯 Head Chef put out the fire instantly!');}else{fireActive=true;fireTimer=20;log('🔥 Kitchen on fire for 20s!');}}
 else if(fn==='critic'){criticPending=true;log('⭐ The critic is here — serve them quickly!');}
 else if(fn==='rainy'){rainyActive=true;rainyTimer=90;log('🌧️ Rainy day — better tips for 90s!');}
 }

 // ── Day end ───────────────────────────────────────────────────
 function endDay(){
 dayRunning=false;
 stopFloatEmojis();
 orders=[];renderOrders();
 const wages=S.staff.reduce((t,sid)=>{const d=STAFF_DEFS.find(s=>s.id===sid);return t+(d?d.wage:0);},0);
 changeDB(-wages);
 if(S.db>S.bestDay)S.bestDay=S.db;
 saveGame();showDaySummary(wages);
 }
 function showDaySummary(wages){
 const ov=_ce('div');ov.id='ck2-overlay';
 ov.innerHTML=`
 <div class="ck2-ov-icon">🌙</div>
 <div class="ck2-ov-title">Day ${S.day} Done!</div>
 <div class="ck2-ov-card">
 <div class="ck2-ov-row">Orders Served <span>${S.totalServed}</span></div>
 <div class="ck2-ov-row">Staff Wages <span>−${wages}🦆</span></div>
 <div class="ck2-ov-row">Reputation <span>${S.rep.toFixed(1)}⭐</span></div>
 <div class="ck2-ov-row">Balance <span>${S.db}🦆</span></div>
 </div>
 <button class="ck2-big-btn ck2-btn-orange" id="ck2-next-day">Next Day ☀️</button>
 `;
 _cookEl.appendChild(ov);
 $('ck2-next-day').addEventListener('click',()=>{
 ov.remove();S.day++;S.totalServed=0;
 dayTimer=180;dayRunning=true;lastTs=0;spawnAcc=0;eventCooldown=30;
 rushActive=false;rushTimer=0;rainyActive=false;rainyTimer=0;fireActive=false;fireTimer=0;criticPending=false;activeEvent=null;
 updateHUD();
 });
 }

 // ── Game loop ─────────────────────────────────────────────────
 function gameLoop(ts){
 if(!window._cookingActive)return;
 _cookEl._raf=_raf(gameLoop);
 if(!dayRunning){lastTs=ts;return;}
 if(!lastTs){lastTs=ts;return;}
 const raw=(ts-lastTs)/1000;lastTs=ts;
 const dt=_mn(raw,0.15)*gameSpeed;

 // Day timer
 dayTimer-=dt;
 if(dayTimer<=0){dayTimer=0;endDay();return;}
 const mins=_mf(dayTimer/60),secs=_mf(dayTimer%60);
 const timerEl=$('ck2-timer');
 if(timerEl){timerEl.textContent=mins+':'+(secs<10?'0':'')+secs;timerEl.className=dayTimer<30?'danger':'';}

 // Event cooldown + trigger
 if(eventCooldown>0)eventCooldown-=dt;
 else if(!activeEvent&&_mr()<0.003*dt*60)triggerEvent();

 // Timed states
 if(rushActive){rushTimer-=dt;if(rushTimer<=0){rushActive=false;log('🦆 Duck Rush over!');}}
 if(rainyActive){rainyTimer-=dt;if(rainyTimer<=0){rainyActive=false;}}
 if(fireActive){fireTimer-=dt;if(fireTimer<=0){fireActive=false;log('🔥 Fire out!');}}

 // Spawn orders — ramps from ~14s apart at day start to ~5s at day end
 const _dayRamp=_mn(1,(180-dayTimer)/180);
 const spawnRate=(0.071+_dayRamp*0.129)*(1+(S.rep-3)*0.08)*(rushActive?3:1)*dt;
 spawnAcc+=spawnRate;
 while(spawnAcc>=1){spawnAcc-=1;spawnOrder();}

 // Staff auto-cook
 S.staff.forEach((sid,i)=>{
 const def=STAFF_DEFS.find(s=>s.id===sid);
 if(!def||def.type!=='chef')return;
 const mine=orders.filter(o=>(o.cooking||o.done)&&o._staffIdx===i);
 const cooking=mine.filter(o=>o.cooking&&!o.done);
 if(mine.filter(o=>!o.done).length<def.slots){
 const next=orders.find(o=>!o.cooking&&!o.done&&!o.angry&&o.dish.tier<=def.maxTier&&o._staffIdx==null);
 if(next){next.cooking=true;next._staffIdx=i;}
 }
 cooking.forEach(o=>{
 if(fireActive)return;
 o.cookProgress+=def.speed*dt;
 if(o.cookProgress>=o.dish.cookTime){o.cookProgress=o.dish.cookTime;o.cooking=false;o.done=true;}
 });
 });

 // Manual cook progress
 orders.filter(o=>o.cooking&&!o.done&&o._staffIdx==null).forEach(o=>{
 if(fireActive)return;
 o.cookProgress+=dt;
 if(o.cookProgress>=o.dish.cookTime){o.cookProgress=o.dish.cookTime;o.cooking=false;o.done=true;}
 });

 // Patience decay
 orders.filter(o=>!o.done&&!o.angry).forEach(o=>{
 o.patience-=dt;
 if(o.patience<=0){
 o.patience=0;o.angry=true;o.cooking=false;
 changeRep(-0.1);
 log('😤 '+o.customer+' left angry!');
 }
 });

 // Cleaner: auto-remove angry orders
 if(S.staff.includes('cleaner')){
 orders=orders.filter(o=>!o.angry);
 } else {
 // Remove very stale angry orders after a delay
 orders=orders.filter(o=>!(o.angry&&o.patience<-8));
 }

 // Auto-serve (waiter)
 if(S.staff.includes('waiter')){
 orders.filter(o=>o.done).forEach(o=>{
 const earned=o.dish.price+o.tip;
 changeDB(earned);S.totalEarned+=earned;S.totalServed++;
 if(o.isCritic){changeRep(0.5);log('⭐ Critic loved it!');}
 });
 orders=orders.filter(o=>!o.done);
 }

 renderOrders();
 renderKitchen();
 }

 // ── Speed buttons ─────────────────────────────────────────────
 [1,2,3].forEach(n=>{
 const btn=$('ck2-s'+n);
 if(btn)btn.addEventListener('click',()=>{
 gameSpeed=n;
 [1,2,3].forEach(m=>{const b=$('ck2-s'+m);if(b)b.className='ck2-speed-btn'+(m===n?' active':'');});
 });
 });
 $('ck2-menu-btn').addEventListener('click',()=>window._exitCooking());
 // Dock collapse toggle
 let _dockCollapsed=false;
 const _dockEl=_cookEl.querySelector('#ck2-dock');
 const _dockToggle=_cookEl.querySelector('#ck2-dock-toggle');
 if(_dockToggle){
 const _doToggle=e=>{e.preventDefault();e.stopPropagation();
  _dockCollapsed=!_dockCollapsed;
  if(_dockEl)_dockEl.classList.toggle('collapsed',_dockCollapsed);
  _dockToggle.textContent=_dockCollapsed?'▼ Shop & Staff':'▲ Shop & Staff';
 };
 _dockToggle.addEventListener('touchstart',_doToggle,{passive:false});
 _dockToggle.addEventListener('click',_doToggle);
}
 // Tab switching via delegation — reliable on iOS
 const _ck2TabsEl=_cookEl.querySelector('#ck2-tabs');
 if(_ck2TabsEl){
 const _switchTab=tab=>{
 if(!tab||!tab.dataset||!tab.dataset.tab)return;
 activeTab=tab.dataset.tab;
 _cookEl.querySelectorAll('.ck2-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===activeTab));
 renderPanel(true);
 };
 _ck2TabsEl.addEventListener('click',e=>_switchTab(e.target.closest('.ck2-tab')));
 _ck2TabsEl.addEventListener('touchend',e=>{
 e.preventDefault();
 _switchTab(e.changedTouches[0]&&document.elementFromPoint(e.changedTouches[0].clientX,e.changedTouches[0].clientY));
 },{passive:false});
 }

 // ── Name screen ───────────────────────────────────────────────
 function showNameScreen(){
 const ns=_ce('div');ns.id='ck2-name-screen';
 ns.innerHTML=`
 <div style="font-size:56px;">🍳</div>
 <h2>Name Your Restaurant</h2>
 <p>What shall we call this fine establishment?</p>
 <input id="ck2-name-input" type="text" maxlength="28" placeholder="The Quack Shack" value="${S.name}" style="user-select:text;-webkit-user-select:text;touch-action:auto;">
 <button class="ck2-big-btn ck2-btn-orange" id="ck2-name-btn">Open for Business! 🦆</button>
 `;
 _cookEl.appendChild(ns);
 const inp=$('ck2-name-input');
if(inp){inp.style.userSelect='text';inp.style.webkitUserSelect='text';
setTimeout(()=>{try{inp.focus();}catch(e){}},100);}
 $('ck2-name-btn').addEventListener('click',()=>{
 S.name=inp.value.trim()||'The Quack Shack';
 const nameEl=$('ck2-name');if(nameEl)nameEl.textContent=S.name;
 saveGame();ns.remove();startDay();
 });
 inp.addEventListener('keydown',e=>{if(e.key==='Enter')$('ck2-name-btn').click();});
 setTimeout(()=>inp.focus(),100);
 }
 function startDay(){
 dayRunning=true;eventCooldown=30;
 renderPanel();updateHUD();
 initOrderDelegation();
 _cookEl._raf=_raf(gameLoop);
 }

 const isFirstTime=true;
 renderPanel();updateHUD();
 if(isFirstTime)showNameScreen();
 else{initOrderDelegation();startDay();}
}
})();

})();

(()=>{
let _dungEl=null;
window._launchDungeon=function(){
 window.paused=true;
 if(window._menuEl)window._menuEl.style.display='none';
 if(window._homeBtn)window._homeBtn.style.display='';
 window._dungeonActive=true;
 if(_dungEl){_dungEl.remove();_dungEl=null;}
 _buildDungeon();
};
window._exitDungeon=function(){
 window._dungeonActive=false;
 window.paused=false;
 if(_dungEl){_dungEl.remove();_dungEl=null;}
 if(window._menuEl)window._menuEl.style.display='flex';
 if(window._randomiseFeatured)window._randomiseFeatured();
 if(window._homeBtn)window._homeBtn.style.display='none';
};

function _buildDungeon(){
if(!_gi('dd-style')){
const st=_ce('style');st.id='dd-style';
st.textContent=`
@import url('https://fonts.googleapis.com/css2?family=MedievalSharp&family=Nunito:wght@600;700;800;900&display=swap');
#dd{position:fixed;inset:0;z-index:1000085;background:#0a0608;display:flex;flex-direction:column;font-family:'Nunito',sans-serif;color:#e8d4a0;overflow:hidden;user-select:none;}
#dd-hdr{display:flex;align-items:center;gap:4px;padding:0 8px;height:46px;flex-shrink:0;background:linear-gradient(180deg,#120a0e,#0e0810);border-bottom:2px solid #3a1a2a;overflow-x:auto;scrollbar-width:none;}
#dd-title{font-family:'MedievalSharp',serif;font-size:16px;color:#c8a060;flex:1;letter-spacing:.04em;}
#dd-floor-info{font-size:10px;font-weight:900;color:rgba(200,160,100,.6);letter-spacing:.1em;text-transform:uppercase;}
#dd-gold{display:flex;align-items:center;gap:3px;font-size:12px;font-weight:900;color:#f0c040;}
#dd-menu-btn{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.4);font-size:11px;font-weight:900;padding:4px 10px;border-radius:8px;cursor:pointer;font-family:'Nunito',sans-serif;}
#dd-hp-row{display:flex;align-items:center;gap:8px;padding:5px 10px 4px;flex-shrink:0;background:#0a0608;border-bottom:1px solid #2a1020;}
#dd-hp-label{font-size:10px;font-weight:900;color:rgba(200,160,100,.5);width:22px;text-align:right;}
#dd-hp-bar{flex:1;height:10px;background:rgba(0,0,0,.5);border-radius:5px;overflow:hidden;border:1px solid rgba(255,255,255,.06);}
#dd-hp-fill{height:100%;background:linear-gradient(90deg,#c83030,#e85050);border-radius:5px;transition:width .3s;}
#dd-hp-fill.high{background:linear-gradient(90deg,#30a050,#50c870);}
#dd-hp-fill.med{background:linear-gradient(90deg,#c08020,#e0a030);}
#dd-hp-text{font-size:10px;font-weight:900;color:rgba(200,160,100,.7);min-width:52px;text-align:right;}
#dd-stats-row{display:flex;align-items:center;gap:5px;padding:3px 10px 4px;flex-shrink:0;background:#0a0608;border-bottom:1px solid #1a0a14;flex-wrap:wrap;}
.dd-stat{display:flex;align-items:center;gap:3px;background:rgba(0,0,0,.35);border:1px solid rgba(255,200,100,.12);border-radius:8px;padding:2px 8px;font-size:10px;font-weight:800;}
.dd-stat-val{color:#f0c040;font-weight:900;}
#dd-upg-row{display:flex;align-items:center;gap:4px;padding:2px 10px 3px;flex-shrink:0;background:#0a0608;border-bottom:1px solid #1a0a14;min-height:22px;flex-wrap:wrap;}
.dd-upg-chip{font-size:13px;line-height:1;cursor:default;position:relative;}
.dd-upg-chip.common{opacity:.9;}
.dd-upg-chip.rare{filter:drop-shadow(0 0 4px #4080ff);}
.dd-upg-chip.epic{filter:drop-shadow(0 0 5px #c060f0);}
.dd-upg-chip.legendary{filter:drop-shadow(0 0 7px #f0c040) drop-shadow(0 0 12px rgba(240,180,60,.4));}
#dd-arena{flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(ellipse at 50% 60%,#1a0c18,#0a0608);}
#dd-grid{display:grid;position:relative;}
.dd-cell{display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;position:relative;transition:background .1s;cursor:default;}
.dd-cell.floor{background:rgba(255,255,255,.025);}
.dd-cell.floor:nth-child(even){background:rgba(255,255,255,.018);}
.dd-cell.wall{background:#1e0e1a;border:1px solid #2a1020;}
.dd-cell.door-locked{background:#1a0a18;}
.dd-cell.door-open{background:#2a1a08;}
.dd-cell.player{background:rgba(80,200,255,.08);box-shadow:inset 0 0 8px rgba(80,200,255,.15);}
.dd-cell.enemy-cell{background:rgba(200,50,50,.06);}
.dd-cell.item-cell{background:rgba(80,200,80,.04);}
.dd-cell.walkable{background:rgba(120,200,120,.12) !important;cursor:pointer;outline:1px solid rgba(100,200,100,.3);}
.dd-cell.walkable:hover{background:rgba(120,200,120,.22) !important;}
.dd-cell.attackable{background:rgba(220,60,60,.18) !important;cursor:pointer;outline:1px solid rgba(220,60,60,.4);}
.dd-cell.attackable:hover{background:rgba(220,60,60,.28) !important;}
.dd-cell.enemy-move-arrow{position:absolute;font-size:11px;pointer-events:none;opacity:.65;z-index:4;}
.dd-dmg-pop{position:absolute;font-size:13px;font-weight:900;pointer-events:none;z-index:10;animation:ddPop .7s ease-out forwards;white-space:nowrap;}
@keyframes ddPop{0%{transform:translate(-50%,-50%) scale(1);opacity:1}100%{transform:translate(-50%,-130%) scale(.8);opacity:0}}
#dd-msg{position:absolute;top:46%;left:50%;transform:translate(-50%,-50%);font-family:'MedievalSharp',serif;font-size:17px;color:#f0c040;text-shadow:0 0 20px rgba(240,180,60,.8);pointer-events:none;z-index:20;opacity:0;text-align:center;transition:opacity .3s;white-space:nowrap;}
#dd-overlay{position:absolute;inset:0;background:rgba(5,2,8,.93);backdrop-filter:blur(10px);z-index:30;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px;}
.dd-ov-icon{font-size:60px;}
.dd-ov-title{font-family:'MedievalSharp',serif;font-size:26px;color:#c8a060;text-align:center;letter-spacing:.04em;}
.dd-ov-sub{font-size:12px;color:rgba(200,160,100,.55);font-weight:700;text-align:center;max-width:260px;line-height:1.7;}
.dd-ov-card{background:rgba(0,0,0,.45);border:1px solid rgba(200,140,60,.25);border-radius:14px;padding:14px 24px;min-width:210px;}
.dd-ov-row{display:flex;justify-content:space-between;gap:20px;font-size:12px;color:rgba(200,160,100,.45);padding:3px 0;font-weight:700;}
.dd-ov-row span{color:#f0c040;font-weight:900;}
.dd-big-btn{padding:12px 36px;border-radius:12px;border:none;font-size:13px;font-weight:900;cursor:pointer;font-family:'Nunito',sans-serif;touch-action:manipulation;transition:filter .1s,transform .08s;}
.dd-big-btn:hover{filter:brightness(1.15);}
.dd-big-btn:active{transform:scale(.95);}
.dd-btn-gold{background:linear-gradient(135deg,#6a3808,#b06010);color:#f0e0b0;}
.dd-btn-red{background:linear-gradient(135deg,#6a0808,#a02010);color:#f0d0d0;}
#dd-upgrade-screen{position:absolute;inset:0;background:rgba(5,2,8,.96);backdrop-filter:blur(12px);z-index:30;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px;overflow-y:auto;}
#dd-upgrade-screen h2{font-family:'MedievalSharp',serif;font-size:20px;color:#c8a060;text-align:center;}
#dd-upgrade-screen p{font-size:11px;color:rgba(200,160,100,.5);font-weight:700;text-align:center;margin-bottom:4px;}
.dd-upg-cards-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;width:100%;}
.dd-upg-card{background:linear-gradient(180deg,#1e1020,#140c1a);border:2px solid rgba(200,140,60,.3);border-radius:14px;padding:13px 14px;width:min(180px,80vw);cursor:pointer;transition:border-color .15s,transform .1s,box-shadow .15s;touch-action:manipulation;flex-shrink:0;}
.dd-upg-card:hover{border-color:#c8a060;transform:translateY(-3px);box-shadow:0 8px 24px rgba(200,140,60,.2);}
.dd-upg-card:active{transform:scale(.97);}
.dd-upg-card.rarity-rare{border-color:rgba(64,128,255,.5);}
.dd-upg-card.rarity-rare:hover{border-color:#4080ff;box-shadow:0 8px 24px rgba(64,128,255,.25);}
.dd-upg-card.rarity-epic{border-color:rgba(192,96,240,.5);}
.dd-upg-card.rarity-epic:hover{border-color:#c060f0;box-shadow:0 8px 24px rgba(192,96,240,.3);}
.dd-upg-card.rarity-legendary{border-color:rgba(240,192,64,.7);background:linear-gradient(180deg,#281a08,#1a0c04);}
.dd-upg-card.rarity-legendary:hover{border-color:#f0c040;box-shadow:0 8px 32px rgba(240,192,64,.4);}
.dd-upg-card-icon{font-size:30px;margin-bottom:5px;text-align:center;}
.dd-upg-card-name{font-size:12px;font-weight:900;color:#f0e0b0;text-align:center;margin-bottom:3px;}
.dd-upg-card-rarity{font-size:8px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;text-align:center;margin-bottom:4px;}
.dd-upg-card-rarity.common{color:rgba(200,180,140,.5);}
.dd-upg-card-rarity.rare{color:#4080ff;}
.dd-upg-card-rarity.epic{color:#c060f0;}
.dd-upg-card-rarity.legendary{color:#f0c040;}
.dd-upg-card-desc{font-size:10px;color:rgba(200,160,100,.6);text-align:center;line-height:1.55;}
.dd-upg-card-type{font-size:8px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;text-align:center;margin-top:5px;opacity:.55;}
.dd-upg-card-type.atk{color:#f06040;}
.dd-upg-card-type.def{color:#4080f0;}
.dd-upg-card-type.hp{color:#50e870;}
.dd-upg-card-type.special{color:#c060f0;}
@media(min-width:600px){
 .dd-cell{font-size:26px;}
 #dd-hdr{height:52px;}
 #dd-title{font-size:18px;}
 .dd-upg-card{width:min(200px,80vw);padding:15px 16px;}
 .dd-upg-card-icon{font-size:34px;}
 .dd-upg-card-name{font-size:13px;}
 .dd-upg-card-desc{font-size:11px;}
}
#dd-shop{position:absolute;inset:0;background:rgba(5,2,8,.95);backdrop-filter:blur(10px);z-index:30;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px;overflow-y:auto;}
#dd-shop h2{font-family:'MedievalSharp',serif;font-size:20px;color:#c8a060;text-align:center;}
#dd-shop p{font-size:11px;color:rgba(200,160,100,.5);font-weight:700;text-align:center;}
.dd-shop-grid{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;width:100%;}
.dd-shop-item{background:linear-gradient(180deg,#1e1020,#140c1a);border:2px solid rgba(200,140,60,.3);border-radius:14px;padding:12px 14px;width:min(160px,42vw);cursor:pointer;transition:border-color .15s,transform .1s,box-shadow .15s;touch-action:manipulation;text-align:center;}
.dd-shop-item:hover{border-color:#c8a060;transform:translateY(-2px);box-shadow:0 6px 20px rgba(200,140,60,.2);}
.dd-shop-item:active{transform:scale(.97);}
.dd-shop-item.cant-afford{opacity:.4;cursor:default;}
.dd-shop-item.cant-afford:hover{transform:none;box-shadow:none;border-color:rgba(200,140,60,.3);}
.dd-shop-icon{font-size:28px;margin-bottom:5px;}
.dd-shop-name{font-size:12px;font-weight:900;color:#f0e0b0;margin-bottom:3px;}
.dd-shop-desc{font-size:10px;color:rgba(200,160,100,.6);line-height:1.5;margin-bottom:6px;}
.dd-shop-cost{font-size:13px;font-weight:900;color:#f0c040;}
.dd-shop-leave{padding:10px 32px;border-radius:12px;border:none;font-size:12px;font-weight:900;cursor:pointer;font-family:'Nunito',sans-serif;background:rgba(255,255,255,.07);color:rgba(200,160,100,.7);touch-action:manipulation;margin-top:4px;}
.dd-shop-leave:hover{background:rgba(255,255,255,.12);color:#f0e0b0;}
`;
document.head.appendChild(st);
}

// ── Data ─────────────────────────────────────────────────
// Rarities: common (55%), rare (30%), epic (12%), legendary (3%)
// Weights: common=55, rare=30, epic=12, legendary=3
const UPGRADES=[
// ── COMMON ─────────────────────────────────────────────
{id:'sharp_beak', e:'⚔️',name:'Sharp Beak', desc:'+3 ATK.', type:'atk',rarity:'common',apply:p=>{p.atk+=3;}},
{id:'iron_vest', e:'🛡️',name:'Iron Vest', desc:'+4 DEF.', type:'def',rarity:'common',apply:p=>{p.def+=4;}},
{id:'duck_hardy', e:'❤️',name:'Duck Hardy', desc:'+10 max HP and healed.', type:'hp', rarity:'common',apply:p=>{p.maxHp+=10;p.hp=_mn(p.hp+10,p.maxHp);}},
{id:'potion_bag', e:'🧪',name:'Potion Bag', desc:'Potions now heal +8 instead of +5.', type:'hp', rarity:'common',apply:p=>{p.potionBoost=true;}},
{id:'sturdy_boots',e:'🥾',name:'Sturdy Boots', desc:'+2 DEF. You feel grounded.', type:'def',rarity:'common',apply:p=>{p.def+=2;}},
{id:'quick_slash', e:'🗡️',name:'Quick Slash', desc:'+2 ATK. Fast strikes.', type:'atk',rarity:'common',apply:p=>{p.atk+=2;}},
{id:'regen', e:'🌿',name:'Regeneration', desc:'Heal 1 HP every 3 turns.', type:'def',rarity:'common',apply:p=>{p.regen=true;}},
{id:'lifesteal', e:'🩸',name:'Lifesteal', desc:'Attacks heal you for 1 HP.', type:'hp', rarity:'common',apply:p=>{p.lifesteal=true;}},
{id:'magnet', e:'🧲',name:'Magnet', desc:'Auto-collect items within 2 tiles.', type:'def',rarity:'common',apply:p=>{p.magnet=true;}},
{id:'gold_nose', e:'👃',name:'Gold Nose', desc:'Enemies drop +3 gold when slain.', type:'hp', rarity:'common',apply:p=>{p.goldNose=true;}},
// ── RARE ────────────────────────────────────────────────
{id:'fire_feathers',e:'🔥',name:'Fire Feathers', desc:'Attacks burn enemies (+1 dmg next turn).', type:'atk',rarity:'rare',apply:p=>{p.burn=true;}},
{id:'eagle_eye', e:'🎯',name:'Eagle Eye', desc:'+40% crit chance. Crits deal 2× damage.', type:'atk',rarity:'rare',apply:p=>{p.critChance=(p.critChance||0)+40;}},
{id:'feather_shot',e:'🏹',name:'Feather Shot', desc:'Attack enemies 2 tiles away.', type:'atk',rarity:'rare',apply:p=>{p.range=2;}},
{id:'reflect', e:'🔄',name:'Reflect', desc:'30% chance to reflect 1 damage back.', type:'def',rarity:'rare',apply:p=>{p.reflect=true;}},
{id:'dodge', e:'💨',name:'Dodge Roll', desc:'20% chance to dodge any attack.', type:'def',rarity:'rare',apply:p=>{p.dodge=true;}},
{id:'tough', e:'🫀',name:'Tough Feathers', desc:'All damage reduced by 1 (min 1).', type:'hp', rarity:'rare',apply:p=>{p.tough=true;}},
{id:'mana_shield', e:'🔮',name:'Mana Shield', desc:'Once per floor, absorb a fatal hit.', type:'hp', rarity:'rare',apply:p=>{p.manaShield=true;}},
{id:'chill_aura', e:'🧊',name:'Chill Aura', desc:'Enemies move 1 tile less (min 1).', type:'def',rarity:'rare',apply:p=>{p.chill=true;}},
{id:'second_wind', e:'💨',name:'Second Wind', desc:'Once per room, auto-heal to 30% HP if you would die.', type:'hp',rarity:'rare',apply:p=>{p.secondWind=true;p.secondWindUsed=false;}},
{id:'battle_cry', e:'📯',name:'Battle Cry', desc:'First attack in each room deals 2× damage.',type:'atk',rarity:'rare',apply:p=>{p.battleCry=true;}},
{id:'leech_blade', e:'🗡️',name:'Leech Blade', desc:'Heal 2 HP every time you kill an enemy.', type:'hp', rarity:'rare',apply:p=>{p.leechBlade=true;}},
{id:'poison_tip', e:'☠️',name:'Poison Tip', desc:'10% chance to poison (2 dmg/turn × 3).', type:'atk',rarity:'rare',apply:p=>{p.poison=true;}},
// ── EPIC ────────────────────────────────────────────────
{id:'lightning', e:'⚡',name:'Lightning Wing', desc:'25% chance to zap all adjacent enemies.', type:'atk',rarity:'epic',apply:p=>{p.lightning=true;}},
{id:'spin_atk', e:'💫',name:'Spin Attack', desc:'Attack hits all 4 adjacent tiles.', type:'atk',rarity:'epic',apply:p=>{p.spin=true;}},
{id:'time_warp', e:'🌀',name:'Time Warp', desc:'Extra free turn after killing an enemy.', type:'atk',rarity:'epic',apply:p=>{p.timeWarp=true;}},
{id:'dungeon_sense',e:'👁️',name:'Dungeon Sense', desc:'Reveals the whole room on entry.', type:'special',rarity:'epic',apply:p=>{p.sense=true;}},
{id:'mirror_shield',e:'🪞',name:'Mirror Shield', desc:'50% chance to reflect ALL damage back.', type:'def',rarity:'epic',apply:p=>{p.mirrorShield=true;}},
{id:'berserker', e:'😡',name:'Berserker', desc:'+1 ATK each time you take damage (max +8).',type:'atk',rarity:'epic',apply:p=>{p.berserker=true;p.berserkerStacks=0;}},
{id:'glass_cannon',e:'💎',name:'Glass Cannon', desc:'+8 ATK but -4 DEF.', type:'atk',rarity:'epic',apply:p=>{p.atk+=8;p.def=_mx(0,p.def-4);}},
{id:'phantom_step',e:'👻',name:'Phantom Step', desc:'Walk through walls (floor tiles only).', type:'special',rarity:'epic',apply:p=>{p.phantom=true;}},
{id:'true_quack', e:'🦆',name:'True Quack', desc:'+2 ATK, +2 DEF, +8 max HP.', type:'special',rarity:'epic',apply:p=>{p.atk+=2;p.def+=2;p.maxHp+=8;p.hp=_mn(p.hp+8,p.maxHp);}},
// ── LEGENDARY ───────────────────────────────────────────
{id:'divine_feather',e:'✨',name:'Divine Feather', desc:'+6 ATK, +6 DEF, +20 max HP, full heal.', type:'special',rarity:'legendary',apply:p=>{p.atk+=6;p.def+=6;p.maxHp+=20;p.hp=p.maxHp;}},
{id:'blood_pact', e:'🩷',name:'Blood Pact', desc:'Double ATK but max HP is halved.', type:'atk',rarity:'legendary',apply:p=>{p.atk*=2;p.maxHp=_mx(5,_mf(p.maxHp/2));p.hp=_mn(p.hp,p.maxHp);}},
{id:'undying', e:'💀',name:'Undying', desc:'Revive once with 10 HP when you die.', type:'hp', rarity:'legendary',apply:p=>{p.undying=true;p.undyingUsed=false;}},
{id:'kings_crown', e:'👑',name:"King's Crown", desc:'All upgrades you have gain +1 stack effect.', type:'special',rarity:'legendary',apply:p=>{p.atk+=p.upgrades.length;p.def+=_mf(p.upgrades.length/2);}},
{id:'storm_of_quacks',e:'🌪️',name:'Storm of Quacks',desc:'Every attack hits up to 3 random enemies.', type:'atk',rarity:'legendary',apply:p=>{p.stormQuacks=true;}},
];

const CURSES=[
 {id:'glass',   e:'💔',name:'Glass Bones',   desc:'You take +2 damage from all attacks.'},
 {id:'weakened',e:'⬇️',name:'Weakened',       desc:'Your ATK is reduced by 2 (minimum 1).'},
 {id:'no_regen',e:'🩸',name:'Bleeding',       desc:'No HP regen between rooms.'},
 {id:'costly',  e:'💸',name:'Tax Collector',  desc:'Shop prices are doubled.'},
 {id:'slow',    e:'🦥',name:'Heavy Legs',     desc:'You can only move every 2 turns.'},
 {id:'dbl_atk', e:'👁️',name:'Watching Eyes',  desc:'Enemies deal +3 damage.'},
];
const RARITY_WEIGHTS={common:55,rare:30,epic:12,legendary:3};
const RARITY_COLORS={common:'#c8c0a0',rare:'#4080ff',epic:'#c060f0',legendary:'#f0c040'};

const ENEMY_TYPES={
rat: {e:'🐀',name:'Rat', hp:4, atk:1,spd:1,xp:5},
lizard: {e:'🦎',name:'Lizard', hp:6, atk:2,spd:1,xp:8},
snake: {e:'🐍',name:'Snake', hp:8, atk:3,spd:1,xp:12},
bat: {e:'🦇',name:'Bat', hp:5, atk:2,spd:2,xp:10},
fox: {e:'🦊',name:'Fox', hp:12,atk:4,spd:1,xp:18},
spider: {e:'🕷️',name:'Spider', hp:6, atk:3,spd:1,range:2,xp:15},
wolf: {e:'🐺',name:'Wolf', hp:16,atk:5,spd:1,xp:25},
skeleton:{e:'💀',name:'Skeleton',hp:10,atk:4,spd:1,immune:true,xp:22},
bear: {e:'🐻',name:'Bear', hp:22,atk:6,spd:1,xp:35},
eye: {e:'👁️',name:'Eye', hp:8, atk:5,spd:1,teleport:true,xp:30},
};
const BOSS_TYPES={
croc:    {e:'🐊',name:'Croc',        hp:25, atk:5, spd:1,xp:80},
lion:    {e:'🦁',name:'Lion',         hp:40, atk:7, spd:1,xp:130},
zombie:  {e:'🧟',name:'Zombie King',  hp:55, atk:8, spd:1,xp:200,summon:true},
dragoon: {e:'🐉',name:'Dragon',       hp:80, atk:12,spd:1,xp:400,breath:true},
lich:    {e:'💀',name:'The Lich',     hp:180,atk:14,spd:1,xp:1200,mega:true},
kraken:  {e:'🐙',name:'Kraken',       hp:250,atk:12,spd:1,xp:1800,mega:true},
voidDuck:{e:'🌀',name:'Void Duck',    hp:350,atk:18,spd:1,xp:2800,mega:true},
};
const FLOOR_ENEMIES={
1:['rat','lizard'],2:['rat','lizard'],
3:['snake','bat'],4:['snake','bat'],
5:['fox','spider'],6:['fox','spider'],
7:['wolf','skeleton'],8:['wolf','skeleton'],
9:['bear','eye'],10:['bear','eye'],
};
function getEnemyPool(f){
 // Beyond floor 10, enemies get stat-scaled versions
 const base=FLOOR_ENEMIES[_mn(10,f)]||['bear','eye'];
 if(f<=10)return base.map(id=>ENEMY_TYPES[id]);
 const scale=1+_mf((f-10)/5)*0.25; // +25% every 5 floors after 10
 return base.map(id=>{
 const e=ENEMY_TYPES[id];
 return{...e,hp:_mf(e.hp*scale),atk:_mf(e.atk*scale),xp:_mf(e.xp*scale),
 name:(scale>1?'Elite ':'')+e.name};
 });
}
const GRID=9;

// ── State ─────────────────────────────────────────────────
let player={
 r:7,c:4,hp:20,maxHp:20,atk:3,def:0,gold:0,xp:0,score:0,kills:0,
 upgrades:[],
 burn:false,lightning:false,critChance:0,range:1,spin:false,
 reflect:false,mirrorShield:false,dodge:false,regen:false,magnet:false,
 lifesteal:false,tough:false,manaShield:false,manaShieldUsed:false,
 timeWarp:false,sense:false,phantom:false,chill:false,
 berserker:false,berserkerStacks:0,
 secondWind:false,secondWindUsed:false,
 undying:false,undyingUsed:false,
 battleCry:false,battleCrySaved:false,
 leechBlade:false,poison:false,goldNose:false,
 stormQuacks:false,potionBoost:false,
};
let grid=[],enemies=[],items=[];
let floor=1,room=1,turnCount=0,regenTimer=0;
let roomCleared=false,gameOver=false,inputBlocked=false;
let bestScore=0;
let activeCurses=[];

// ── Build DOM ─────────────────────────────────────────────
_dungEl=_ce('div');_dungEl.id='dd';
_dungEl.innerHTML=`
<div id="dd-hdr">
 <div id="dd-title">🗡️ Duck Dungeons</div>
 <div id="dd-floor-info">Floor <span id="dd-floor">1</span> · Room <span id="dd-room">1</span>/5 <span id="dd-room-type"></span></div>
 <span id="dd-curses" style="font-size:13px;letter-spacing:1px;"></span>
 <div id="dd-gold">🪙 <span id="dd-gold-val">0</span></div>
 <button id="dd-menu-btn">🏠</button>
</div>
<div id="dd-hp-row">
 <div id="dd-hp-label">❤️</div>
 <div id="dd-hp-bar"><div id="dd-hp-fill"></div></div>
 <div id="dd-hp-text"></div>
</div>
<div id="dd-stats-row">
 <div class="dd-stat">⚔️ <span id="dd-atk" class="dd-stat-val">3</span></div>
 <div class="dd-stat">🛡️ <span id="dd-def" class="dd-stat-val">0</span></div>
 <div class="dd-stat">🏆 <span id="dd-score" class="dd-stat-val">0</span></div>
</div>
<div id="dd-upg-row"></div>
<div id="dd-arena">
 <div id="dd-grid"></div>
 <div id="dd-msg"></div>
</div>
`;
_ba(_dungEl);
window._dungEl=_dungEl;

// ── Grid helpers ──────────────────────────────────────────
function mkGrid(){
 grid=[];
 for(let r=0;r<GRID;r++){grid[r]=[];for(let c=0;c<GRID;c++){grid[r][c]=(r===0||r===GRID-1||c===0||c===GRID-1)?'W':'.';}}
 grid[0][4]='D'; // locked door at top
}
function addWalls(isBoss){
 if(isBoss)return;
 for(let r=1;r<GRID-1;r++)for(let c=1;c<GRID-1;c++){
 if(r>=6&&c>=3&&c<=5)continue;
 if(r<=1&&c>=3&&c<=5)continue;
 if(_mr()<0.14)grid[r][c]='W';
 }
 for(let r=1;r<GRID-1;r++)if(grid[r][4]==='W')grid[r][4]='.';
}
function isBossRoom(){return room===5;}
function isShopRoom(){return room===3&&floor%2===0;}
function getBoss(){
 if(floor===20)return{...BOSS_TYPES.lich,maxHp:180};
 if(floor===30)return{...BOSS_TYPES.kraken,maxHp:250};
 if(floor>=40&&floor%10===0){
  const sc=1+_mf((floor-40)/10)*0.5;
  return{...BOSS_TYPES.voidDuck,hp:_mf(350*sc),maxHp:_mf(350*sc),atk:_mf(18*sc),xp:_mf(2800*sc)};
 }
 const cycle=_mf((floor-1)/8);
 const scale=1+cycle*0.4;
 const bosses=[BOSS_TYPES.croc,BOSS_TYPES.lion,BOSS_TYPES.zombie,BOSS_TYPES.dragoon];
 const pick=bosses[_mf(((floor-1)%8)/2)];
 return{...pick,hp:_mf(pick.hp*scale),maxHp:_mf(pick.hp*scale),atk:_mf(pick.atk*scale),xp:_mf(pick.xp*scale),
  name:cycle>0?pick.name+' '+(cycle===1?'II':cycle===2?'III':cycle===3?'IV':'V+'):pick.name};
}
function spawnEnemies(){
 enemies=[];
 if(isBossRoom()){
 const b=getBoss();
 enemies.push({...b,r:2,c:4,maxHp:b.hp,id:0,isBoss:true,burnTurns:0,poisonTurns:0,nextR:2,nextC:4});
 return;
 }
 const pool=getEnemyPool(floor);
 const count=2+_mf(_mr()*2)+_mf(_mn(floor,12)/2); // cap enemy count at floor 12
 for(let i=0;i<count;i++){
 const type=pool[_mf(_mr()*pool.length)];
 let r,c,t=0;
 do{r=1+_mf(_mr()*(GRID-2));c=1+_mf(_mr()*(GRID-2));t++;}
 while((grid[r][c]!=='.'||occupied(r,c)||(r>=6&&c>=3&&c<=5))&&t<40);
 if(t<40)enemies.push({...type,r,c,maxHp:type.hp,id:i+1,burnTurns:0,poisonTurns:0,nextR:r,nextC:c});
 }
}
function spawnItems(){
 items=[];
 if(isBossRoom())return;
 const types=[{e:'🪙',id:'gold'},{e:'❤️',id:'potion'},{e:'⚔️',id:'weapon'},{e:'🛡️',id:'shield'}];
 const count=1+_mf(_mr()*3);
 for(let i=0;i<count;i++){
 const type=types[_mf(_mr()*types.length)];
 let r,c,t=0;
 do{r=1+_mf(_mr()*(GRID-2));c=1+_mf(_mr()*(GRID-2));t++;}
 while((grid[r][c]!=='.'||occupied(r,c)||(r>=6&&c>=3&&c<=5))&&t<30);
 if(t<30)items.push({...type,r,c});
 }
}
function occupied(r,c){
 if(player.r===r&&player.c===c)return true;
 if(enemies.some(e=>e.r===r&&e.c===c))return true;
 if(items.some(i=>i.r===r&&i.c===c))return true;
 return false;
}

// ── Room setup ────────────────────────────────────────────
function setupRoom(){
 player.manaShieldUsed=false;
 player.secondWindUsed=false;
 player.battleCrySaved=player.battleCry;
 player.r=7;player.c=4;
 roomCleared=false;regenTimer=0;
 mkGrid();addWalls(isBossRoom());
 if(isShopRoom()){
 enemies=[];items=[];
 grid[0][4]='O'; // shop rooms open immediately
 updateHUD();renderGrid();
 showShop();
 return;
 }
 spawnEnemies();spawnItems();
 computeEnemyNextMoves();
 updateHUD();renderGrid();
 if(player.sense)flashMsg('👁️ Room revealed');
}

// ── Enemy next-move prediction ─────────────────────────────
function computeEnemyNextMoves(){
 enemies.forEach(e=>{
 if(e.hp<=0){e.nextR=e.r;e.nextC=e.c;return;}
 if(e.teleport){e.nextR=null;e.nextC=null;return;} // unpredictable
 if(e.range){// ranged enemies don't move if in range
 const dist=_mx(_ma(e.r-player.r),_ma(e.c-player.c));
 if(dist<=e.range){e.nextR=e.r;e.nextC=e.c;return;}
 }
 // predict first step toward player
 const dr=Math.sign(player.r-e.r),dc=Math.sign(player.c-e.c);
 const moves=[];
 if(dr!==0)moves.push([e.r+dr,e.c]);
 if(dc!==0)moves.push([e.r,e.c+dc]);
 if(dr!==0&&dc!==0)moves.push([e.r+dr,e.c+dc]);
 let moved=false;
 for(const[nr,nc]of moves){
 if(nr<0||nr>=GRID||nc<0||nc>=GRID)continue;
 if(grid[nr][nc]==='W'||grid[nr][nc]==='D')continue;
 if(enemies.some(o=>o!==e&&o.r===nr&&o.c===nc))continue;
 e.nextR=nr;e.nextC=nc;moved=true;break;
 }
 if(!moved){e.nextR=e.r;e.nextC=e.c;}
 });
}

// ── Rendering ─────────────────────────────────────────────
function calcTileSize(){
 const arena=_gi('dd-arena');if(!arena)return 40;
 const W=arena.clientWidth-8,H=arena.clientHeight-8;
 return _mf(_mn(W,H)/GRID);
}
function renderGrid(){
 const el=_gi('dd-grid');if(!el)return;
 const ts=calcTileSize();
 el.style.cssText=`display:grid;grid-template-columns:repeat(${GRID},${ts}px);width:${ts*GRID}px;height:${ts*GRID}px;`;
 el.innerHTML='';
 // Build walkable/attackable sets for highlighting
 const walkable=new Set(),attackable=new Set();
 const adj=[[player.r-1,player.c],[player.r+1,player.c],[player.r,player.c-1],[player.r,player.c+1]];
 adj.forEach(([r,c])=>{
 if(r<0||r>=GRID||c<0||c>=GRID)return;
 const g=grid[r][c];
 if(g==='W')return;
 if(player.phantom&&g==='W')return; // phantom steps even through walls
 const en=enemies.find(e=>e.r===r&&e.c===c);
 if(en)attackable.add(`${r}_${c}`);
 else if(g!=='W')walkable.add(`${r}_${c}`);
 });
 // Feather shot: 2-tile range attackable
 if(player.range===2){
 [[player.r-2,player.c],[player.r+2,player.c],[player.r,player.c-2],[player.r,player.c+2]].forEach(([r,c])=>{
 if(r<0||r>=GRID||c<0||c>=GRID)return;
 if(enemies.find(e=>e.r===r&&e.c===c))attackable.add(`${r}_${c}`);
 });
 }
 // Build enemy next-move arrow map
 const arrowMap={};
 enemies.forEach(e=>{
 if(e.nextR==null)return;
 if(e.nextR===e.r&&e.nextC===e.c)return; // standing still — no arrow
 const key=`${e.nextR}_${e.nextC}`;
 const dr=e.nextR-e.r,dc=e.nextC-e.c;
 const arrow=dr===-1?'⬆':dr===1?'⬇':dc===-1?'⬅':'➡';
 arrowMap[key]=(arrowMap[key]||'')+arrow;
 });

 for(let r=0;r<GRID;r++){
 for(let c=0;c<GRID;c++){
 const cell=_ce('div');
 cell.id=`dd-${r}-${c}`;
 cell.style.cssText=`width:${ts}px;height:${ts}px;font-size:${_mf(ts*0.56)}px;`;
 const g=grid[r][c];
 const key=`${r}_${c}`;
 const enemy=enemies.find(e=>e.r===r&&e.c===c);
 const item=items.find(i=>i.r===r&&i.c===c);
 const isPlayer=player.r===r&&player.c===c;
 let cls='dd-cell ';
 let content='';
 if(g==='W'){cls+='wall';content='░';}
 else if(g==='D'){cls+='door-locked';content='🚪';}
 else if(g==='O'){cls+='door-open';content='🚪';
 cell.addEventListener('click',()=>enterDoor());
 cell.style.cursor='pointer';
 } else if(isPlayer){cls+='floor player';content='🦆';}
 else if(enemy){
 cls+='floor enemy-cell';
 if(attackable.has(key))cls+=' attackable';
 content=enemy.e;
 cell.addEventListener('click',()=>clickCell(r,c));
 } else if(item){
 cls+='floor item-cell';
 if(walkable.has(key))cls+=' walkable';
 content=item.e;
 if(walkable.has(key))cell.addEventListener('click',()=>clickCell(r,c));
 } else{
 cls+='floor';
 if(walkable.has(key)){cls+=' walkable';cell.addEventListener('click',()=>clickCell(r,c));}
 }
 cell.className=cls;
 cell.textContent=content;
 // Enemy move arrow overlay
 if(arrowMap[key]&&!isPlayer&&!enemy){
 const arrow=_ce('div');
 arrow.style.cssText=`position:absolute;font-size:${_mf(ts*0.32)}px;pointer-events:none;opacity:.55;z-index:4;color:#f08040;`;
 arrow.textContent=arrowMap[key];
 cell.style.position='relative';
 cell.appendChild(arrow);
 }
 el.appendChild(cell);
 }
 }
}
function updateHUD(){
 const p=player;
 const pct=_mx(0,(p.hp/p.maxHp)*100);
 const fill=_gi('dd-hp-fill');
 if(fill){fill.style.width=pct+'%';fill.className='dd-hp-fill'+(pct>50?' high':pct>25?' med':'');}
 const ht=_gi('dd-hp-text');if(ht)ht.textContent=p.hp+'/'+p.maxHp;
 const atk=_gi('dd-atk');if(atk)atk.textContent=p.atk+(p.berserkerStacks>0?'+'+p.berserkerStacks:'');
 const def=_gi('dd-def');if(def)def.textContent=p.def;
 const sc=_gi('dd-score');if(sc)sc.textContent=p.score;
 const gv=_gi('dd-gold-val');if(gv)gv.textContent=p.gold;
 const fl=_gi('dd-floor');if(fl)fl.textContent=floor;
 const rm=_gi('dd-room');if(rm)rm.textContent=room;
 const rt=_gi('dd-room-type');
 if(rt)rt.textContent=isShopRoom()?'🏪':isBossRoom()?(floor>10?'💀':'👑'):'';
 // Show floor milestone every 10 floors
 const flEl=_gi('dd-floor');
 if(flEl&&floor>10)flEl.style.color=floor%10===0?'#f04040':'#f0c040';
 const cEl=_gi('dd-curses');
 if(cEl)cEl.textContent=activeCurses.map(c=>c.e).join('');
 const ur=_gi('dd-upg-row');
 if(ur)ur.innerHTML=p.upgrades.map(u=>`<span class="dd-upg-chip ${u.rarity}" title="${u.name}: ${u.desc}">${u.e}</span>`).join('');
}

// ── Combat ────────────────────────────────────────────────
function playerAttacks(enemy){
 let dmg=_mx(1,player.atk+(player.berserkerStacks||0));
 if(player.battleCrySaved){dmg*=2;player.battleCrySaved=false;}
 let isCrit=false;
 if(player.critChance>0&&_mr()*100<player.critChance){dmg*=2;isCrit=true;}
 // Storm of Quacks: also hit 2 random other enemies
 if(player.stormQuacks){
 const others=enemies.filter(e=>e!==enemy&&e.hp>0);
 const targets=others.sort(()=>_mr()-.5).slice(0,2);
 targets.forEach(t=>{const d=_mx(1,player.atk-1);t.hp-=d;popText(t.r,t.c,'🌪️'+d,'#e0a0ff');checkEnemyDeath(t);});
 }
 enemy.hp-=dmg;
 if(player.lifesteal)healPlayer(1,'');
 if(player.leechBlade&&enemy.hp<=0)healPlayer(2,'');
 if(player.burn)enemy.burnTurns=2;
 if(player.poison&&_mr()<0.1)enemy.poisonTurns=3;
 if(isCrit)popText(enemy.r,enemy.c,'💥'+dmg,'#f0c040');
 else popText(enemy.r,enemy.c,'-'+dmg,'#f06040');
 if(player.lightning&&_mr()<0.25){
 const adj=getAdjacent(player.r,player.c);
 enemies.forEach(e=>{if(e!==enemy&&adj.some(([r,c])=>e.r===r&&e.c===c)){const sd=_mx(1,player.atk-1);e.hp-=sd;popText(e.r,e.c,'⚡'+sd,'#a0c0ff');checkEnemyDeath(e);}});
 }
 if(player.spin){
 const adj=getAdjacent(player.r,player.c);
 enemies.forEach(e=>{if(e!==enemy&&adj.some(([r,c])=>e.r===r&&e.c===c)){const sd=_mx(1,player.atk-1);e.hp-=sd;popText(e.r,e.c,'💫'+sd,'#e0a0ff');checkEnemyDeath(e);}});
 }
 checkEnemyDeath(enemy);
}
function checkEnemyDeath(enemy){
 if(enemy.hp>0)return;
 player.xp+=enemy.xp||10;
 player.score+=(enemy.xp||10)+(enemy.isBoss?100:0);
 player.kills++;
 if(player.goldNose)player.gold+=3;
 enemies=enemies.filter(e=>e!==enemy);
 if(enemies.length===0){
 if(isBossRoom()){
 flashMsg('Boss defeated! ⚔️');
 if(floor>1&&floor%5===0)setTimeout(()=>showCurseScreen(),800);
 else setTimeout(()=>showUpgradeScreen(),800);
 return;
}
 roomCleared=true;grid[0][4]='O';flashMsg('Room cleared! ');
 }
 renderGrid();updateHUD();
 if(player.timeWarp)return; // skip enemy turn
 if(enemies.length>0)runEnemies();
}
function enemyAttacks(enemy){
 let dmg=_mx(1,enemy.atk-player.def);
 if(player.tough)dmg=_mx(1,dmg-1);
 if(player.dodge&&_mr()<0.2){popText(player.r,player.c,'💨dodge','#80e0ff');return;}
 const reflectChance=player.mirrorShield?.5:player.reflect?.3:0;
 if(reflectChance>0&&_mr()<reflectChance){
 const rd=player.mirrorShield?dmg:1;
 enemy.hp-=rd;
 popText(enemy.r,enemy.c,'🔄'+rd,'#4080ff');
 checkEnemyDeath(enemy);
 if(!player.mirrorShield){}; // still take damage if not mirror
 if(player.mirrorShield){return;}
 }
 // Fatal hit absorption
 if((player.manaShield&&!player.manaShieldUsed)&&player.hp-dmg<=0){
 player.manaShieldUsed=true;popText(player.r,player.c,'🔮shield','#c060ff');return;
 }
 if(player.secondWind&&!player.secondWindUsed&&player.hp-dmg<=0){
 player.secondWindUsed=true;
 player.hp=_mf(player.maxHp*0.3);
 popText(player.r,player.c,'💨revive','#80e0ff');updateHUD();return;
 }
 const _cd=(player._curseDmg||0)+(player._dblAtk||0);
 player.hp=_mx(0,player.hp-(dmg+_cd));
 popText(player.r,player.c,'-'+(dmg+_cd),'#ff4040');
 if(player.berserker&&player.berserkerStacks<8)player.berserkerStacks++;
 updateHUD();
 if(player.hp<=0){
 if(player.undying&&!player.undyingUsed){
 player.undyingUsed=true;player.hp=10;
 popText(player.r,player.c,'💀revive','#c0a0ff');updateHUD();return;
 }
 die();
 }
}
function healPlayer(amt){
 player.hp=_mn(player.maxHp,player.hp+amt);
 if(amt>0)popText(player.r,player.c,'+'+amt,'#50e880');
 updateHUD();
}

// ── Enemy AI ──────────────────────────────────────────────
function runEnemies(){
 // Dot ticks
 enemies.forEach(e=>{
 if(e.burnTurns>0){e.hp--;e.burnTurns--;popText(e.r,e.c,'🔥','#f08020');checkEnemyDeath(e);}
 if(e.poisonTurns>0){e.hp-=2;e.poisonTurns--;popText(e.r,e.c,'☠️2','#80d040');checkEnemyDeath(e);}
 });
 // Boss summon at 50% hp
 const boss=enemies.find(e=>e.isBoss&&e.summon);
 if(boss&&boss.hp<boss.maxHp*.5&&!boss._summoned&&enemies.length<5){
 boss._summoned=true;
 for(let i=0;i<2;i++){
 const t=ENEMY_TYPES.rat;let r,c,tr=0;
 do{r=1+_mf(_mr()*(GRID-2));c=1+_mf(_mr()*(GRID-2));tr++;}
 while((grid[r][c]!=='.'||occupied(r,c))&&tr<30);
 if(tr<30)enemies.push({...t,r,c,maxHp:t.hp,id:Date.now()+i,burnTurns:0,poisonTurns:0,nextR:r,nextC:c});
 }
 flashMsg('Zombie King calls minions!');
 }
 enemies.forEach(e=>{
 if(e.hp<=0)return;
 if(e.breath&&e.isBoss){
 const dist=_mx(_ma(e.r-player.r),_ma(e.c-player.c));
 if(dist<=2){enemyAttacks(e);return;}
 }
 if(e.range){
 const dist=_mx(_ma(e.r-player.r),_ma(e.c-player.c));
 if(dist<=e.range){enemyAttacks(e);return;}
 }
 if(e.teleport&&_mr()<0.4){
 let tr,tc,t=0;
 do{tr=_mx(1,_mn(GRID-2,player.r+_mf(_mr()*5)-2));tc=_mx(1,_mn(GRID-2,player.c+_mf(_mr()*5)-2));t++;}
 while((grid[tr][tc]!=='.'||occupied(tr,tc))&&t<20);
 if(t<20){e.r=tr;e.c=tc;}
 }
 const steps=player.chill?_mx(1,(e.spd||1)-1):(e.spd||1);
 for(let s=0;s<steps;s++){
 const dr=Math.sign(player.r-e.r),dc=Math.sign(player.c-e.c);
 const moves=[];
 if(dr!==0)moves.push([e.r+dr,e.c]);
 if(dc!==0)moves.push([e.r,e.c+dc]);
 if(dr!==0&&dc!==0)moves.push([e.r+dr,e.c+dc]);
 for(const[nr,nc]of moves){
 if(nr<0||nr>=GRID||nc<0||nc>=GRID)continue;
 if(grid[nr][nc]==='W'||grid[nr][nc]==='D')continue;
 if(enemies.some(o=>o!==e&&o.r===nr&&o.c===nc))continue;
 if(nr===player.r&&nc===player.c){enemyAttacks(e);break;}
 e.r=nr;e.c=nc;break;
 }
 }
 });
 // Regen
 if(player.regen){regenTimer++;if(regenTimer>=3){regenTimer=0;healPlayer(1);}}
 // Magnet
 if(player.magnet){
 items=items.filter(item=>{
 if(_mx(_ma(item.r-player.r),_ma(item.c-player.c))<=2){applyItem(item);return false;}
 return true;
 });
 }
 computeEnemyNextMoves();
 renderGrid();updateHUD();
}

// ── Click/Move ────────────────────────────────────────────
function clickCell(r,c){
 if(inputBlocked||gameOver)return;
 const dr=r-player.r,dc=c-player.c;
 const adx=_ma(dc),ady=_ma(dr);
 // Adjacent tile (incl. range-2 feather shot)
 if((adx===1&&ady===0)||(adx===0&&ady===1)){tryMove(dr,dc);return;}
 if(player.range===2&&((adx===2&&ady===0)||(adx===0&&ady===2))){
 const enemy=enemies.find(e=>e.r===r&&e.c===c);
 if(enemy){playerAttacks(enemy);turnCount++;runEnemies();renderGrid();updateHUD();}
 }
}
function tryMove(dr,dc){
 if(inputBlocked||gameOver)return;
 if(player._slowCurse){player._slowTurn=(player._slowTurn||0)+1;if(player._slowTurn%2===1)return;}
 const nr=player.r+dr,nc=player.c+dc;
 if(nr<0||nr>=GRID||nc<0||nc>=GRID)return;
 const cell=grid[nr][nc];
 if(cell==='W'&&!player.phantom)return;
 if(cell==='D')return;
 if(cell==='O'){enterDoor();return;}
 const enemy=enemies.find(e=>e.r===nr&&e.c===nc);
 if(enemy){playerAttacks(enemy);turnCount++;if(!player.timeWarp)runEnemies();renderGrid();updateHUD();return;}
 if(player.range===2){
 const r2=player.r+dr*2,c2=player.c+dc*2;
 if(r2>=0&&r2<GRID&&c2>=0&&c2<GRID){
 const farEnemy=enemies.find(e=>e.r===r2&&e.c===c2);
 if(farEnemy&&cell==='.'){playerAttacks(farEnemy);turnCount++;runEnemies();renderGrid();updateHUD();return;}
 }
 }
 player.r=nr;player.c=nc;
 const itemIdx=items.findIndex(i=>i.r===nr&&i.c===nc);
 if(itemIdx>=0){applyItem(items[itemIdx]);items.splice(itemIdx,1);}
 turnCount++;runEnemies();renderGrid();updateHUD();
}
function applyItem(item){
 if(item.id==='gold'){player.gold+=5;popText(player.r,player.c,'+5🪙','#f0c040');}
 else if(item.id==='potion'){const amt=player.potionBoost?8:5;healPlayer(amt);}
 else if(item.id==='weapon'){player.atk++;popText(player.r,player.c,'+1⚔️','#f0a040');}
 else if(item.id==='shield'){player.def++;popText(player.r,player.c,'+1🛡️','#4080f0');}
}
function getAdjacent(r,c){return [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];}
function showShop(){
 const ex=_gi('dd-shop');if(ex)ex.remove();
 const SHOP_ITEMS=[
 {e:'❤️',name:'Full Heal', desc:'Restore all HP.', cost:15, apply:p=>{p.hp=p.maxHp;}},
 {e:'💊',name:'Max Up', desc:'+5 max HP.', cost:10, apply:p=>{p.maxHp+=5;p.hp=_mn(p.hp+5,p.maxHp);}},
 {e:'⚔️',name:'Blade Polish', desc:'+2 ATK.', cost:12, apply:p=>{p.atk+=2;}},
 {e:'🛡️',name:'Temper', desc:'+2 DEF.', cost:12, apply:p=>{p.def+=2;}},
 {e:'🍖',name:'Hearty Meal', desc:'+8 HP. Simple but good.', cost:6, apply:p=>{healPlayer(8);}},
 {e:'🧪',name:'Mystery Vial', desc:'Random: +HP, ATK or DEF.', cost:8, apply:p=>{
 const r=_mr();
 if(r<.33){p.atk+=3;popText(p.r,p.c,'+3⚔️','#f0a040');}
 else if(r<.66){p.def+=3;popText(p.r,p.c,'+3🛡️','#4080f0');}
 else{p.maxHp+=8;p.hp=_mn(p.hp+8,p.maxHp);popText(p.r,p.c,'+8❤️','#50e880');}
 }},
 {e:'📜',name:'Skill Scroll', desc:'Gain a random upgrade.', cost:25, apply:p=>{
 const avail=UPGRADES.filter(u=>!p.upgrades.find(x=>x.id===u.id));
 if(avail.length){const u=avail[_mf(_mr()*avail.length)];u.apply(p);p.upgrades.push(u);flashMsg(u.e+' '+u.name+'!');}
 }},
 ];
 const scr=_ce('div');scr.id='dd-shop';
 const goldHtml=`<div style="font-family:'MedievalSharp',serif;font-size:15px;color:#f0c040;">🪙 ${player.gold} Gold</div>`;
 scr.innerHTML=`<h2>🏪 The Dungeon Shop</h2><p>Spend your gold wisely, adventurer!</p>${goldHtml}<div class="dd-shop-grid" id="dd-shop-grid"></div><button class="dd-shop-leave" id="dd-shop-leave">Continue ▶</button>`;
 _dungEl.appendChild(scr);
 function refreshShop(){
 const grid=scr.querySelector('#dd-shop-grid');
 if(!grid)return;
 grid.innerHTML='';
 SHOP_ITEMS.forEach((item,idx)=>{
 const canAfford=item.cost<0||player.gold>=item.cost;
 const card=_ce('div');
 card.className='dd-shop-item'+(canAfford?'':' cant-afford');
 card.innerHTML=`<div class="dd-shop-icon">${item.e}</div><div class="dd-shop-name">${item.name}</div><div class="dd-shop-desc">${item.desc}</div><div class="dd-shop-cost">${item.cost<0?'FREE':item.cost+'🪙'}</div>`;
 if(canAfford){
 card.addEventListener('click',()=>{
 if(item.cost>0)player.gold-=item.cost;
 item.apply(player);
 updateHUD();
 // Update gold display
 const goldEl=scr.querySelector('div[style*="MedievalSharp"]');
 if(goldEl)goldEl.textContent=`🪙 ${player.gold} Gold`;
 refreshShop();
 flashMsg(item.e+' '+item.name+'!');
 });
 }
 grid.appendChild(card);
 });
 }
 refreshShop();
 scr.querySelector('#dd-shop-leave').addEventListener('click',()=>{
 scr.remove();
 flashMsg('Room 3 — safe passage!');
 });
 flashMsg('🏪 Shop! Spend your gold!');
}
function enterDoor(){
 if(grid[0][4]!=='O')return;
 room++;if(room>5){floor++;room=1;}
 // Endless — no win condition, just keep going
 player.hp=_mn(player.maxHp,player.hp+3);
 setupRoom();
}

// ── Upgrade screen ────────────────────────────────────────
function weightedRarityPick(){
 const r=_mr()*100;
 if(r<3)return'legendary';
 if(r<15)return'epic';
 if(r<45)return'rare';
 return'common';
}
function pickUpgrades(){
 const available=UPGRADES.filter(u=>!player.upgrades.find(x=>x.id===u.id));
 const picked=[];const used=new Set();
 // Try to get one per weight class, bias toward rarer on later floors
 const rarityOrder=floor>=7?['legendary','epic','rare','common']:floor>=4?['epic','rare','common','legendary']:['common','rare','epic','legendary'];
 for(let attempt=0;attempt<60&&picked.length<3;attempt++){
 const targetRarity=rarityOrder[_mf(_mr()*rarityOrder.length)];
 const pool=available.filter(u=>u.rarity===targetRarity&&!used.has(u.id));
 if(!pool.length)continue;
 const pick=pool[_mf(_mr()*pool.length)];
 picked.push(pick);used.add(pick.id);
 }
 // Fallback
 while(picked.length<3&&available.length>picked.length){
 const rest=available.filter(u=>!used.has(u.id));
 if(!rest.length)break;
 const pick=rest[_mf(_mr()*rest.length)];
 picked.push(pick);used.add(pick.id);
 }
 return picked.slice(0,3);
}
function showCurseScreen(){
 grid[0][4]='O';renderGrid();
 const ex=_gi('dd-curse-screen');if(ex)ex.remove();
 const avail=CURSES.filter(c=>!activeCurses.find(a=>a.id===c.id));
 const picks=[];const used=new Set();
 for(let i=0;i<3&&i<avail.length;i++){
  const pool=avail.filter(c=>!used.has(c.id));
  if(!pool.length)break;
  const p=pool[_mf(_mr()*pool.length)];picks.push(p);used.add(p.id);
 }
 const scr=_ce('div');scr.id='dd-curse-screen';
 scr.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;z-index:40;padding:20px;';
 scr.innerHTML='<div style="font-size:20px;font-weight:900;color:#ff4040;">⚠️ A Curse Befalls You</div>'
  +'<div style="font-size:11px;color:rgba(255,255,255,0.45);text-align:center;max-width:280px;">Floor '+floor+' done — choose a curse. You will also gain an upgrade.</div>'
  +'<div id="dd-curse-cards" style="display:flex;flex-direction:column;gap:8px;width:100%;max-width:310px;"></div>';
 _dungEl.appendChild(scr);
 picks.forEach(c=>{
  const card=_ce('div');
  card.style.cssText='background:rgba(160,20,20,0.15);border:2px solid rgba(255,60,60,0.35);border-radius:12px;padding:11px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;touch-action:manipulation;';
  card.innerHTML=`<span style="font-size:26px;">${c.e}</span><div><div style="font-size:13px;font-weight:900;color:#ff8080;">${c.name}</div><div style="font-size:11px;color:rgba(255,255,255,0.45);">${c.desc}</div></div>`;
  function _pick(){
   activeCurses.push(c);
   if(c.id==='glass')player._curseDmg=(player._curseDmg||0)+2;
   if(c.id==='weakened')player.atk=_mx(1,player.atk-2);
   if(c.id==='no_regen')player._noRegen=true;
   if(c.id==='slow')player._slowCurse=true;
   if(c.id==='dbl_atk')player._dblAtk=(player._dblAtk||0)+3;
   scr.remove();showUpgradeScreen();
  }
  card.addEventListener('click',_pick);
  card.addEventListener('touchend',e=>{e.preventDefault();_pick();},{passive:false});
  scr.appendChild(card);
 });
}
function showUpgradeScreen(){
 grid[0][4]='O';renderGrid();
 const ex=_gi('dd-upgrade-screen');if(ex)ex.remove();
 const ups=pickUpgrades();
 const scr=_ce('div');scr.id='dd-upgrade-screen';
 scr.innerHTML=`<h2>⚔️ Choose Your Power</h2><p>Boss slain — pick one upgrade</p><div class="dd-upg-cards-row" id="dd-upg-cards"></div>`;
 _dungEl.appendChild(scr);
 const row=scr.querySelector('#dd-upg-cards');
 ups.forEach(u=>{
 const card=_ce('div');card.className=`dd-upg-card rarity-${u.rarity}`;
 card.innerHTML=`<div class="dd-upg-card-icon">${u.e}</div><div class="dd-upg-card-rarity ${u.rarity}">${u.rarity.toUpperCase()}</div><div class="dd-upg-card-name">${u.name}</div><div class="dd-upg-card-desc">${u.desc}</div><div class="dd-upg-card-type ${u.type}">${u.type.toUpperCase()}</div>`;
 card.addEventListener('click',()=>{
 u.apply(player);player.upgrades.push(u);
 scr.remove();updateHUD();flashMsg(u.e+' '+u.name+'!');
 });
 row.appendChild(card);
 });
}

// ── Death / Win ───────────────────────────────────────────
function die(){
 gameOver=true;
 if(player.score>bestScore){bestScore=player.score;}
 setTimeout(()=>showGameOver('💀','You have fallen...'),400);
}
function winGame(){
 // Endless mode — winGame only called if somehow floor>10 (shouldn't happen)
 // Treat as a milestone, not a true end
 gameOver=false;
}
function showGameOver(icon,title,win){
 const ov=_ce('div');ov.id='dd-overlay';
 ov.innerHTML=`
 <div class="dd-ov-icon">${icon}</div>
 <div class="dd-ov-title">${title}</div>
 <div class="dd-ov-sub">The dungeon claims another duck...</div>
 <div class="dd-ov-card">
 <div class="dd-ov-row">Score <span>${player.score}</span></div>
 <div class="dd-ov-row">Best <span>${bestScore}</span></div>
 <div class="dd-ov-row">Floor Reached <span>${floor}</span></div>
 <div class="dd-ov-row">Enemies Slain <span>${player.kills}</span></div>
 </div>
 <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">
 <button class="dd-big-btn dd-btn-gold" id="dd-restart-btn">▶ Try Again</button>
 <button class="dd-big-btn dd-btn-red" id="dd-exit-btn">🏠 Menu</button>
 </div>`;
 _dungEl.appendChild(ov);
 ov.querySelector('#dd-restart-btn').addEventListener('click',()=>{ov.remove();resetGame();});
 ov.querySelector('#dd-exit-btn').addEventListener('click',()=>window._exitDungeon());
}
function resetGame(){
 gameOver=false;inputBlocked=false;floor=1;room=1;turnCount=0;regenTimer=0;
 activeCurses=[];
 player={r:7,c:4,hp:20,maxHp:20,atk:3,def:0,gold:0,xp:0,score:0,kills:0,
 upgrades:[],burn:false,lightning:false,critChance:0,range:1,spin:false,
 reflect:false,mirrorShield:false,dodge:false,regen:false,magnet:false,
 lifesteal:false,tough:false,manaShield:false,manaShieldUsed:false,
 timeWarp:false,sense:false,phantom:false,chill:false,
 berserker:false,berserkerStacks:0,secondWind:false,secondWindUsed:false,
 undying:false,undyingUsed:false,battleCry:false,battleCrySaved:false,
 leechBlade:false,poison:false,goldNose:false,stormQuacks:false,potionBoost:false,
 };
 setupRoom();
}

// ── UI helpers ────────────────────────────────────────────
function popText(r,c,txt,color){
 const gridEl=_gi('dd-grid');if(!gridEl)return;
 const cell=_gi(`dd-${r}-${c}`);if(!cell)return;
 const p=_ce('div');p.className='dd-dmg-pop';p.textContent=txt;
 p.style.cssText=`color:${color};left:50%;top:50%;position:absolute;`;
 cell.style.position='relative';
 cell.appendChild(p);
 setTimeout(()=>p.remove(),750);
}
let _msgTimeout=null;
function flashMsg(txt){
 const el=_gi('dd-msg');if(!el)return;
 if(_msgTimeout)clearTimeout(_msgTimeout);
 el.textContent=txt;el.style.opacity='1';
 _msgTimeout=setTimeout(()=>{if(el)el.style.opacity='0';},1600);
}

// ── Input ─────────────────────────────────────────────────
// Keyboard
document.addEventListener('keydown',function _ddKeys(e){
 if(!window._dungeonActive){document.removeEventListener('keydown',_ddKeys);return;}
 if(e.key==='Escape'){window._exitDungeon();return;}
 const map={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1],
 w:[-1,0],s:[1,0],a:[0,-1],d:[0,1],W:[-1,0],S:[1,0],A:[0,-1],D:[0,1]};
 if(map[e.key]){e.preventDefault();tryMove(...map[e.key]);}
});
// Touch swipe (as backup on mobile)
let _tStart=null;
_dungEl.addEventListener('touchstart',e=>{if(e.touches.length===1)_tStart={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
_dungEl.addEventListener('touchend',e=>{
 if(!_tStart||e.changedTouches.length!==1)return;
 const dx=e.changedTouches[0].clientX-_tStart.x,dy=e.changedTouches[0].clientY-_tStart.y;
 const adx=_ma(dx),ady=_ma(dy);
 if(adx>32||ady>32){adx>ady?tryMove(0,dx>0?1:-1):tryMove(dy>0?1:-1,0);}
 _tStart=null;
},{passive:true});
_dungEl.querySelector('#dd-menu-btn').addEventListener('click',()=>window._exitDungeon());
window.addEventListener('resize',()=>{if(window._dungeonActive)renderGrid();});

// ── Start ─────────────────────────────────────────────────
setupRoom();
// Show starting upgrade pick before title screen
function showStartingUpgrade(onDone){
 const ex=_gi('dd-upgrade-screen');if(ex)ex.remove();
 const ups=pickUpgrades();
 const scr=_ce('div');scr.id='dd-upgrade-screen';
 scr.innerHTML=`<h2>🌟 Choose Your Starting Power</h2><p>Pick one common upgrade to begin your run</p><div class="dd-upg-cards-row" id="dd-upg-cards"></div>`;
 _dungEl.appendChild(scr);
 const row=_gi('dd-upg-cards');
 ups.forEach(u=>{
 const card=_ce('div');card.className=`dd-upg-card rarity-${u.rarity}`;
 card.innerHTML=`<div class="dd-upg-card-icon">${u.e}</div><div class="dd-upg-card-rarity ${u.rarity}">${u.rarity.toUpperCase()}</div><div class="dd-upg-card-name">${u.name}</div><div class="dd-upg-card-desc">${u.desc}</div><div class="dd-upg-card-type ${u.type}">${u.type.toUpperCase()}</div>`;
 card.addEventListener('click',()=>{
 u.apply(player);player.upgrades.push(u);
 scr.remove();updateHUD();onDone();
 });
 row.appendChild(card);
 });
}
// Force starting upgrade to always be common
const _origPickUpgrades=pickUpgrades;
function pickStartingUpgrades(){
 const commons=UPGRADES.filter(u=>u.rarity==='common');
 const picked=[];const used=new Set();
 while(picked.length<3&&picked.length<commons.length){
 const rest=commons.filter(u=>!used.has(u.id));
 if(!rest.length)break;
 const p=rest[_mf(_mr()*rest.length)];
 picked.push(p);used.add(p.id);
 }
 return picked;
}
const startOv=_ce('div');startOv.id='dd-overlay';
startOv.innerHTML=`
 <div class="dd-ov-icon">🗡️</div>
 <div class="dd-ov-title">Duck Dungeons</div>
 <div class="dd-ov-sub">Tap adjacent tiles to move and attack.<br>Defeat bosses to choose upgrades.<br>The dungeon is endless — how deep can you go?</div>
 <div class="dd-ov-card">
 <div class="dd-ov-row">Move <span>Tap tile / Arrow keys</span></div>
 <div class="dd-ov-row">Attack <span>Tap (or bump) enemy</span></div>
 <div class="dd-ov-row">Best Score <span>${bestScore}</span></div>
 </div>
 <button class="dd-big-btn dd-btn-gold" id="dd-start-btn">⚔️ Enter the Dungeon</button>`;
_dungEl.appendChild(startOv);
startOv.querySelector('#dd-start-btn').addEventListener('click',()=>{
 startOv.remove();
 // Show common upgrade picker before first room
 const origPick=pickUpgrades;
 // temporarily override to common-only
 window._ddTempPick=true;
 const startUps=UPGRADES.filter(u=>u.rarity==='common').sort(()=>_mr()-.5).slice(0,3);
 const scr=_ce('div');scr.id='dd-upgrade-screen';
 scr.innerHTML=`<h2>🌟 Starting Power</h2><p>Choose a common upgrade to begin your run</p><div class="dd-upg-cards-row" id="dd-start-upg-cards"></div>`;
 _dungEl.appendChild(scr);
 const row=scr.querySelector('#dd-start-upg-cards');
 startUps.forEach(u=>{
 const card=_ce('div');card.className='dd-upg-card rarity-common';
 card.innerHTML=`<div class="dd-upg-card-icon">${u.e}</div><div class="dd-upg-card-rarity common">COMMON</div><div class="dd-upg-card-name">${u.name}</div><div class="dd-upg-card-desc">${u.desc}</div><div class="dd-upg-card-type ${u.type}">${u.type.toUpperCase()}</div>`;
 card.addEventListener('click',()=>{
 u.apply(player);player.upgrades.push(u);
 scr.remove();updateHUD();flashMsg(u.e+' '+u.name+'!');
 });
 row.appendChild(card);
 });
});
}
})();
function remAlien(o,silent){
o._exploding=true;
if(o._survivalTimer){clearTimeout(o._survivalTimer);o._survivalTimer=null;}
if(o._moveInterval){clearInterval(o._moveInterval);o._moveInterval=null;}
if(!silent){
o.el.style.transition='filter 0.3s ease';
o.el.style.filter='drop-shadow(0 0 12px cyan) drop-shadow(0 0 24px blue) brightness(2)';
setTimeout(()=>{
let boom=_ce('div');boom.textContent='💥';
boom.style.cssText=`position:fixed;left:${o.x}px;top:${o.y}px;font-size:44px;z-index:1000030;pointer-events:none;transform:translate(-50%,-50%);transition:transform .6s ease-out,opacity .6s ease-out;`;
_ba(boom);
_raf(()=>{boom.style.transform='translate(-50%,-50%) scale(3.5)';boom.style.opacity='0';});
setTimeout(()=>boom.remove(),650);
o.el.remove();
let i=Aliens.indexOf(o);if(i>-1)Aliens.splice(i,1);
},350);
} else {
if(o._survivalTimer){clearTimeout(o._survivalTimer);o._survivalTimer=null;}
o.el.remove();
let i=Aliens.indexOf(o);if(i>-1)Aliens.splice(i,1);
_unlockAch('drownedout');
}
}
function spawnAlien(x,y){
let o=spawn(Aliens,'👽',x,y,2.2+_mr()*1.5,26,'Alien');
o.el.style.filter='drop-shadow(0 0 6px lime)';
o._exploding=false;
o._killCount=0;
o._survivalTimer=setTimeout(()=>{if(!o._exploding)_unlockAch('wecomeinpeace');},30000);
o.el.onclick=ev=>{
if(mode==='knife'){
if(o._exploding)return;
o._exploding=true;
if(o._survivalTimer){clearTimeout(o._survivalTimer);o._survivalTimer=null;}
if(o._moveInterval){clearInterval(o._moveInterval);o._moveInterval=null;}
_unlockAch('alienslayer');
let kx=o.x+12,ky=o.y+12;
let slash=_ce('div');slash.textContent='🔪';
slash.style.cssText=`position:fixed;left:${kx}px;top:${ky}px;font-size:32px;z-index:1000020;pointer-events:none;animation:knifeSlash 0.35s ease-out forwards;`;
_ba(slash);setTimeout(()=>slash.remove(),350);
o.el.style.filter='drop-shadow(0 0 12px cyan) brightness(2)';
setTimeout(()=>{
let boom=_ce('div');boom.textContent='💥';
boom.style.cssText=`position:fixed;left:${o.x}px;top:${o.y}px;font-size:44px;z-index:1000030;pointer-events:none;transform:translate(-50%,-50%);transition:transform .6s ease-out,opacity .6s ease-out;`;
_ba(boom);
_raf(()=>{boom.style.transform='translate(-50%,-50%) scale(3.5)';boom.style.opacity='0';});
setTimeout(()=>boom.remove(),650);
o.el.remove();let i=Aliens.indexOf(o);if(i>-1)Aliens.splice(i,1);
},300);
ev.stopPropagation();
}
};
return o;
}
function triggerUFO(){
if(!Ducks.length)return;
_unlockAch('firstcontact');
let victim=Ducks[_mf(_mr()*Ducks.length)];
let tx=victim.x,ty=victim.y;
let startX=_mr()*innerWidth;
let ufo=_ce('div');ufo.textContent='🛸';
ufo.style.cssText=`position:fixed;left:${startX}px;top:-60px;font-size:44px;z-index:1000028;pointer-events:none;transition:left 1.2s ease,top 1.2s ease;filter:drop-shadow(0 0 12px cyan);`;
_ba(ufo);
let beam=_ce('div');
beam.style.cssText=`position:fixed;left:${startX}px;top:-40px;width:3px;height:0px;background:linear-gradient(to bottom,rgba(100,255,255,0.8),rgba(100,255,255,0));z-index:1000027;pointer-events:none;transform:translateX(-50%);transition:left 1.2s ease,top 1.2s ease,height 0.5s ease 1.2s;`;
_ba(beam);
setTimeout(()=>{
ufo.style.left=tx+'px';ufo.style.top=(ty-80)+'px';
beam.style.left=tx+'px';beam.style.top=(ty-80)+'px';
},50);
setTimeout(()=>{
beam.style.height='80px';
victim.el.style.transition='transform 0.1s';
let shakeCount=0;
let shakeInt=setInterval(()=>{
victim.el.style.transform=`translate(${(Math.random()-0.5)*6}px,${(Math.random()-0.5)*6}px)`;
if(++shakeCount>8){clearInterval(shakeInt);victim.el.style.transform='';}
},80);
},1300);
setTimeout(()=>{
beam.style.height='0px';
let txt=_ce('div');txt.textContent='👽 Abducted!';
txt.style.cssText=`position:fixed;left:${tx}px;top:${ty-40}px;font-size:18px;color:lime;font-weight:bold;text-shadow:0 0 10px lime;z-index:1000029;pointer-events:none;transition:transform 1s ease,opacity 1s ease;transform:translate(-50%,-50%);`;
_ba(txt);
_raf(()=>{txt.style.transform='translate(-50%,-120%)';txt.style.opacity='0';});
setTimeout(()=>txt.remove(),1000);
_unlockAch('theytookone');
if(Ducks.includes(victim))rem(victim);
setTimeout(()=>{
ufo.style.top='-80px';ufo.style.left=(_mr()*innerWidth)+'px';
beam.style.top='-80px';
setTimeout(()=>{ufo.remove();beam.remove();
spawnAlien(tx,ty);
},1000);
},400);
},2200);
}
function tickAliens(now){
if(paused)return;
if(now>nextUFO){
nextUFO=now+10000;
if(_mr()<0.01&&Ducks.length>0)triggerUFO();
}
Aliens.forEach(o=>{
if(o._exploding||paused)return;
move(o,1.3);
let targets=[...Ducks,...Babies,...BabySwans,...Swans,...Dragons,...BabyDragons,...Foxes,...Snakes,...Wolves];
let hit=targets.find(t=>dist(o,t)<HIT);
if(hit&&!o._onCooldown){
o._onCooldown=true;
o.el.style.filter='drop-shadow(0 0 14px cyan) drop-shadow(0 0 28px blue) brightness(2.5)';
o._killCount=(o._killCount||0)+1;
const hitsDragon=hit.type==='Dragon'||hit.type==='BabyDragon';
setTimeout(()=>{
rem(hit);
if(o._killCount>=3)_unlockAch('closencounter');
if(hitsDragon){
remAlien(o,false);
} else {
if(!o._exploding){
o.el.style.filter='drop-shadow(0 0 6px lime)';
setTimeout(()=>{o._onCooldown=false;},600);
}
}
},300);
}
});
}
function totalPop(){return Ducks.length+Babies.length+BabySwans.length+Swans.length+DragonEggs.length+BabyDragons.length+Dragons.length+Foxes.length+Snakes.length+Eggs.length+Aliens.length+Bears.length+Lions.length+Eagles.length+Bats.length+Zombies.length+BabyZombies.length+Yetis.length;}
function updateStats(inf){
let current=totalPop();if(current>highestPop)highestPop=current;
if(window._challengeEvent && Ducks.length>=50) window._challengeEvent('sandbox_pop', Ducks.length);
if(Ducks.length>0||Babies.length>0)window._everHadDuck=true;
if(window._everHadDuck&&Ducks.length===0&&Babies.length===0&&BabySwans.length===0&&Swans.length===0&&DragonEggs.length===0&&BabyDragons.length===0&&Dragons.length===0&&Foxes.length===0&&Snakes.length===0&&Wolves.length===0&&Eggs.length===0&&Bears.length===0&&Lions.length===0&&Eagles.length===0&&Bats.length===0&&Zombies.length===0&&BabyZombies.length===0&&Yetis.length===0)_unlockAch('extinction');
if(current>=25)_unlockAch('ducky');
if(current>=500)_unlockAch('ducklife');
if(current>=1000)_unlockAch('howdidwegethere');
if(Ducks.length===8)_unlockAch('d8ck');if(Ducks.length===67)_unlockAch('sixtyseven');if(Babies.length>=1&&BabySwans.length>=1)_unlockAch('babyboo');
if(Ducks.length>=2&&Babies.length>=2&&Swans.length>=2&&Foxes.length>=2&&Snakes.length>=2&&Wolves.length>=2)_unlockAch('ecosystem');
if(Ducks.length>=1&&Bears.length>=1&&Lions.length>=1)_unlockAch('menagerie');
if(Bears.length>=3&&Lions.length>=3)_unlockAch('apexpredator');if(Eagles.length>=3)_unlockAch('apexbird');if(dayPhase==='night'&&Bats.length>=3)_unlockAch('nightflock');
let wdata=WEATHERS[weather],pd=PHASE_DATA[dayPhase];
if(!window.popCollapsed){let _popAliens='<br><span style="color:#00aa55">👽'+Aliens.length+'</span>';window.popContent.innerHTML='<span style="color:#e63946;font-size:14px;font-weight:bold;">👥 '+current+'</span> <span style="color:rgba(255,255,255,0.35);font-size:10px">best:'+highestPop+'</span><div class="ck-divider"></div>🦆'+Ducks.length+' 🐥'+Babies.length+' 🐣'+BabySwans.length+' 🦢'+Swans.length+'<br>🐲'+BabyDragons.length+' 🐉'+Dragons.length+'<br>🥚'+Eggs.length+' <span style="color:#e63946">🦊'+Foxes.length+' 🐍'+Snakes.length+' 🐺'+Wolves.length+'<br>🐻'+Bears.length+' 🦁'+Lions.length+'</span>'+_popAliens+'<br><span style="color:#2a9d8f">🦠'+inf+'</span><div class="ck-divider"></div>☀️ Day '+_dayCount+' · ☠️ '+_totalKills+' killed<div class="ck-divider"></div>'+wdata.emoji+' '+wdata.label+' · '+pd.emoji+' '+pd.label;}
}
let activeDisaster=null;
let nextDisaster=Date.now()+45000;
function tickNaturalDisasters(now){
if(now<nextDisaster)return;
nextDisaster=now+(40000+_mr()*50000);
let roll=_mr();
if(roll<0.33)triggerMeteor();
else if(roll<0.66)triggerVolcano();
else triggerFlood();
}
function triggerMeteorShower(){
let count=4,done=0;
let showerBanner=_ce('div');showerBanner.textContent='🌌 METEOR SHOWER!';
showerBanner.style.cssText='position:fixed;top:38%;left:50%;transform:translate(-50%,-50%);font-size:34px;color:#c8b4ff;font-weight:bold;text-shadow:0 0 20px #a080ff;z-index:1000021;pointer-events:none;';
_ba(showerBanner);
setTimeout(()=>{showerBanner.style.transition='opacity 1s';showerBanner.style.opacity='0';},1800);
setTimeout(()=>showerBanner.remove(),2800);
for(let i=0;i<count;i++){
setTimeout(()=>{
let x=PAD+_mr()*(innerWidth-PAD*2);
let m=_ce('div');m.textContent='☄️';
m.style.cssText=`position:fixed;left:${x}px;top:-60px;font-size:${28+Math.random()*20}px;z-index:1000020;pointer-events:none;transition:top 1.2s cubic-bezier(.4,0,.8,1),opacity .2s;filter:drop-shadow(0 0 12px orange);`;
_ba(m);
let landY=innerHeight*0.2+_mr()*innerHeight*0.5;
_raf(()=>_raf(()=>{m.style.top=landY+'px';}));
setTimeout(()=>{
let mx2=x+14,my2=landY+14;
explosion(mx2,my2);
[...Ducks,...Babies,...BabySwans,...Swans,...Foxes,...Snakes,...Wolves,...Bears,...Lions,...Eggs].forEach(o=>{
if(Math.hypot(o.x-mx2,o.y-my2)<90&&o.type!=='Dragon'&&o.type!=='BabyDragon'&&o.type!=='DragonEgg')rem(o);
});
m.style.opacity='0';setTimeout(()=>m.remove(),300);
done++;if(done>=count){}
},1350+(_mr()*300));
},i*(400+_mr()*300));
}
_unlockAch('cosmicrain');
}
let _rainbowActive=false;
function triggerRainbow(){weatherEnd=Date.now()+30000;setWeather('rainbow');}
function triggerThunderstorm(){
if(window._thunderstormActive)return;
window._thunderstormActive=true;_unlockAch('thundergod');
let overlay=_ce('div');
overlay.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999993;background:rgba(20,20,50,0.35);transition:opacity 1s;';
_ba(overlay);
let lbl=_ce('div');lbl.textContent='⚡ Thunderstorm!';
lbl.style.cssText='position:fixed;top:15%;left:50%;transform:translateX(-50%);font-size:28px;font-weight:900;color:#fff;text-shadow:0 0 20px #ffe066,0 0 40px #ffcc00;z-index:999995;pointer-events:none;font-family:Nunito,sans-serif;transition:opacity 1s;';
_ba(lbl);
setTimeout(()=>{lbl.style.opacity='0';},3000);
let strikes=0,maxStrikes=20;
let stormInt=setInterval(()=>{
if(!window._thunderstormActive||paused)return;
let targets=[...Ducks,...Babies,...BabySwans,...Swans,...Foxes,...Snakes,...Wolves,...Bears,...Lions,...Eagles,...Bats].filter(o=>o.type!=='Dragon'&&o.type!=='BabyDragon');
if(targets.length){
let t=targets[_mf(_mr()*targets.length)];
let bolt=_ce('div');bolt.textContent='⚡';
bolt.style.cssText=`position:fixed;left:${t.x}px;top:${t.y-40}px;font-size:32px;z-index:999994;pointer-events:none;transform:translateX(-50%);transition:top .15s ease-in,opacity .2s;`;
_ba(bolt);
setTimeout(()=>{bolt.style.top=t.y+'px';},10);
setTimeout(()=>{bolt.style.opacity='0';rem(t);bolt.remove();},200);
strikes++;
_unlockAch('thunderstruck');
}
if(strikes>=maxStrikes){clearInterval(stormInt);window._thunderstormActive=false;overlay.style.opacity='0';setTimeout(()=>overlay.remove(),1000);}
},800);
setTimeout(()=>{clearInterval(stormInt);window._thunderstormActive=false;overlay.style.opacity='0';if(Ducks.length>=50)_unlockAch('stormsurvivor');setTimeout(()=>overlay.remove(),1000);},20000);
}
function triggerMassUFO(){
if(window._massUFOActive)return;
window._massUFOActive=true;
_unlockAch('alieninvasion');
let overlay=_ce('div');
overlay.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999990;background:rgba(0,20,40,0.4);transition:opacity 2s;';
_ba(overlay);
let lbl=_ce('div');lbl.textContent='👽 ALIEN INVASION';
lbl.style.cssText='position:fixed;top:14%;left:50%;transform:translateX(-50%);font-size:28px;font-weight:900;color:#00ffcc;text-shadow:0 0 20px #00ff88,0 0 40px #00cc66;z-index:999995;pointer-events:none;font-family:Nunito,sans-serif;letter-spacing:3px;transition:opacity 1s;';
_ba(lbl);
setTimeout(()=>lbl.style.opacity='0',3000);
let wave=0,maxWaves=6;
function launchWave(){
if(wave>=maxWaves||!window._massUFOActive)return;
wave++;
let savedUFO=nextUFO;nextUFO=0;
triggerUFO();
nextUFO=savedUFO;
if(wave<maxWaves)setTimeout(launchWave,3000+_mr()*1500);
}
launchWave();
setTimeout(()=>{
window._massUFOActive=false;
overlay.style.opacity='0';
setTimeout(()=>overlay.remove(),2000);
},25000);
}
function triggerEclipse(){
if(window._eclipseActive)return;window._eclipseActive=true;
let _savedPhase=dayPhase;dayPhase='night';
let ov=_ce('div');
ov.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999993;background:radial-gradient(circle at 50% 30%,rgba(0,0,0,0) 8%,rgba(5,5,30,0.85) 35%,rgba(5,5,30,0.92) 100%);transition:opacity 2s;';
_ba(ov);
let lbl=_ce('div');lbl.textContent='🌑 Eclipse';
lbl.style.cssText='position:fixed;top:18%;left:50%;transform:translateX(-50%);font-size:26px;font-weight:900;color:#aac8ff;text-shadow:0 0 20px #4488ff;z-index:999994;pointer-events:none;font-family:Nunito,sans-serif;';
_ba(lbl);_unlockAch('eclipse');
setTimeout(()=>{window._eclipseActive=false;dayPhase=_savedPhase;ov.style.opacity='0';lbl.style.opacity='0';setTimeout(()=>{ov.remove();lbl.remove();},2000);},40000);
}
function triggerOvergrowth(){
if(window._overgrowthActive)return;window._overgrowthActive=true;
let ov=_ce('div');
ov.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999991;background:rgba(30,120,30,0.13);transition:opacity 2s;';
_ba(ov);
let lbl=_ce('div');lbl.textContent='🌿 Overgrowth!';
lbl.style.cssText='position:fixed;top:22%;left:50%;transform:translateX(-50%);font-size:26px;font-weight:900;color:#80ff80;text-shadow:0 0 16px #00ff44;z-index:999992;pointer-events:none;font-family:Nunito,sans-serif;';
_ba(lbl);_unlockAch('overgrowth');
setTimeout(()=>{window._overgrowthActive=false;ov.style.opacity='0';lbl.style.opacity='0';setTimeout(()=>{ov.remove();lbl.remove();},2000);},30000);
}
function triggerMeteor(){
let x=PAD+_mr()*(innerWidth-PAD*2);
let meteor=_ce('div');
meteor.textContent='☄️';
meteor.style.cssText=`position:fixed;left:${x}px;top:-60px;font-size:48px;z-index:1000020;pointer-events:none;transition:top 1.6s cubic-bezier(.4,0,.8,1),opacity .2s ease;filter:drop-shadow(0 0 20px orange);`;
_ba(meteor);
_raf(()=>_raf(()=>{meteor.style.top=innerHeight*0.45+'px';}));
setTimeout(()=>{
let mx=x+24,my=innerHeight*0.45+24;
explosion(mx,my);
let wave=_ce('div');
wave.style.cssText=`position:fixed;left:${mx}px;top:${my}px;width:40px;height:40px;border-radius:50%;background:radial-gradient(circle,rgba(255,140,0,0.6),transparent);z-index:1000019;pointer-events:none;transform:translate(-50%,-50%);transition:all .8s ease-out;`;
_ba(wave);
_raf(()=>{wave.style.width='700px';wave.style.height='700px';wave.style.opacity='0';});
setTimeout(()=>wave.remove(),800);
let _duckKills=0;
[...Ducks,...Babies,...BabySwans,...Swans,...Dragons,...BabyDragons,...DragonEggs,...Foxes,...Snakes,...Wolves,...Bears,...Lions,...Eggs].forEach(o=>{
if(Math.hypot(o.x-mx,o.y-my)<280){if(o.type==='Dragon'||o.type==='BabyDragon'||o.type==='DragonEgg')return;if(o.type==='Duck')_duckKills++;rem(o);}
});
if(_duckKills===2)_unlockAch('twobirds');
meteor.style.opacity='0';
setTimeout(()=>{meteor.remove();},300);
},1750);
}
let lavaBlobs=[];
function triggerVolcano(){
let _volId=Date.now()+_mr();
let edge=_mf(_mr()*4);
let vx,vy,volLeft,volTop,volStyle;
let _vpad=60;
if(edge===0){vx=_vpad+_mr()*(innerWidth-_vpad*2);vy=innerHeight-_vpad;volLeft=vx;volTop=null;}
else if(edge===1){vx=_vpad+_mr()*(innerWidth-_vpad*2);vy=_vpad;volLeft=vx;volTop=0;}
else if(edge===2){vx=_vpad;vy=_vpad+_mr()*(innerHeight-_vpad*2);volLeft=_vpad;volTop=vy;}
else{vx=innerWidth-_vpad;vy=_vpad+_mr()*(innerHeight-_vpad*2);volLeft=innerWidth-_vpad;volTop=vy;}
let vol=_ce('div');
vol.textContent='🌋';
vol.style.cssText=`position:fixed;left:${volLeft}px;${volTop!==null?'top:'+volTop+'px':'bottom:0px'};font-size:52px;z-index:1000020;pointer-events:none;transform:translateX(-50%);filter:drop-shadow(0 0 30px red);`;
_ba(vol);
let duration=5000;
let spawnLava=setInterval(()=>{
let blob=_ce('div');
blob.textContent='🔥';
let bx=vx+(_mr()-0.5)*(edge<2?70:30);
let by=vy+(_mr()-0.5)*(edge<2?40:120);
blob.style.cssText=`position:fixed;left:${bx}px;top:${by}px;font-size:${18+Math.random()*14}px;z-index:1000018;pointer-events:none;`;
_ba(blob);
let spd=2.5+_mr()*2;
let vvx,vvy,gravity;
if(edge===0){vvx=(_mr()-0.5)*3;vvy=-(spd);gravity=0.12;}
else if(edge===1){vvx=(_mr()-0.5)*3;vvy=spd;gravity=-0.12;}
else if(edge===2){vvx=spd;vvy=(_mr()-0.5)*3;gravity=0;}
else{vvx=-spd;vvy=(_mr()-0.5)*3;gravity=0;}
let bobj={el:blob,x:bx,y:by,vx:vvx,vy:vvy,dead:false,_grav:gravity,_volId:_volId};
lavaBlobs.push(bobj);
},300);
setTimeout(()=>{
clearInterval(spawnLava);
vol.style.transition='opacity 1s';vol.style.opacity='0';
setTimeout(()=>vol.remove(),1000);
setTimeout(()=>{
lavaBlobs.filter(b=>b._volId===_volId).forEach(b=>{b.dead=true;b.el.remove();});
lavaBlobs=lavaBlobs.filter(b=>b._volId!==_volId);
},3000);
},duration);
}
function tickLava(){
lavaBlobs=lavaBlobs.filter(b=>{
if(b.dead)return false;
b.vy+=(b._grav!==undefined?b._grav:0.12);b.x+=b.vx;b.y+=b.vy;
b.el.style.left=b.x+'px';b.el.style.top=b.y+'px';
if(b.y>innerHeight+20||b.y<-60||b.x<-60||b.x>innerWidth+60){b.el.remove();return false;}
[...Ducks,...Babies,...BabySwans,...Swans,...Dragons,...BabyDragons,...DragonEggs,...Foxes,...Snakes,...Wolves,...Bears,...Lions,...Eggs].forEach(o=>{
if(Math.hypot(o.x-b.x,o.y-b.y)<22&&o.type!=='Dragon'&&o.type!=='BabyDragon'&&o.type!=='DragonEgg')rem(o);
});
return true;
});
}
let floodLevel=0,floodEl=null,floodActive=false;
function triggerFlood(){
if(floodActive)return;
floodActive=true;floodLevel=0;
floodEl=_ce('div');
floodEl.style.cssText=`position:fixed;bottom:0;left:0;width:100%;height:0px;background:linear-gradient(to top,rgba(0,80,200,0.55),rgba(0,160,255,0.25));z-index:1000017;pointer-events:none;transition:height .4s ease;border-top:3px solid rgba(100,200,255,0.7);`;
_ba(floodEl);
let banner=_ce('div');
banner.textContent='🌊 FLOOD!';
banner.style.cssText='position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);font-size:36px;color:#0af;text-shadow:0 0 20px #0af;z-index:1000021;pointer-events:none;';
_ba(banner);
setTimeout(()=>{banner.style.transition='opacity 1s';banner.style.opacity='0';},1500);
setTimeout(()=>banner.remove(),2500);
let rising=setInterval(()=>{
floodLevel+=2.2;
floodEl.style.height=floodLevel+'px';
let floodY=innerHeight-floodLevel;
[...Eggs].forEach(o=>{if(o.y>floodY)rem(o);});
[...Babies].forEach(o=>{if(o.y>floodY-10){if(o.infected||o._zombie)_unlockAch('chickenstars');rem(o);}});[...BabySwans].forEach(o=>{if(o.y>floodY-10)rem(o);});[...Aliens].forEach(o=>{if(o.y>floodY-10)remAlien(o,true);});
if(floodLevel>=innerHeight*0.45){
clearInterval(rising);
let receding=setInterval(()=>{
floodLevel-=3;
floodEl.style.height=_mx(0,floodLevel)+'px';
if(floodLevel<=0){clearInterval(receding);floodEl.remove();floodEl=null;floodActive=false;}
},40);
}
},40);
}
document.addEventListener("touchstart",e=>{if(e.touches.length===2){if(BEACON?.el){BEACON.el.remove();BEACON=null}if(BOMB){clearInterval(BOMB_TIMER);if(BOMB_EL)BOMB_EL.remove();BOMB=false}if(BLACKHOLE?.el){if(BLACKHOLE.pInterval)clearInterval(BLACKHOLE.pInterval);BLACKHOLE.el.remove();BLACKHOLE=null}if(window._tornadoActive){clearInterval(window._tornadoActive);window._tornadoActive=null;}if(window._tornadoEl){window._tornadoEl.remove();window._tornadoEl=null;}}});
document.addEventListener('keydown',e=>{
if(e.key==='e'||e.key==='E'){
if(BEACON?.el){BEACON.el.remove();BEACON=null;}
if(BOMB){clearInterval(BOMB_TIMER);if(BOMB_EL)BOMB_EL.remove();BOMB=false;}
if(BLACKHOLE?.el){if(BLACKHOLE.pInterval)clearInterval(BLACKHOLE.pInterval);BLACKHOLE.el.remove();BLACKHOLE=null;}
if(window._tornadoActive){clearInterval(window._tornadoActive);window._tornadoActive=null;if(window._tornadoEl)window._tornadoEl.remove();}
}
document.addEventListener('touchend',e=>{
if(e.touches.length===0&&e.changedTouches.length>=2){
if(window._tornadoActive){clearInterval(window._tornadoActive);window._tornadoActive=null;if(window._tornadoEl)window._tornadoEl.remove();}
if(BLACKHOLE?.el){if(BLACKHOLE.pInterval)clearInterval(BLACKHOLE.pInterval);BLACKHOLE.el.remove();BLACKHOLE=null;}
if(BEACON?.el){BEACON.el.remove();BEACON=null;}
if(BOMB){clearInterval(BOMB_TIMER);if(BOMB_EL)BOMB_EL.remove();BOMB=false;}
if(mode==='zeus'){mode=null;if(activeBtn){activeBtn.classList.remove('ck-active');activeBtn=null;}}
}
},{passive:true});
});
document.addEventListener("click",e=>{
if(_gi('ck-menu')&&_gi('ck-menu').style.display!=='none')return;
if(window._clickerActive)return;
if(window._radActive)return;
if(mode==="tornado"){
let tx=e.clientX,ty=e.clientY;
if(window._tornadoActive){clearInterval(window._tornadoActive);if(window._tornadoEl)window._tornadoEl.remove();}
let tel=_ce('div');tel.textContent='🌪️';
tel.style.cssText=`position:fixed;left:${tx}px;top:${ty}px;font-size:52px;z-index:1000018;pointer-events:none;transform:translate(-50%,-50%);`;
_ba(tel);window._tornadoEl=tel;
let _tornadoX=tx,_tornadoY=ty;
let _spd=3+_mr()*2;
let _tvx=(_mr()<0.5?1:-1)*_spd,_tvy=(_mr()<0.5?1:-1)*_spd;
window._tornadoActive=setInterval(()=>{
if(_mr()<0.02){_tvx=(_mr()-0.5)*_spd*2;_tvy=(_mr()-0.5)*_spd*2;}
_tornadoX+=_tvx*speed;_tornadoY+=_tvy*speed;
if(_tornadoX<40){_tornadoX=40;_tvx=_ma(_tvx);}
if(_tornadoX>innerWidth-40){_tornadoX=innerWidth-40;_tvx=-_ma(_tvx);}
if(_tornadoY<40){_tornadoY=40;_tvy=_ma(_tvy);}
if(_tornadoY>innerHeight-40){_tornadoY=innerHeight-40;_tvy=-_ma(_tvy);}
tel.style.left=_tornadoX+'px';tel.style.top=_tornadoY+'px';
[...Ducks,...Babies,...BabySwans,...Swans,...Foxes,...Snakes,...Wolves,...Bears,...Lions,...BabyDragons,...Eggs].forEach(o=>{
let d=Math.hypot(o.x-_tornadoX,o.y-_tornadoY);
if(d<160){
let angle=Math.atan2(o.y-_tornadoY,o.x-_tornadoX)+_pi*0.7;
let force=(160-d)/12;
o.x+=Math.cos(angle)*force*speed;o.y+=Math.sin(angle)*force*speed;
o.x=_mx(10,_mn(innerWidth-10,o.x));o.y=_mx(10,_mn(innerHeight-10,o.y));
o.el.style.left=o.x+'px';o.el.style.top=o.y+'px';
}
});
},50);
setTimeout(()=>{clearInterval(window._tornadoActive);window._tornadoActive=null;tel.remove();},8000);
return;
}
if(mode==="rage"){
let rageables=[...Ducks,...Babies,...BabySwans,...Swans,...Dragons,...BabyDragons,...Foxes,...Snakes,...Wolves,...Bears,...Lions,...Eagles,...Bats,...Zombies,...BabyZombies,...Yetis,...Aliens];
let clicked=rageables.find(o=>dist({x:e.clientX,y:e.clientY},o)<30);
if(clicked&&!clicked.rage){
clicked.rage=true;if(clicked.type==='Wolf')_unlockAch('alpha');if(clicked.type==='Baby')_unlockAch('tempertantrum');if(clicked.type==='Swan'&&weather==='storm'&&window.speed===4)_unlockAch('flash');if(clicked.type==='Dragon'){_unlockAch('fahhhh');clicked._breathingFire=true;}
clicked.el.style.filter="drop-shadow(0 0 8px red) drop-shadow(0 0 16px orange)";
clicked.el.style.fontSize="28px";
let boom=_ce("div");boom.textContent="😡 RAGE!";
boom.style.cssText="position:fixed;top:45%;left:50%;transform:translate(-50%,-50%);font-size:42px;font-weight:bold;color:red;text-shadow:0 0 30px red,0 0 60px orange;z-index:1000012;pointer-events:none;transition:opacity 1s ease,transform 1s ease;";
_ba(boom);_raf(()=>{boom.style.transform="translate(-50%,-60%) scale(1.3)";});
setTimeout(()=>boom.style.opacity="0",1200);setTimeout(()=>boom.remove(),2200);
}
return;
}
if(mode==="zeus"){
let targets=[...Ducks,...Babies,...BabySwans,...Swans,...Foxes,...Snakes,...Wolves,...Bears,...Lions,...Eagles,...Bats,...Zombies,...BabyZombies,...Yetis,...Dragons,...BabyDragons,...Eggs,...Aliens];
let first=targets.find(o=>Math.hypot(o.x-e.clientX,o.y-e.clientY)<35);
if(!first)return;
function _zeusStrike(o,remaining,prev){
if(!o||remaining<0)return;
let ring=_ce('div');
ring.style.cssText=`position:fixed;left:${o.x}px;top:${o.y}px;width:20px;height:20px;border-radius:50%;background:rgba(255,255,100,0.9);z-index:1000025;pointer-events:none;transform:translate(-50%,-50%) scale(1);transition:transform 0.3s ease-out,opacity 0.3s ease-out;box-shadow:0 0 30px 15px rgba(255,220,0,0.8),0 0 60px 30px rgba(255,180,0,0.4);`;
_ba(ring);
_raf(()=>{ring.style.transform='translate(-50%,-50%) scale(8)';ring.style.opacity='0';});
setTimeout(()=>ring.remove(),350);
for(let i=0;i<6;i++){
let b=_ce('div');b.textContent='⚡';
let a=(i/6)*_pi*2;
b.style.cssText=`position:fixed;left:${o.x}px;top:${o.y}px;font-size:22px;z-index:1000026;pointer-events:none;transform:translate(-50%,-50%);transition:left 0.3s ease-out,top 0.3s ease-out,opacity 0.3s;`;
_ba(b);
_raf(()=>{b.style.left=(o.x+Math.cos(a)*80)+'px';b.style.top=(o.y+Math.sin(a)*80)+'px';b.style.opacity='0';});
setTimeout(()=>b.remove(),350);
}
let flash=_ce('div');
flash.style.cssText='position:fixed;inset:0;background:rgba(255,255,150,0.25);z-index:999995;pointer-events:none;transition:opacity 0.2s;';
_ba(flash);setTimeout(()=>{flash.style.opacity='0';setTimeout(()=>flash.remove(),250);},80);
o.el.style.filter='brightness(5) saturate(0)';
setTimeout(()=>{o.el.style.filter='';if(o.type==='Dragon'||o.type==='BabyDragon')_unlockAch('fahhhh');if(o.type!=='Dragon'&&o.type!=='DragonEgg')rem(o);},200);
if(remaining>0){
let alive=new Set([...Ducks,...Babies,...BabySwans,...Swans,...Foxes,...Snakes,...Wolves,...Bears,...Lions,...Eagles,...Bats,...Zombies,...BabyZombies,...Yetis,...Dragons,...BabyDragons,...Eggs,...Aliens]);
let nearby=targets.filter(t=>t!==o&&t!==prev&&alive.has(t)&&Math.hypot(t.x-o.x,t.y-o.y)<220);
nearby.sort((a,b)=>Math.hypot(a.x-o.x,a.y-o.y)-Math.hypot(b.x-o.x,b.y-o.y));
if(nearby[0])setTimeout(()=>_zeusStrike(nearby[0],remaining-1,o),180);
}
}
if(window._tornadoActive&&window._tornadoEl){let tx=parseFloat(window._tornadoEl.style.left),ty=parseFloat(window._tornadoEl.style.top);if(Math.hypot(first.x-tx,first.y-ty)<160)_unlockAch('hyperpigmentation');}
_zeusStrike(first,49,null);
return;
}
if(mode==="magnet"){
let mx=e.clientX,my=e.clientY;
let magEl=_ce('div');magEl.textContent='🧲';
magEl.style.cssText=`position:fixed;left:${mx}px;top:${my}px;font-size:44px;z-index:1000030;pointer-events:none;transform:translate(-50%,-50%);filter:drop-shadow(0 0 15px #4af) drop-shadow(0 0 30px #08f);transition:transform 0.3s,opacity 0.3s;`;
_ba(magEl);
let magEnd=Date.now()+3000;
let magInt=setInterval(()=>{
if(Date.now()>magEnd){clearInterval(magInt);magEl.style.opacity='0';setTimeout(()=>magEl.remove(),300);return;}
let all=[...Ducks,...Babies,...BabySwans,...Swans,...Foxes,...Snakes,...Wolves,...Bears,...Lions,...Eagles,...Bats,...Zombies,...Dragons,...BabyDragons,...Eggs,...Aliens];
all.forEach(o=>{
let dx=mx-o.x,dy=my-o.y,d=Math.hypot(dx,dy);
if(d>5){let f=_mn(8,200/d);o.x+=dx/d*f;o.y+=dy/d*f;o.el.style.left=o.x+'px';o.el.style.top=o.y+'px';}
});
},30);
_unlockAch('magnetmaster');
return;
}
if(mode==="plague"){
let px=e.clientX,py=e.clientY;
let cloud=_ce('div');cloud.textContent='☁️💀';
cloud.style.cssText=`position:fixed;left:${px}px;top:${py}px;font-size:48px;z-index:1000032;pointer-events:none;transform:translate(-50%,-50%);transition:transform 1s,opacity 1s;filter:drop-shadow(0 0 12px lime);`;
_ba(cloud);
let ring=_ce('div');
ring.style.cssText=`position:fixed;left:${px}px;top:${py}px;width:160px;height:160px;border-radius:50%;border:2px solid rgba(100,255,100,0.5);background:rgba(100,255,100,0.06);transform:translate(-50%,-50%);z-index:1000031;pointer-events:none;transition:transform 0.5s,opacity 0.8s;`;
_ba(ring);
[...Ducks,...Babies,...BabySwans,...Swans,...Foxes,...Snakes,...Wolves,...Bears,...Lions,...Eagles,...Bats].forEach(o=>{
if(Math.hypot(o.x-px,o.y-py)<80)infect(o,window.virusType||'normal');
});
setTimeout(()=>{cloud.style.opacity='0';cloud.style.transform='translate(-50%,-50%) scale(1.5)';ring.style.opacity='0';ring.style.transform='translate(-50%,-50%) scale(2)';setTimeout(()=>{cloud.remove();ring.remove();},800);},600);
_unlockAch('plaguedoctor');return;
}
if(mode==="shockwave"){
let sx=e.clientX,sy=e.clientY;
let ring=_ce('div');
ring.style.cssText=`position:fixed;left:${sx}px;top:${sy}px;width:20px;height:20px;border-radius:50%;border:3px solid rgba(255,100,50,0.9);background:rgba(255,80,30,0.15);transform:translate(-50%,-50%);z-index:1000033;pointer-events:none;transition:width .4s ease-out,height .4s ease-out,opacity .4s ease-out;`;
_ba(ring);
let icon=_ce('div');icon.textContent='💥';
icon.style.cssText=`position:fixed;left:${sx}px;top:${sy}px;font-size:52px;z-index:1000034;pointer-events:none;transform:translate(-50%,-50%);transition:transform .3s ease-out,opacity .3s ease-out;`;
_ba(icon);
_raf(()=>{ring.style.width='320px';ring.style.height='320px';ring.style.opacity='0';icon.style.transform='translate(-50%,-50%) scale(1.6)';icon.style.opacity='0';});
setTimeout(()=>{ring.remove();icon.remove();},450);
let all=[...Ducks,...Babies,...BabySwans,...Swans,...Foxes,...Snakes,...Wolves,...Bears,...Lions,...Eagles,...Bats,...Zombies,...Dragons,...BabyDragons,...Aliens];
let _shockCount=all.filter(o=>{let dx=o.x-sx,dy=o.y-sy;return Math.hypot(dx,dy)<160;}).length;
all.forEach(o=>{
let dx=o.x-sx,dy=o.y-sy,d=Math.hypot(dx,dy);
if(d<160&&d>0){
let force=_mx(40,120-d);
o.x+=dx/d*force;o.y+=dy/d*force;
o.x=_mx(20,_mn(innerWidth-20,o.x));
o.y=_mx(20,_mn(innerHeight-20,o.y));
o.el.style.left=o.x+'px';o.el.style.top=o.y+'px';
}
});
_unlockAch('shockwaved');
if(_shockCount>=15)_unlockAch('shockwavemaster');
return;
}
if(mode==="sleep"){
let targets=[...Ducks,...Babies,...BabySwans,...Swans,...Foxes,...Snakes,...Wolves,...Bears,...Lions,...Dragons,...BabyDragons];
let clicked=targets.find(o=>dist({x:e.clientX,y:e.clientY},o)<30);
if(clicked&&!clicked._sleeping){
clicked._sleeping=true;
clicked._savedSpeed=clicked.s;
clicked.s=0;
let zzz=_ce('div');zzz.textContent='💤';
zzz.style.cssText=`position:fixed;left:${clicked.x+12}px;top:${clicked.y-10}px;font-size:14px;z-index:1000031;pointer-events:none;animation:zzFloat 1.2s ease-in-out infinite;`;
if(!_gi('zz-style')){let st=_ce('style');st.id='zz-style';st.textContent='@keyframes zzFloat{0%,100%{transform:translateY(0) scale(1);opacity:0.9}50%{transform:translateY(-8px) scale(1.1);opacity:0.6}}';document.head.appendChild(st);}
_ba(zzz);
clicked._zzzEl=zzz;
clicked.el.style.filter='brightness(0.6) saturate(0.5)';
setTimeout(()=>{
clicked._sleeping=false;clicked.s=clicked._savedSpeed;
if(clicked._zzzEl){clicked._zzzEl.remove();clicked._zzzEl=null;}
clicked.el.style.filter='';
},6000);
_unlockAch('bedtime');
}
return;
}
if(mode==="egg"){
let ex=e.clientX,ey=e.clientY;
let _et=window.eggType||'duck';
if(_et==='dragon'){let de=spawn(DragonEggs,'🥚',ex,ey,0,22,'DragonEgg');de.el.style.filter='sepia(1) saturate(3) hue-rotate(80deg) brightness(0.6) drop-shadow(0 0 8px purple) drop-shadow(0 0 4px violet)';return;}
if(_et!=='duck')_unlockAch('notaduck');
let EGG_TINTS={'duck':'','swan':'sepia(0.3) saturate(2) hue-rotate(180deg)','fox':'sepia(0.6) saturate(3) hue-rotate(10deg)','snake':'sepia(0.4) saturate(4) hue-rotate(80deg)','wolf':'brightness(0.7) saturate(0.3)','bear':'sepia(0.8) saturate(2) hue-rotate(330deg)','lion':'sepia(0.5) saturate(3) hue-rotate(40deg)','eagle':'sepia(0.6) saturate(2) hue-rotate(20deg)','bat':'sepia(0.3) saturate(2) hue-rotate(260deg) brightness(0.7)'};
let egg=spawn(Eggs,'🥚',ex,ey,0,20,"Egg");
egg.hatchType=_et;
if(EGG_TINTS[_et])egg.el.style.filter=EGG_TINTS[_et];
let sparkles=['✨','⭐','💛'];
sparkles.forEach((s,i)=>{
let sp=_ce('div');sp.textContent=s;
let a=_mr()*_pi*2,d=20+_mr()*25;
sp.style.cssText=`position:fixed;left:${ex}px;top:${ey}px;font-size:12px;z-index:1000020;pointer-events:none;transition:transform .5s ease,opacity .5s ease;transform:translate(-50%,-50%);`;
_ba(sp);
_raf(()=>{sp.style.transform=`translate(calc(-50% + ${Math.cos(a)*d}px),calc(-50% + ${Math.sin(a)*d}px))`;sp.style.opacity='0';});
setTimeout(()=>sp.remove(),550);
});
}
if(mode==="pin"){
if(BEACON?.el)BEACON.el.remove();
if(!_gi('dl-beacon-style')){
let bs=_ce('style');bs.id='dl-beacon-style';
bs.textContent=`
@keyframes beaconPulse{0%{transform:translate(-50%,-50%) scale(1);opacity:0.7}100%{transform:translate(-50%,-50%) scale(2.8);opacity:0}}
@keyframes beaconFloat{0%,100%{transform:translateX(-50%) translateY(0px)}50%{transform:translateX(-50%) translateY(-6px)}}
@keyframes beaconBeam{0%,100%{opacity:0.5;height:40px}50%{opacity:1;height:55px}}
`;
document.head.appendChild(bs);
}
let bx=e.clientX,by=e.clientY;
let wrap=_ce('div');
wrap.style.cssText=`position:fixed;left:${bx}px;top:${by}px;pointer-events:none;z-index:999999;`;
for(let i=0;i<3;i++){
let ring=_ce('div');
ring.style.cssText=`position:absolute;width:36px;height:36px;border-radius:50%;border:2.5px solid rgba(100,160,255,0.7);transform:translate(-50%,-50%);animation:beaconPulse 2s ease-out ${i*0.65}s infinite;pointer-events:none;`;
wrap.appendChild(ring);
}
let glow=_ce('div');
glow.style.cssText='position:absolute;width:28px;height:28px;border-radius:50%;background:radial-gradient(circle,rgba(120,180,255,0.45),transparent);transform:translate(-50%,-50%);pointer-events:none;';
wrap.appendChild(glow);
let beam=_ce('div');
beam.style.cssText='position:absolute;width:3px;background:linear-gradient(to top,rgba(100,160,255,0.7),transparent);border-radius:3px;bottom:10px;left:50%;transform:translateX(-50%);animation:beaconBeam 1.5s ease-in-out infinite;pointer-events:none;';
wrap.appendChild(beam);
let pin=_ce('div');
pin.style.cssText='position:absolute;font-size:28px;transform:translateX(-50%);bottom:6px;left:50%;animation:beaconFloat 2s ease-in-out infinite;filter:drop-shadow(0 4px 8px rgba(80,120,255,0.5));pointer-events:none;';
pin.textContent='📍';
wrap.appendChild(pin);
_ba(wrap);
BEACON={x:bx,y:by,el:wrap};
}
if(mode==="bomb"&&!BOMB){
BOMB=true;let t=5;
if(!_gi('dl-bomb-style')){
let bs=_ce('style');bs.id='dl-bomb-style';
bs.textContent=`
@keyframes bombPulse{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.18)}}
@keyframes bombShake{0%,100%{transform:translate(calc(-50% + 0px),-50%)}20%{transform:translate(calc(-50% + 6px),-50%)}40%{transform:translate(calc(-50% - 6px),-50%)}60%{transform:translate(calc(-50% + 4px),-50%)}80%{transform:translate(calc(-50% - 4px),-50%)}}
@keyframes flashRed{0%,100%{background:transparent}50%{background:rgba(255,0,0,0.08)}}
`;
document.head.appendChild(bs);
}
let bombOverlay=_ce('div');
bombOverlay.style.cssText='position:fixed;inset:0;z-index:1000003;pointer-events:none;animation:flashRed 1s ease-in-out infinite;';
_ba(bombOverlay);
BOMB_EL=_ce('div');
BOMB_EL.style.cssText=`position:fixed;left:${innerWidth/2}px;top:${innerHeight/2}px;z-index:1000005;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;pointer-events:none;`;
let bombEmoji=_ce('div');
bombEmoji.textContent='💣';
bombEmoji.style.cssText='font-size:72px;animation:bombPulse 0.6s ease-in-out infinite;filter:drop-shadow(0 0 30px red) drop-shadow(0 0 60px orange);';
let bombCount=_ce('div');
bombCount.textContent=t;
bombCount.style.cssText=`font-family:'Nunito',sans-serif;font-size:80px;font-weight:bold;color:#fff;line-height:1;text-shadow:0 0 40px red,0 0 80px red,0 0 120px orange;animation:bombShake 0.3s ease-in-out infinite;`;
let bombLabel=_ce('div');
bombLabel.textContent='STAND BACK';
bombLabel.style.cssText="font-family:'Nunito',sans-serif;font-size:16px;color:rgba(255,100,50,0.9);letter-spacing:3px;text-shadow:0 0 10px red;";
BOMB_EL.appendChild(bombEmoji);BOMB_EL.appendChild(bombCount);BOMB_EL.appendChild(bombLabel);
_ba(BOMB_EL);
BOMB_TIMER=setInterval(()=>{
t--;bombCount.textContent=t;
let intensity=1+(5-t)*0.15;
bombEmoji.style.filter=`drop-shadow(0 0 ${30*intensity}px red) drop-shadow(0 0 ${60*intensity}px orange)`;
bombEmoji.style.animationDuration=(0.6-t*0.08)+'s';
bombOverlay.style.animationDuration=(1-t*0.12)+'s';
if(t<=0){
clearInterval(BOMB_TIMER);
let x=innerWidth/2,y=innerHeight/2;
if(BOMB_EL)BOMB_EL.remove();
if(bombOverlay)bombOverlay.remove();
for(let i=0;i<4;i++){
setTimeout(()=>{
let wave=_ce('div');
wave.style.cssText=`position:fixed;left:${x}px;top:${y}px;width:20px;height:20px;border-radius:50%;background:radial-gradient(circle,rgba(255,${200-i*40},0,0.9),transparent);z-index:1000006;pointer-events:none;transform:translate(-50%,-50%);transition:all ${0.5+i*0.15}s ease-out;`;
_ba(wave);
_raf(()=>{wave.style.width=(500+i*200)+'px';wave.style.height=(500+i*200)+'px';wave.style.opacity='0';});
setTimeout(()=>wave.remove(),700+i*150);
let boom=_ce('div');boom.textContent='💥';
boom.style.cssText=`position:fixed;left:${x+(Math.random()-0.5)*60*i}px;top:${y+(Math.random()-0.5)*60*i}px;font-size:${40+i*20}px;z-index:1000007;pointer-events:none;transform:translate(-50%,-50%);transition:transform .5s ease-out,opacity .5s ease-out;`;
_ba(boom);_raf(()=>{boom.style.transform='translate(-50%,-50%) scale(4)';boom.style.opacity='0';});
setTimeout(()=>boom.remove(),500);
},i*120);
}
let flash=_ce('div');
flash.style.cssText='position:fixed;inset:0;background:rgba(255,255,255,0.8);z-index:1000008;pointer-events:none;transition:opacity 0.6s ease;';
_ba(flash);_raf(()=>flash.style.opacity='0');
setTimeout(()=>flash.remove(),600);
wipe();BOMB=false;
}
},1000);
}
if(mode==="blackhole"&&!BLACKHOLE){
if(!_gi('dl-bh-style')){
let bhs=_ce('style');bhs.id='dl-bh-style';
bhs.textContent=`
@keyframes bhSpin{from{transform:translate(-50%,-50%) rotate(0deg)}to{transform:translate(-50%,-50%) rotate(360deg)}}
@keyframes bhPulse{0%,100%{opacity:0.7}50%{opacity:1}}
@keyframes bhRing{0%{transform:translate(-50%,-50%) scale(1);opacity:0.6}100%{transform:translate(-50%,-50%) scale(2.2);opacity:0}}
`;
document.head.appendChild(bhs);
}
let cx=e.clientX,cy=e.clientY;
let size=50;
let wrap=_ce('div');
wrap.style.cssText=`position:fixed;left:${cx}px;top:${cy}px;width:0;height:0;z-index:999998;pointer-events:none;`;
_ba(wrap);
for(let i=0;i<3;i++){
let r=_ce('div');
r.style.cssText=`position:absolute;width:120px;height:120px;border-radius:50%;border:2px solid rgba(150,50,255,${0.4-i*0.1});transform:translate(-50%,-50%);animation:bhRing 1.5s ease-out ${i*0.5}s infinite;pointer-events:none;`;
wrap.appendChild(r);
}
let swirl=_ce('div');
swirl.style.cssText=`position:absolute;width:${size*2.2}px;height:${size*2.2}px;border-radius:50%;background:conic-gradient(from 0deg,rgba(80,0,180,0.9),rgba(0,0,0,1),rgba(120,0,255,0.7),rgba(0,0,0,1),rgba(80,0,180,0.9));transform:translate(-50%,-50%);animation:bhSpin 1.2s linear infinite;pointer-events:none;`;
wrap.appendChild(swirl);
let core=_ce('div');
core.style.cssText=`position:absolute;width:${size}px;height:${size}px;border-radius:50%;background:radial-gradient(circle,#000 60%,rgba(80,0,180,0.8));transform:translate(-50%,-50%);animation:bhPulse 2s ease-in-out infinite;box-shadow:0 0 30px 10px rgba(100,0,255,0.6),inset 0 0 20px rgba(0,0,0,1);pointer-events:none;`;
wrap.appendChild(core);
let particles=[];
let pInterval=setInterval(()=>{
if(!BLACKHOLE)return clearInterval(pInterval);
let p=_ce('div');
let angle=_mr()*_pi*2;
let r2=BLACKHOLE.size*1.8+_mr()*60;
p.style.cssText=`position:absolute;width:3px;height:3px;border-radius:50%;background:rgba(${150+Math.random()*100},${Math.random()*50},255,0.9);transform:translate(-50%,-50%);pointer-events:none;left:${Math.cos(angle)*r2}px;top:${Math.sin(angle)*r2}px;transition:left 0.6s ease-in,top 0.6s ease-in,opacity 0.6s ease-in;`;
wrap.appendChild(p);
setTimeout(()=>{p.style.left='0px';p.style.top='0px';p.style.opacity='0';},50);
setTimeout(()=>p.remove(),650);
},80);
let dragging=false,ddx=0,ddy=0;
wrap.style.pointerEvents='auto';
core.style.pointerEvents='auto';
swirl.style.pointerEvents='auto';
wrap.addEventListener('touchstart',ev=>{if(ev.touches.length===1){let t=ev.touches[0];dragging=true;ddx=t.clientX-BLACKHOLE.x;ddy=t.clientY-BLACKHOLE.y;}});
document.addEventListener('touchmove',ev=>{if(dragging&&ev.touches.length===1){let t=ev.touches[0];BLACKHOLE.x=t.clientX-ddx;BLACKHOLE.y=t.clientY-ddy;wrap.style.left=BLACKHOLE.x+'px';wrap.style.top=BLACKHOLE.y+'px';}});
document.addEventListener('touchend',()=>dragging=false);
wrap.addEventListener('mousedown',ev=>{dragging=true;ddx=ev.clientX-BLACKHOLE.x;ddy=ev.clientY-BLACKHOLE.y;});
document.addEventListener('mousemove',ev=>{if(dragging){BLACKHOLE.x=ev.clientX-ddx;BLACKHOLE.y=ev.clientY-ddy;wrap.style.left=BLACKHOLE.x+'px';wrap.style.top=BLACKHOLE.y+'px';}});
document.addEventListener('mouseup',()=>dragging=false);
BLACKHOLE={x:cx,y:cy,el:wrap,swirl,core,size,pInterval};
}
});
var _eggPopover=null;
var _virusPopover=null;
var _virusBtnRef=null;
window.virusType='normal';
const VIRUS_TYPES=[
{type:'normal', emoji:'🦠', label:'Normal', desc:'Standard spread & death'},
{type:'zombie', emoji:'🧟', label:'Zombie', desc:'Infected become zombies'},
{type:'fast', emoji:'⚡', label:'Fast', desc:'Rapid spread'},
{type:'vaccine', emoji:'💉', label:'Vaccine', desc:'Click to immunise'},
];
function dismissVirusPopover(){
if(_virusPopover){_virusPopover.remove();_virusPopover=null;}
}
function mkVirusBtn(){
let b=_ce('div');b.className='ck-btn';
let icon=_ce('div');icon.className='ck-icon';icon.style.background='rgba(0,80,20,0.7)';icon.textContent='🦠';
let lbl=_ce('div');lbl.className='ck-label';lbl.textContent='Disease';
b.appendChild(icon);b.appendChild(lbl);
_virusBtnRef=b;
function openVirusPopover(ev){
ev.stopPropagation();
if(_virusPopover){dismissVirusPopover();return;}
let pop=_ce('div');pop.className='ck-egg-pop';
pop.style.cssText='position:fixed;background:rgba(22,24,42,0.98);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:8px 6px;box-shadow:0 4px 24px rgba(0,0,0,0.5);z-index:1000030;min-width:160px;';
let title=_ce('div');title.className='ck-egg-pop-title';title.textContent='Virus Type';
title.style.cssText='font-size:11px;font-weight:900;color:rgba(255,255,255,0.35);letter-spacing:.06em;text-transform:uppercase;padding:2px 8px 6px;';
pop.appendChild(title);
VIRUS_TYPES.forEach(cfg=>{
let row=_ce('div');row.className='ck-egg-row';
if(cfg.type===window.virusType)row.classList.add('ck-egg-sel');
row.style.cssText='display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:9px;cursor:pointer;';
let em=_ce('span');em.textContent=cfg.emoji;em.style.fontSize='18px';
let tx=_ce('span');tx.style.cssText='font-size:12px;font-weight:700;color:rgba(255,255,255,0.8);';tx.textContent=cfg.label;
row.appendChild(em);row.appendChild(tx);
const pick=pev=>{
pev.stopPropagation();
window.virusType=cfg.type;
icon.textContent=cfg.emoji;
lbl.textContent=cfg.label;
pop.querySelectorAll('.ck-egg-row').forEach(r=>r.classList.remove('ck-egg-sel'));
row.classList.add('ck-egg-sel');
mode=cfg.type==='vaccine'?'vaccine':'disease';
if(activeBtn&&activeBtn!==b)activeBtn.classList.remove('ck-active');
b.classList.add('ck-active');activeBtn=b;
dismissVirusPopover();
};
row.addEventListener('click',pick);row.addEventListener('touchend',e=>{e.preventDefault();pick(e);});
pop.appendChild(row);
});
_virusPopover=pop;
_ba(pop);
let br=b.getBoundingClientRect();
pop.style.left=_mn(br.left,innerWidth-170)+'px';
pop.style.top=(br.top-pop.offsetHeight-8)+'px';
setTimeout(()=>document.addEventListener('click',dismissVirusPopover,{once:true}),400);
}
b.addEventListener('click',openVirusPopover);
b.addEventListener('touchend',e=>{e.preventDefault();openVirusPopover(e);});
return b;
}
window.eggType='duck';
const EGG_TYPES=[
{type:'duck', emoji:'🥚', label:'Duck', color:'rgba(120,90,0,0.7)'},
{type:'swan', emoji:'🦢', label:'Swan', color:'rgba(0,50,120,0.7)'},
{type:'fox', emoji:'🦊', label:'Fox', color:'rgba(120,50,0,0.7)'},
{type:'snake',emoji:'🐍', label:'Snake', color:'rgba(0,80,20,0.7)'},
{type:'wolf', emoji:'🐺', label:'Wolf', color:'rgba(40,40,80,0.7)'},
{type:'dragon',emoji:'🐉',label:'Dragon',color:'rgba(20,80,20,0.7)',secret:true},{type:'bear',emoji:'🐻',label:'Bear',color:'rgba(80,50,10,0.7)'},{type:'lion',emoji:'🦁',label:'Lion',color:'rgba(100,70,0,0.7)'},{type:'eagle',emoji:'🥚',label:'Eagle',color:'rgba(80,60,10,0.7)'},{type:'bat',emoji:'🥚',label:'Bat',color:'rgba(50,30,80,0.7)'},
];
(()=>{
let st=_ce('style');
st.textContent=`
@keyframes eggPopIn{from{opacity:0;transform:translateY(8px) scale(0.94)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes eggPopOut{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(8px) scale(0.94)}}
.ck-egg-pop{position:fixed;background:rgba(22,24,42,0.98);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-radius:18px;padding:8px 6px 6px;box-shadow:0 8px 32px rgba(0,0,0,0.5);border:1.5px solid rgba(255,255,255,0.08);z-index:1000040;display:flex;flex-direction:column;gap:3px;min-width:130px;}
.ck-egg-pop-title{font-size:9px;font-weight:900;color:rgba(255,255,255,0.3);letter-spacing:0.8px;text-transform:uppercase;font-family:'Nunito',sans-serif;padding:0 6px 4px;}
.ck-egg-row{display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:11px;cursor:pointer;font-family:'Nunito',sans-serif;-webkit-tap-highlight-color:transparent;}
.ck-egg-row:active{background:rgba(255,255,255,0.08);}
.ck-egg-row-icon{font-size:20px;width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.ck-egg-row-label{font-size:12px;font-weight:800;color:rgba(255,255,255,0.8);}
.ck-egg-row.ck-egg-sel{background:rgba(255,255,255,0.07);}
.ck-egg-row.ck-egg-sel .ck-egg-row-label::after{content:' ✓';color:rgba(255,255,255,0.4);}
`;
document.head.appendChild(st);
})();
function dismissEggPopover(){
if(!_eggPopover)return;
let p=_eggPopover;_eggPopover=null;
p.style.animation='eggPopOut 0.14s ease forwards';
setTimeout(()=>{if(p.parentNode)p.remove();},140);
}
function mkEggBtn(){
let b=_ce('div');b.className='ck-btn';
let icon=_ce('div');icon.className='ck-icon';icon.style.background='rgba(120,90,0,0.7)';icon.textContent='🥚';
let lbl=_ce('div');lbl.className='ck-label';lbl.textContent='Egg';
b.appendChild(icon);b.appendChild(lbl);
function openPopover(ev){
ev.stopPropagation();
if(_eggPopover){dismissEggPopover();return;}
let pop=_ce('div');pop.className='ck-egg-pop';
pop.style.animation='eggPopIn 0.18s cubic-bezier(.34,1.56,.64,1) forwards';
let title=_ce('div');title.className='ck-egg-pop-title';title.textContent='Egg Type';
pop.appendChild(title);
EGG_TYPES.filter(cfg=>!cfg.secret||window._achUnlocked&&window._achUnlocked.has('eyeofdragon')).forEach(cfg=>{
let row=_ce('div');
row.className='ck-egg-row'+(window.eggType===cfg.type?' ck-egg-sel':'');
let ri=_ce('div');ri.className='ck-egg-row-icon';ri.style.background=cfg.color;ri.textContent=cfg.emoji;
let rl=_ce('div');rl.className='ck-egg-row-label';rl.textContent=cfg.label;
row.appendChild(ri);row.appendChild(rl);
const pick=pev=>{
pev.stopPropagation();
window.eggType=cfg.type;
icon.textContent=cfg.emoji;
lbl.textContent=cfg.label;
pop.querySelectorAll('.ck-egg-row').forEach(r=>r.classList.remove('ck-egg-sel'));
row.classList.add('ck-egg-sel');
mode='egg';
if(activeBtn&&activeBtn!==b)activeBtn.classList.remove('ck-active');
b.classList.add('ck-active');activeBtn=b;
dismissEggPopover();
};
row.addEventListener('click',pick);
row.addEventListener('touchend',pev=>{pev.preventDefault();pev.stopPropagation();pick(pev);},{passive:false});
pop.appendChild(row);
});
_ba(pop);
_eggPopover=pop;
let br=b.getBoundingClientRect();
let pw=pop.offsetWidth||134,ph=pop.offsetHeight||230;
pop.style.left=_mn(_mx(6,br.left+br.width/2-pw/2),innerWidth-pw-6)+'px';
pop.style.top=_mx(6,br.top-ph-10)+'px';
setTimeout(()=>{
const away=aev=>{
if(!_eggPopover)return;
if(!_eggPopover.contains(aev.target)&&!b.contains(aev.target)){
dismissEggPopover();
document.removeEventListener('click',away,true);
document.removeEventListener('touchend',away,true);
}
};
document.addEventListener('click',away,true);
document.addEventListener('touchend',away,true);
},400);
}
b.addEventListener('click',ev=>{ev.stopPropagation();openPopover(ev);});
b.addEventListener('touchend',ev=>{ev.preventDefault();ev.stopPropagation();openPopover(ev);},{passive:false});
return b;
}
setInterval(()=>{ if(paused)return; let now=Date.now(); tickWeather(now);tickDayNight(now); let bm=weatherBreedMult(),hm=weatherHatchMult(); [...Ducks,...Babies,...Swans,...Dragons,...BabyDragons,...Foxes,...Snakes,...Wolves].filter(o=>o.rage).forEach(d=>{
let allTargets=[...Babies,...BabySwans,...Swans,...Foxes,...Snakes,...Wolves,...Eggs,...Ducks].filter(x=>x!==d);
if(allTargets.length){let t=allTargets.reduce((a,b)=>dist(d,a)<dist(d,b)?a:b);d.a=Math.atan2(t.y-d.y,t.x-d.x);if(dist(d,t)<HIT){rem(t);}}
move(d,3.2);
d.el.style.filter="drop-shadow(0 0 8px red) drop-shadow(0 0 16px orange)";
d.el.style.fontSize="28px";
if(_mr()<0.03){let spark=_ce("div");spark.textContent=["💢","🔥","‼️"][_mf(_mr()*3)];spark.style.cssText=`position:fixed;left:${d.x+Math.random()*30-15}px;top:${d.y+Math.random()*30-15}px;font-size:16px;z-index:1000007;pointer-events:none;transition:opacity .4s ease,transform .4s ease;`;_ba(spark);_raf(()=>{spark.style.opacity="0";spark.style.transform="translateY(-20px)"});setTimeout(()=>spark.remove(),400);}
});
Ducks.forEach(d=>{
if(!d.rage){
if(!BEACON){
let threats=[...Foxes,...Snakes,...Wolves,...Dragons,...Bears,...Lions,...Eagles].filter(p=>dist(d,p)<110);
if(threats.length){
let nearest=threats.reduce((a,b)=>dist(d,a)<dist(d,b)?a:b);
d.a=Math.atan2(d.y-nearest.y,d.x-nearest.x);
} else if(Bats.length){
let nearBat=Bats.filter(b=>!b._dead).reduce((a,b)=>dist(d,a)<dist(d,b)?a:b,null);
if(nearBat&&dist(d,nearBat)<150){
d.a=Math.atan2(nearBat.y-d.y,nearBat.x-d.x);
if(!d._peckCooldown)d._peckCooldown=0;
if(dist(d,nearBat)<HIT&&now>d._peckCooldown){
d._peckCooldown=now+1500;
let peck=_ce('div');peck.textContent='🦆💥';
peck.style.cssText=`position:fixed;left:${d.x}px;top:${d.y}px;font-size:16px;z-index:1000009;pointer-events:none;transform:translate(-50%,-50%);transition:transform .4s ease,opacity .4s ease;`;
_ba(peck);
_raf(()=>{peck.style.transform='translate(-50%,-70%) scale(1.4)';peck.style.opacity='0';});
setTimeout(()=>peck.remove(),450);
rem(nearBat);_unlockAch('duckdefense');
}
}
}
}
move(d,dayDuckMult());if(now-d.born>17000/bm*daySpawnMult()/speed){let newEgg=spawn(Eggs,"🥚",d.x,d.y,0,20,"Egg");
newEgg.el.style.animation='eggSpawnPop 0.35s cubic-bezier(.34,1.56,.64,1) forwards';
setTimeout(()=>{newEgg.el.style.animation='';newEgg.el.style.transform='';},380);
let heart=_ce('div');heart.textContent='🥚';
heart.style.cssText=`position:fixed;left:${d.x}px;top:${d.y}px;font-size:16px;z-index:1000019;pointer-events:none;transition:transform .6s ease,opacity .6s ease;`;
_ba(heart);
_raf(()=>{heart.style.transform='translateY(-35px) scale(1.3)';heart.style.opacity='0';});
setTimeout(()=>heart.remove(),650);
d.born=now}
}
}); Babies.forEach(b=>{
if(!BEACON){
let threats=[...Foxes,...Wolves,...Eagles,...Bears].filter(p=>dist(b,p)<110);
if(threats.length){let nearest=threats.reduce((a,p)=>dist(b,a)<dist(b,p)?a:p);b.a=Math.atan2(b.y-nearest.y,b.x-nearest.x);}
}
move(b,dayDuckMult());if(now-b.born>25000*daySpawnMult()/speed){spawn(Ducks,"🦆",b.x,b.y,1.5,24,"Duck");rem(b)}});BabySwans.forEach(bs=>{
if(!BEACON){
let threats=[...Foxes,...Wolves,...Snakes].filter(p=>dist(bs,p)<90);
if(threats.length){let nearest=threats.reduce((a,p)=>dist(bs,a)<dist(bs,p)?a:p);bs.a=Math.atan2(bs.y-nearest.y,bs.x-nearest.x);}
}
move(bs,dayDuckMult());if(now-bs.born>25000*daySpawnMult()/speed){spawn(Swans,"🦢",bs.x,bs.y,2.2,26,"Swan");rem(bs)}});
if(now>nextDragon){nextDragon=now+10000;if(_mr()<0.01){let dx=PAD+_mr()*(innerWidth-PAD*2);let dy=PAD+_mr()*(innerHeight-PAD*2);let de=spawn(DragonEggs,'🥚',dx,dy,0,22,'DragonEgg');de.el.style.filter='sepia(1) saturate(3) hue-rotate(80deg) brightness(0.6) drop-shadow(0 0 8px purple) drop-shadow(0 0 4px violet)';_unlockAch('endofbeginning');}}
DragonEggs.forEach(de=>{if(now-de.born>20000/speed){let bd=spawn(BabyDragons,'🐲',de.x,de.y,1.4,20,'BabyDragon');bd.el.style.filter='drop-shadow(0 0 6px orange)';rem(de);}});
BabyDragons.forEach(bd=>{move(bd,dayDuckMult());if(now-bd.born>30000/speed){let d=spawn(Dragons,'🐉',bd.x,bd.y,1.8,28,'Dragon');d.el.style.filter='drop-shadow(0 0 10px red) drop-shadow(0 0 6px orange)';_unlockAch('theend');rem(bd);}});
Dragons.forEach(dr=>{
if(dr.rage){
if(!dr._fireInterval){
dr._fireInterval=setInterval(()=>{
if(!dr.rage){clearInterval(dr._fireInterval);dr._fireInterval=null;return;}
let angles=[0,_pi/3,2*_pi/3,_pi,4*_pi/3,5*_pi/3];
angles.forEach(a=>{
let fire=_ce('div');fire.textContent='🔥';
fire.style.cssText=`position:fixed;left:${dr.x}px;top:${dr.y}px;font-size:20px;z-index:1000020;pointer-events:none;transition:left .5s ease-out,top .5s ease-out,opacity .5s ease-out;`;
_ba(fire);
let tx=dr.x+Math.cos(a)*120;let ty=dr.y+Math.sin(a)*120;
_raf(()=>{fire.style.left=tx+'px';fire.style.top=ty+'px';fire.style.opacity='0';});
setTimeout(()=>{
[...Ducks,...Babies,...BabySwans,...Swans,...BabyDragons,...Foxes,...Snakes,...Wolves].forEach(o=>{if(Math.hypot(o.x-tx,o.y-ty)<40)rem(o);});
fire.remove();
},500);
});
},600);
}
}
move(dr,dayPredMult()*1.2);
}); Eggs.forEach(e=>{
let age=(now-e.born)/(15000*hm*daySpawnMult()/speed);
if(age>0.6&&!e.wobbling){
e.wobbling=true;
e.el.style.animation='eggWobble 0.5s ease-in-out infinite';
e.el.style.fontSize='22px';
e._baseTint=e.el.style.filter||'';
e._glowPhase=0;
}
if(e.wobbling&&e._glowPhase!==undefined){
e._glowPhase+=0.1;
let _gt=0.5+0.5*Math.sin(e._glowPhase);
let _gb=6+8*_gt,_ga=0.5+0.4*_gt,_gg=_gt>0.5?` brightness(${1+0.1*_gt})`:'';
e.el.style.filter=(e._baseTint?e._baseTint+' ':'')+`drop-shadow(0 ${2+2*_gt}px ${_gb}px rgba(255,220,100,${_ga}))${_gg}`;
}
if(now-e.born>15000*hm*daySpawnMult()/speed){
let hx=e.x+11,hy=e.y+11;
['🥚','🥚','🥚'].forEach((_,i)=>{
let piece=_ce('div');piece.textContent='🥚';
let a=(i/3)*_pi*2+_mr()*0.5;
let d=25+_mr()*30;
piece.style.cssText=`position:fixed;left:${hx}px;top:${hy}px;font-size:14px;z-index:1000019;pointer-events:none;--hx:${Math.cos(a)*d}px;--hy:${Math.sin(a)*d}px;--hr:${(Math.random()-0.5)*180}deg;animation:hatchPiece 0.5s ease-out forwards;`;
_ba(piece);setTimeout(()=>piece.remove(),500);
});
let ring=_ce('div');
ring.style.cssText=`position:fixed;left:${hx}px;top:${hy}px;width:30px;height:30px;border-radius:50%;background:radial-gradient(circle,rgba(255,220,80,0.7),transparent);z-index:1000018;pointer-events:none;animation:hatchBurst 0.4s ease-out forwards;`;
_ba(ring);setTimeout(()=>ring.remove(),400);
let ht=e.hatchType||'duck';
let newborn;
if(ht==='swan'){newborn=spawn(BabySwans,"🦢",e.x,e.y,1.2,14,"BabySwan");}
else if(ht==='fox')newborn=spawn(Foxes,"🦊",e.x,e.y,1.4,24,"Fox");
else if(ht==='snake')newborn=spawn(Snakes,"🐍",e.x,e.y,1.3,24,"Snake");
else if(ht==='wolf')newborn=spawn(Wolves,"🐺",e.x,e.y,1.8,24,"Wolf");
else if(ht==='bear'){newborn=spawn(Bears,'🐻',e.x,e.y,1.3,26,'Bear');}
else if(ht==='lion'){newborn=spawn(Lions,'🦁',e.x,e.y,1.2,26,'Lion');}
else if(ht==='eagle'){newborn=spawn(Eagles,'🦅',e.x,e.y,1.8,24,'Eagle');}
else if(ht==='bat'){newborn=spawn(Bats,'🦇',e.x,e.y,1.4,22,'Bat');}
else{newborn=spawn(Babies,"🐥",e.x,e.y,1.2,18,"Baby");_unlockAch('firstlife');}
newborn.el.style.animation='eggSpawnPop 0.4s cubic-bezier(.34,1.56,.64,1) forwards';
setTimeout(()=>{newborn.el.style.animation='';newborn.el.style.transform='';},420);
rem(e);
}
}); if(now-start>40000){let isNight=dayPhase==="night";let predCooldown=isNight?90000:230000;if(now>nextFox&&Foxes.length<3){spawn(Foxes,"🦊",_mr()*innerWidth,_mr()*innerHeight,1.4,24,"Fox");nextFox=now+(predCooldown*2.5)}if(now>nextSnake&&Snakes.length<3){spawn(Snakes,"🐍",_mr()*innerWidth,_mr()*innerHeight,1.3,24,"Snake");nextSnake=now+(predCooldown*2.5)}if(now>nextWolf&&Wolves.length<2){spawn(Wolves,"🐺",_mr()*innerWidth,_mr()*innerHeight,1.8,24,"Wolf");nextWolf=now+(predCooldown*3.5)}
if(now>nextYetiCheck){nextYetiCheck=now+15000;if(Yetis.length<1&&_mr()<0.01){let yx=_mr()*innerWidth,yy=_mr()*innerHeight;let yi=spawn(Yetis,'🧊',yx,yy,0.9,30,'Yeti');yi._stomping=false;yi._stompCooldown=0;yi._hidden=false;yi._hideTimer=0;yi._frosted=[];_unlockAch('yetisighting');if(weather==='blizzard')_unlockAch('snowblind');}}
if(now>nextEagle&&Eagles.length<2){spawn(Eagles,'🦅',_mr()*innerWidth,_mr()*innerHeight*0.5,1.8,24,'Eagle');nextEagle=now+(predCooldown*4.0);}
if(now>nextBat&&Bats.length<3){spawn(Bats,'🦇',_mr()*innerWidth,_mr()*innerHeight,1.4,22,'Bat');nextBat=now+(predCooldown*3.5);}
if(now>nextBear&&Bears.length<2){spawn(Bears,'🐻',_mr()*innerWidth,_mr()*innerHeight,1.3,26,'Bear');nextBear=now+(predCooldown*4.0);}
if(now>nextLion&&Lions.length<2){spawn(Lions,'🦁',_mr()*innerWidth,_mr()*innerHeight,1.2,26,'Lion');nextLion=now+(predCooldown*6.5);}
} Foxes.forEach(f=>{
if(now-f.born>90000/speed){rem(f);return;}if(Babies.length){let t=Babies.reduce((a,b)=>dist(f,a)<dist(f,b)?a:b);f.a=Math.atan2(t.y-f.y,t.x-f.x);if(dist(f,t)<HIT)rem(t)}move(f,dayPredMult())}); Snakes.forEach(s=>{
if(now-s.born>90000/speed){rem(s);return;}if(Eggs.length){let t=Eggs.reduce((a,b)=>dist(s,a)<dist(s,b)?a:b);s.a=Math.atan2(t.y-s.y,t.x-s.x);if(dist(s,t)<HIT)rem(t)}move(s,dayPredMult())}); Wolves.forEach(w=>{
if(now-w.born>120000/speed){rem(w);return;}
if(!w.rage&&Ducks.length){
let t=Ducks.reduce((a,b)=>dist(w,a)<dist(w,b)?a:b);
w.a=Math.atan2(t.y-w.y,t.x-w.x);
if(dist(w,t)<HIT){
let howl=_ce('div');howl.textContent='🐺💨';
howl.style.cssText=`position:fixed;left:${w.x}px;top:${w.y}px;font-size:18px;z-index:1000020;pointer-events:none;transition:transform .5s ease,opacity .5s ease;`;
_ba(howl);
_raf(()=>{howl.style.transform='translateY(-30px)';howl.style.opacity='0';});
setTimeout(()=>howl.remove(),500);
rem(t);
}
}
if(!w.rage)move(w,dayPredMult());
});
Swans.forEach(sw=>{
let zombies=[...Ducks,...Babies,...BabySwans,...Foxes,...Snakes,...Wolves].filter(o=>o._zombie);
let predators=[...Foxes,...Snakes,...Wolves,...Bears,...Eagles].filter(o=>!o._zombie);
let targets=[...predators,...zombies];
if(targets.length){let t=targets.reduce((a,b)=>dist(sw,a)<dist(sw,b)?a:b);sw.a=Math.atan2(t.y-sw.y,t.x-sw.x);if(dist(sw,t)<HIT){if(t._zombie)_unlockAch('thatsmyboy');rem(t);}}
move(sw,dayDuckMult());
});
Bears.forEach(b=>{
if(now-b.born>150000/speed){rem(b);return;}
let targets=[...Ducks,...Foxes,...Babies].filter(o=>!o._zombie);
if(targets.length&&!b.rage){
let t=targets.reduce((a,c)=>dist(b,a)<dist(b,c)?a:c);
b.a=Math.atan2(t.y-b.y,t.x-b.x);
if(dist(b,t)<HIT){
let growl=_ce('div');growl.textContent='🐻💢';
growl.style.cssText=`position:fixed;left:${b.x}px;top:${b.y}px;font-size:16px;z-index:1000020;pointer-events:none;transition:transform .5s ease,opacity .5s ease;`;
_ba(growl);
_raf(()=>{growl.style.transform='translateY(-28px)';growl.style.opacity='0';});
setTimeout(()=>growl.remove(),500);
rem(t);_unlockAch('bearattack');
}
}
move(b,dayPredMult()*0.9);
});
Lions.forEach(li=>{
if(now-li.born>10000/speed){rem(li);return;}
if(!li._pounceTimer){li._pounceTimer=Date.now();li._pouncing=false;}
if(now-li._pounceTimer>6000&&!li._pouncing){
li._pouncing=true;li._pounceTimer=now;
li.el.style.filter='drop-shadow(0 0 10px gold)';
setTimeout(()=>{li._pouncing=false;li.el.style.filter='';},500);
}
let targets=[...Ducks,...Babies,...BabySwans,...Swans,...Foxes,...Snakes].filter(o=>!o._zombie);
if(targets.length&&!li.rage){
let t=targets.reduce((a,c)=>dist(li,a)<dist(li,c)?a:c);
li.a=Math.atan2(t.y-li.y,t.x-li.x);
if(dist(li,t)<HIT){
let roar=_ce('div');roar.textContent='🦁🔊';
roar.style.cssText=`position:fixed;left:${li.x}px;top:${li.y}px;font-size:16px;z-index:1000020;pointer-events:none;transition:transform .5s ease,opacity .5s ease;`;
_ba(roar);
_raf(()=>{roar.style.transform='translateY(-28px)';roar.style.opacity='0';});
setTimeout(()=>roar.remove(),500);
rem(t);_unlockAch('lionking');
}
}
move(li,dayPredMult()*(li._pouncing?2.0:0.9));
});
Eagles.forEach(eagle=>{
if(now-eagle.born>100000/speed){rem(eagle);return;}
if(!eagle._diveCooldown)eagle._diveCooldown=0;
if(Babies.length&&now>eagle._diveCooldown){
let t=Babies.reduce((a,b)=>dist(eagle,a)<dist(eagle,b)?a:b);
eagle.a=Math.atan2(t.y-eagle.y,t.x-eagle.x);
if(dist(eagle,t)<HIT){
let swoop=_ce('div');swoop.textContent='🦅💨';
swoop.style.cssText=`position:fixed;left:${eagle.x}px;top:${eagle.y}px;font-size:18px;z-index:1000009;pointer-events:none;transform:translate(-50%,-50%);`;
_ba(swoop);setTimeout(()=>swoop.remove(),500);
rem(t);eagle._diveCooldown=now+4000;eagle.a=_mr()*_pi*2;_unlockAch('eaglestrike');
}
} else {
if(!eagle._glideTimer||now>eagle._glideTimer){eagle.a=_mr()*_pi*2;eagle._glideTimer=now+2000;}
}
move(eagle,1.9);
});
Bats.forEach(bat=>{
if(now-bat.born>80000/speed){rem(bat);return;}
if(!bat._biteCooldown)bat._biteCooldown=0;
let btargets=[...Ducks,...Babies,...Swans,...BabySwans,...Foxes,...Wolves].filter(o=>!o._infected&&!o._zombie&&!o._immune);
if(btargets.length){
let t=btargets.reduce((a,b)=>dist(bat,a)<dist(bat,b)?a:b);
bat.a=Math.atan2(t.y-bat.y,t.x-bat.x);
if(dist(bat,t)<HIT&&now>bat._biteCooldown){
bat._biteCooldown=now+3000;
t._infected=true;t._infectedType='normal';t._infectedAt=now;
t.el.style.filter='saturate(0.4) sepia(0.5)';
let bite=_ce('div');bite.textContent='🦇💉';
bite.style.cssText=`position:fixed;left:${t.x}px;top:${t.y}px;font-size:16px;z-index:1000009;pointer-events:none;transform:translate(-50%,-50%);`;
_ba(bite);setTimeout(()=>bite.remove(),600);
_unlockAch('batbite');
}
}
move(bat,(dayPhase==='night'?1.6:dayPhase==='dusk'?1.2:0.8));
});
Yetis.forEach(yi=>{
if(paused)return;
let nearbyAll=[...Ducks,...Babies,...BabySwans,...Swans,...Foxes,...Wolves,...Bears,...Lions,...Eagles,...Bats].filter(o=>dist(yi,o)<80);
let shouldShow=yi._stomping||nearbyAll.length>0;
yi.el.style.opacity=shouldShow?'1':'0.08';
yi.el.style.pointerEvents=shouldShow?'':'none';
if(!yi._lastFrost||now-yi._lastFrost>600){
yi._lastFrost=now;
let ft=_ce('div');ft.textContent='❄️';
ft.style.cssText=`position:fixed;left:${yi.x}px;top:${yi.y}px;font-size:14px;z-index:999980;pointer-events:none;transform:translate(-50%,-50%);opacity:0.7;transition:opacity 4s linear;`;
_ba(ft);
_frostTrails.push({el:ft,x:yi.x,y:yi.y,born:now});
_raf(()=>ft.style.opacity='0');
setTimeout(()=>{ft.remove();let i=_frostTrails.findIndex(f=>f.el===ft);if(i>-1)_frostTrails.splice(i,1);},4000);
}
_frostTrails.forEach(ft=>{
[...Ducks,...Babies,...BabySwans,...Swans,...Foxes,...Wolves,...Bears,...Lions,...Eagles,...Bats].forEach(o=>{
if(dist({x:ft.x,y:ft.y},o)<22&&!o._frosted){
o._frosted=true;o._savedSpeed2=o.s;o.s*=0.35;
if(!window._frostHits)window._frostHits=0;window._frostHits++;
if(window._frostHits>=10)_unlockAch('frostbitten');
setTimeout(()=>{if(o&&!o._dead){o.s=o._savedSpeed2||o.s;o._frosted=false;}},3000);
}
});
});
if(!yi._stomping&&now>yi._stompCooldown){
let prey=[...Ducks,...Babies,...BabySwans,...Swans,...Foxes,...Wolves,...Bears,...Lions,...Eagles,...Bats];
if(prey.length){
let t=prey.reduce((a,b)=>dist(yi,a)<dist(yi,b)?a:b);
yi.a=Math.atan2(t.y-yi.y,t.x-yi.x);
if(dist(yi,t)<50){
yi._stomping=true;
yi.el.style.fontSize='44px';
yi.el.style.filter='drop-shadow(0 0 20px cyan) drop-shadow(0 0 40px #88eeff)';
let shockEl=_ce('div');
shockEl.style.cssText=`position:fixed;left:${yi.x}px;top:${yi.y}px;width:10px;height:10px;border-radius:50%;border:3px solid rgba(100,220,255,0.9);z-index:1000040;pointer-events:none;transform:translate(-50%,-50%);transition:width 0.5s,height 0.5s,opacity 0.5s;`;
_ba(shockEl);
_raf(()=>{shockEl.style.width='280px';shockEl.style.height='280px';shockEl.style.opacity='0';});
setTimeout(()=>shockEl.remove(),550);
let victims=[...prey].filter(o=>dist(yi,o)<140);
victims.forEach(o=>rem(o));
if(!window._yetiKills)window._yetiKills=0;window._yetiKills+=victims.length;
if(victims.length>=1)_unlockAch('yetistomp');
if(victims.length>=5)_unlockAch('yetirampage');
if(window._yetiKills>=10)_unlockAch('deepfreeze');
_unlockAch('yetisighting');
if(window._achUnlocked&&['yetisighting','yetistomp','yetirampage','deepfreeze','snowblind','yetichaser','frostbitten'].every(a=>window._achUnlocked.has(a)))_unlockAch('yetimaster');
setTimeout(()=>{
yi._stomping=false;
yi.el.style.fontSize='';
yi.el.style.filter='';
yi._stompCooldown=Date.now()+(12000+_mr()*8000);
yi._hideTimer=Date.now()+8000;
},800);
}
}
}
move(yi,0.9);
});
Zombies.forEach(z=>{
if(paused)return;
z.infected=false;
let prey=[...Ducks,...Babies,...BabySwans,...Swans,...Foxes,...Snakes,...Wolves,...Bears,...Lions,...Eagles,...Bats,...Dragons,...BabyDragons,...Aliens].filter(t=>!t._zombie&&!t.immune);
let eggPrey=[...Eggs].filter(e=>!e._zombie);
let allPrey=[...prey,...eggPrey];
if(allPrey.length){
let t=allPrey.reduce((a,b)=>dist(z,a)<dist(z,b)?a:b);
z.a=Math.atan2(t.y-z.y,t.x-z.x);
if(dist(z,t)<HIT){
if(t.type==='Egg'){
let bz=spawn(BabyZombies,'🧟',t.x,t.y,1.8,18,'BabyZombie');
bz._bornZombie=now;
bz.el.style.filter='brightness(0.7) sepia(0.5) hue-rotate(80deg)';
bz.el.style.fontSize='16px';
rem(t);
} else {
infect(t,'zombie');
}
}
}
move(z,1.2);
});
BabyZombies.forEach(bz=>{
if(paused)return;
bz.infected=false;
if(now-bz._bornZombie>15000/speed){
let gz=spawn(Zombies,'🧟',bz.x,bz.y,1.2,22,'Zombie');
gz._origEmoji='🧟';gz._origFilter='brightness(0.7) sepia(0.5) hue-rotate(80deg)';gz._origArray=null;
gz.el.style.filter='brightness(0.7) sepia(0.5) hue-rotate(80deg)';
gz.infected=false;gz._zombie=true;
rem(bz);return;
}
let bprey=[...Eggs,...Babies,...BabySwans].filter(t=>!t._zombie);
if(bprey.length){
let t=bprey.reduce((a,b)=>dist(bz,a)<dist(bz,b)?a:b);
bz.a=Math.atan2(t.y-bz.y,t.x-bz.x);
if(dist(bz,t)<HIT){
if(t.type==='Egg'){
let nbz=spawn(BabyZombies,'🧟',t.x,t.y,1.8,18,'BabyZombie');
nbz._bornZombie=now;nbz.el.style.filter='brightness(0.7) sepia(0.5) hue-rotate(80deg)';nbz.el.style.fontSize='16px';
rem(t);
} else {
infect(t,'zombie');
}
}
}
move(bz,1.8);
});
if(weather==='blizzard'){
if(_mr()<0.008&&Babies.length){
let v=Babies[_mf(_mr()*Babies.length)];
let fl=_ce('div');fl.textContent='❄️';
fl.style.cssText=`position:fixed;left:${v.x}px;top:${v.y}px;font-size:18px;z-index:1000010;pointer-events:none;transform:translate(-50%,-50%);transition:opacity 0.5s;`;
_ba(fl);setTimeout(()=>{fl.style.opacity='0';setTimeout(()=>fl.remove(),500);},400);
rem(v);if(!window._blizzardKills)window._blizzardKills=0;window._blizzardKills++;
if(window._blizzardKills>=10)_unlockAch('winterkill');
}
if(_mr()<0.005){let ne=Eggs.filter(e=>e.type!=='dragon');if(ne.length)rem(ne[_mf(_mr()*ne.length)]);}
}
if(BLACKHOLE){
let bhR=BLACKHOLE.size;
let pullRange=80+bhR*3.5;
let swallowed=false;
if(BLACKHOLE._swallowCount===undefined)BLACKHOLE._swallowCount=0;
[...Ducks,...Babies,...BabySwans,...Swans,...Dragons,...BabyDragons,...DragonEggs,...Foxes,...Snakes,...Wolves,...Eggs,...Zombies,...BabyZombies].forEach(o=>{
let ddx=BLACKHOLE.x-o.x,ddy=BLACKHOLE.y-o.y,d=Math.hypot(ddx,ddy);
if(d<pullRange){
let strength=0.04+0.06*(1-d/pullRange);
o.x+=ddx*strength;o.y+=ddy*strength;
if(d>0){o.x+=(-ddy/d)*0.8;o.y+=(ddx/d)*0.8;}
o.el.style.left=o.x+'px';o.el.style.top=o.y+'px';
let sc=_mx(0.3,d/pullRange);
o.el.style.transform=`scale(${sc})`;
o.el.style.opacity=String(sc);
} else {
o.el.style.transform='';
o.el.style.opacity='1';
}
if(d<bhR*0.6){
if(!(o.type==='Dragon'||o.type==='BabyDragon'||o.type==='DragonEgg')){rem(o);swallowed=true;BLACKHOLE._swallowCount++;if(BLACKHOLE._swallowCount>=10)_unlockAch('singularity');
BLACKHOLE.size=_mn(BLACKHOLE.size+4,160);
let s=BLACKHOLE.size;
BLACKHOLE.swirl.style.width=(s*2.2)+'px';BLACKHOLE.swirl.style.height=(s*2.2)+'px';
BLACKHOLE.core.style.width=s+'px';BLACKHOLE.core.style.height=s+'px';
BLACKHOLE.core.style.boxShadow=`0 0 ${30+s*0.5}px ${10+s*0.2}px rgba(100,0,255,${0.5+s/320}),inset 0 0 20px #000`;
BLACKHOLE.swirl.style.animationDuration=_mx(0.3,1.2-s*0.005)+'s';}
}
});
} if(now>nextOutbreak){nextOutbreak=now+10000;if(_mr()<0.05){let all=[...Ducks,...Babies,...BabySwans,...Swans,...Dragons,...BabyDragons,...Bears,...Lions];if(all.length){let patientZero=all[_mf(_mr()*all.length)];let _naturalTypes=['normal','normal','normal','zombie','fast'];let _nt=_naturalTypes[_mf(_mr()*_naturalTypes.length)];infect(patientZero,_nt);_unlockAch('outbreak');window._naturalOutbreakActive=true;let alert=_ce("div");alert.textContent="🦠 Outbreak!";alert.style.cssText="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:40px;color:#0f0;text-shadow:0 0 20px #0f0;z-index:1000008;pointer-events:none;";_ba(alert);setTimeout(()=>alert.remove(),1500)}}}
if(weather==='storm'&&now>nextLightning){
nextLightning=now+15000;
if(_mr()<0.1){
let targets=[...Ducks,...Babies,...BabySwans,...Swans,...Dragons,...BabyDragons,...DragonEggs,...Foxes,...Snakes,...Wolves,...Bears,...Lions,...Eggs];
if(targets.length){
let victim=targets[_mf(_mr()*targets.length)];
let bolt=_ce('div');
bolt.textContent='⚡';
bolt.style.cssText=`position:fixed;left:${victim.x}px;top:${victim.y - 60}px;font-size:48px;z-index:1000022;pointer-events:none;transform:translate(-50%,-50%);transition:transform .15s ease,opacity .3s ease;`;
_ba(bolt);
let flash=_ce('div');
flash.style.cssText='position:fixed;inset:0;background:rgba(255,255,200,0.35);z-index:1000021;pointer-events:none;transition:opacity .25s ease;';
_ba(flash);
setTimeout(()=>{bolt.style.opacity='0';bolt.style.transform='translate(-50%,-50%) scale(2)';flash.style.opacity='0';},150);
setTimeout(()=>{bolt.remove();flash.remove();if(victim.type!=='Dragon'&&victim.type!=='BabyDragon'&&victim.type!=='DragonEgg')rem(victim);},400);
}
}
} if(BEACON){let _bpop=[...Ducks,...Babies,...BabySwans,...Swans,...Dragons,...BabyDragons,...Foxes,...Snakes,...Wolves,...Bears,...Lions,...Eagles,...Bats,...Zombies,...BabyZombies,...Yetis,...Aliens].length;if(_bpop>=10)_unlockAch('doyuknow');}if(now-start>=300000)_unlockAch('thisfun');if(now-start>=600000)_unlockAch('addicted');tickAliens(now);tickNaturalDisasters(now);tickLava();
[...Ducks,...Babies,...BabySwans,...Swans,...Foxes,...Snakes,...Wolves,...Bears,...Lions,...Dragons,...BabyDragons].forEach(o=>{
if(o._sleeping&&o._zzzEl){o._zzzEl.style.left=(o.x+12)+'px';o._zzzEl.style.top=(o.y-10)+'px';}
});let inf=updateDisease();if(window._naturalOutbreakActive&&inf===0){_unlockAch('survived');window._naturalOutbreakActive=false;}updateStats(inf);},50)})()(()=>{
let _fishEl=null;
window._launchFishing=function(){
 window.paused=true;
 if(window._menuEl)window._menuEl.style.display='none';
 if(window._homeBtn)window._homeBtn.style.display='';
 window._fishingActive=true;
 if(_fishEl){_fishEl.remove();_fishEl=null;}
 _buildFishing();
};
window._exitFishing=function(){
 window._fishingActive=false;
 window.paused=false;
 inputBlocked=false;
 if(castAnim){_caf(castAnim);castAnim=null;}
 if(_fishEl){_fishEl.remove();_fishEl=null;}
 if(window._menuEl)window._menuEl.style.display='flex';
 if(window._randomiseFeatured)window._randomiseFeatured();
 if(window._homeBtn)window._homeBtn.style.display='none';
};

function _buildFishing(){
if(!_gi('fish-style')){
const st=_ce('style');st.id='fish-style';
st.textContent=`
@import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@600;700;800;900&display=swap');
#fish{position:fixed;inset:0;z-index:1000085;display:flex;flex-direction:column;font-family:'Nunito',sans-serif;overflow:hidden;background:#0a1a2e;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;}
#fish-hdr{display:flex;align-items:center;gap:4px;padding:0 8px;height:48px;flex-shrink:0;background:linear-gradient(180deg,#0d1f3a,#0a1a2e);border-bottom:2px solid rgba(100,200,255,0.12);overflow-x:auto;scrollbar-width:none;}
#fish-title{font-family:'Fredoka One',cursive;font-size:18px;color:#60d8ff;flex:1;}
.fish-pill{display:flex;align-items:center;gap:4px;background:rgba(0,0,0,.3);border:1px solid rgba(100,200,255,.15);border-radius:20px;padding:3px 10px;font-size:12px;font-weight:800;color:#f0e0a0;}
#fish-scene{flex:1;position:relative;overflow:hidden;cursor:pointer;touch-action:none;-webkit-touch-callout:none;user-select:none;-webkit-user-select:none;}
#fish-sky{position:absolute;inset:0;background:linear-gradient(180deg,#071020 0%,#0d2a48 100%);z-index:0;}
#fish-water{position:absolute;bottom:0;left:0;right:0;height:58%;background:linear-gradient(180deg,#0c3a5c 0%,#071828 100%);z-index:1;}
#fish-shore{position:absolute;bottom:0;left:0;width:38%;height:64%;z-index:3;border-top-right-radius:55% 38%;}
#fish-shore-grass{position:absolute;bottom:0;left:0;width:38%;height:64%;z-index:4;pointer-events:none;background:radial-gradient(ellipse 80% 25% at 50% 0%,rgba(80,160,40,0.3) 0%,transparent 70%);border-top-right-radius:55% 38%;}
#fish-moon{position:absolute;right:18%;top:8%;width:36px;height:36px;border-radius:50%;background:radial-gradient(circle at 38% 38%,#fffde8,#e8d070);z-index:2;pointer-events:none;}
#fish-water-shimmer{position:absolute;bottom:0;left:0;right:0;height:58%;z-index:2;pointer-events:none;background:repeating-linear-gradient(180deg,transparent,transparent 22px,rgba(255,255,255,0.02) 24px);animation:fishShimmer 4s ease-in-out infinite;}
@keyframes fishShimmer{0%,100%{opacity:.5;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}}
.fish-star{position:absolute;border-radius:50%;background:#fff;animation:fishTwinkle 2s ease-in-out infinite;}
@keyframes fishTwinkle{0%,100%{opacity:.3}50%{opacity:1}}
.fish-ripple{position:absolute;border-radius:50%;border:2px solid rgba(100,200,255,.4);animation:fishRipple 2s ease-out infinite;pointer-events:none;}
@keyframes fishRipple{0%{transform:scale(0);opacity:.8}100%{transform:scale(2.5);opacity:0}}
.fish-hotspot{position:absolute;border-radius:50%;cursor:pointer;z-index:5;display:flex;align-items:center;justify-content:center;}
#fish-duck{position:absolute;font-size:30px;z-index:6;transform:scaleX(-1);transition:left .5s ease,top .3s ease;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6));}
#fish-rod{position:absolute;width:3px;transform-origin:bottom center;background:linear-gradient(180deg,#c8a060,#8a6030);border-radius:2px;z-index:7;}
#fish-line{position:absolute;z-index:6;pointer-events:none;}
#fish-float{position:absolute;font-size:18px;z-index:8;transition:top .3s;}
#fish-bob-anim{animation:fishBob .6s ease-in-out infinite;}
@keyframes fishBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)};}
@keyframes fishSplashRipple{0%{width:0;height:0;opacity:1;margin:0}100%{width:56px;height:56px;opacity:0;margin:-28px}}
#fish-splash{position:absolute;font-size:22px;z-index:9;pointer-events:none;opacity:0;transition:opacity .2s;}
#fish-power-wrap{position:absolute;left:50%;transform:translateX(-50%);bottom:80px;width:min(220px,80vw);z-index:10;display:none;}
#fish-power-bar{height:18px;background:rgba(0,0,0,.5);border-radius:9px;overflow:hidden;border:2px solid rgba(100,200,255,.3);}
#fish-power-fill{height:100%;width:0%;border-radius:7px;background:linear-gradient(90deg,#30c060,#f0c040,#f04040);transition:width .05s;}
#fish-power-lbl{text-align:center;font-size:10px;font-weight:900;color:rgba(255,255,255,.6);margin-top:3px;letter-spacing:.06em;text-transform:uppercase;}
#fish-reel-wrap{position:absolute;inset:0;z-index:10;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(0,0,0,.4);}
#fish-tension-track{width:min(260px,80vw);height:22px;background:rgba(0,0,0,.5);border-radius:11px;overflow:hidden;border:2px solid rgba(100,200,255,.25);position:relative;}
#fish-tension-zone{position:absolute;top:0;bottom:0;background:rgba(80,200,80,.25);border-left:2px solid #50e880;border-right:2px solid #50e880;}
#fish-tension-marker{position:absolute;top:2px;bottom:2px;width:12px;border-radius:6px;background:#f0c040;transition:left .08s;}
#fish-reel-inst{font-size:11px;font-weight:900;color:rgba(255,255,255,.6);text-align:center;letter-spacing:.04em;text-transform:uppercase;}
#fish-reel-progress{width:min(260px,80vw);}
#fish-reel-bar{height:10px;background:rgba(0,0,0,.5);border-radius:5px;overflow:hidden;border:1px solid rgba(100,200,255,.2);}
#fish-reel-fill{height:100%;width:0%;background:linear-gradient(90deg,#3080f0,#50d0ff);transition:width .15s;}
#fish-catch-overlay{position:absolute;inset:0;z-index:20;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(0,0,0,.75);}
#fish-catch-emoji{font-size:72px;animation:fishCatchPop .4s cubic-bezier(.34,1.56,.64,1);}
@keyframes fishCatchPop{0%{transform:scale(0)}100%{transform:scale(1)}}
#fish-catch-name{font-family:'Fredoka One',cursive;font-size:24px;color:#f0e0a0;text-align:center;}
#fish-catch-rarity{font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;}
#fish-catch-size{font-size:13px;color:rgba(255,255,255,.6);font-weight:700;}
#fish-catch-value{font-size:20px;font-weight:900;color:#f0c040;}
#fish-catch-btn{padding:10px 32px;border-radius:12px;border:none;font-size:13px;font-weight:900;cursor:pointer;font-family:'Nunito',sans-serif;background:linear-gradient(135deg,#1060a0,#2090e0);color:#fff;touch-action:manipulation;}
#fish-msg{position:absolute;top:44%;left:50%;transform:translate(-50%,-50%);font-family:'Fredoka One',cursive;font-size:17px;color:#f0e0a0;text-shadow:0 0 16px rgba(240,220,160,.8);pointer-events:none;z-index:15;opacity:0;transition:opacity .3s;text-align:center;white-space:nowrap;}
#fish-panel{flex-shrink:0;background:#080f1e;border-top:2px solid rgba(100,200,255,.1);touch-action:auto;position:relative;z-index:5;}
#fish-tabs{display:flex;touch-action:auto;}
.fish-tab{flex:1;padding:7px 4px;text-align:center;font-size:10px;font-weight:900;color:rgba(100,200,255,.35);cursor:pointer;letter-spacing:.06em;text-transform:uppercase;border-top:2px solid transparent;margin-top:-2px;transition:color .15s;}
.fish-tab.active{color:#60d8ff;border-top-color:#60d8ff;background:rgba(96,216,255,.06);}
#fish-panel-body{overflow-y:auto;max-height:32vh;scrollbar-width:none;}
#fish-panel-body::-webkit-scrollbar{display:none;}
.fish-panel-content{padding:8px;}
.fish-shop-item{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.03);border:1.5px solid rgba(100,200,255,.1);border-radius:11px;padding:8px 10px;margin-bottom:6px;}
.fish-shop-item.owned{border-color:rgba(80,200,80,.3);background:rgba(80,200,80,.05);}
.fish-shop-icon{font-size:24px;flex-shrink:0;}
.fish-shop-info{flex:1;min-width:0;}
.fish-shop-name{font-size:12px;font-weight:900;color:#f0e0a0;}
.fish-shop-desc{font-size:10px;color:rgba(240,220,160,.45);font-weight:700;margin-top:1px;}
.fish-shop-btn{padding:6px 14px;border-radius:8px;border:none;font-size:11px;font-weight:900;cursor:pointer;font-family:'Nunito',sans-serif;touch-action:manipulation;flex-shrink:0;}
.fish-shop-btn-buy{background:linear-gradient(135deg,#1060a0,#2090e0);color:#fff;}
.fish-shop-btn-buy:disabled{background:rgba(255,255,255,.07);color:rgba(255,255,255,.25);cursor:default;}
.fish-shop-btn-eq{background:linear-gradient(135deg,#206040,#30a060);color:#fff;}
.fish-loc-card{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.03);border:1.5px solid rgba(100,200,255,.1);border-radius:11px;padding:10px 12px;margin-bottom:6px;cursor:pointer;transition:border-color .15s;}
.fish-loc-card.active{border-color:#60d8ff;background:rgba(96,216,255,.06);}
.fish-loc-card.locked{opacity:.4;cursor:default;}
.fish-loc-icon{font-size:28px;flex-shrink:0;}
.fish-loc-info{flex:1;}
.fish-loc-name{font-size:13px;font-weight:900;color:#f0e0a0;}
.fish-loc-desc{font-size:10px;color:rgba(240,220,160,.45);font-weight:700;margin-top:2px;}
.fish-loc-badge{font-size:10px;font-weight:900;padding:2px 8px;border-radius:6px;flex-shrink:0;}
.fish-inv-row{display:flex;align-items:center;gap:6px;padding:5px 6px;border-radius:8px;font-size:11px;font-weight:700;color:rgba(240,220,160,.7);}
.fish-inv-emoji{font-size:18px;flex-shrink:0;}
.fish-inv-name{flex:1;font-weight:900;color:#f0e0a0;}
.fish-inv-val{color:#f0c040;font-weight:900;}
.fish-rarity-common{color:#a0c0a0;}
.fish-rarity-uncommon{color:#60d8ff;}
.fish-rarity-rare{color:#c080ff;}
.fish-rarity-legendary{color:#f0c040;}
.fish-caught-badge{font-size:9px;font-weight:900;letter-spacing:.08em;padding:1px 6px;border-radius:4px;margin-left:4px;}
@media(min-width:600px){
 #fish-hdr{height:54px;}
 #fish-title{font-size:21px;}
 .fish-pill{font-size:13px;}
 .fish-tab{padding:8px 6px;font-size:11px;}
 #fish-panel-body{max-height:35vh;}
}
`;
document.head.appendChild(st);
}

// ── Data ─────────────────────────────────────────────────────
const LOCATIONS=[
 {id:'pond',  name:'Duck Pond',        icon:'🏞️', desc:'A calm local pond. Classic catches.',    unlockCost:0,    sky:'linear-gradient(180deg,#060d1a 0%,#0d2040 55%,#1a3a5a 100%)', water:'linear-gradient(180deg,#0d4060 0%,#082838 60%,#041520 100%)', shore:'linear-gradient(135deg,#243d0a 0%,#365a10 50%,#2a4a0e 100%)', moonTint:'rgba(255,240,120,0.18)', stars:22},
 {id:'river', name:'Babbling River',   icon:'🏞️', desc:'Fast water, bigger fish.',               unlockCost:80,   sky:'linear-gradient(180deg,#060e0a 0%,#0a1e10 55%,#143020 100%)', water:'linear-gradient(180deg,#083820 0%,#052010 60%,#020a06 100%)', shore:'linear-gradient(135deg,#1a2808 0%,#283810 50%,#1e3008 100%)', moonTint:'rgba(180,255,180,0.12)', stars:16},
 {id:'lake',  name:'Mountain Lake',    icon:'🏔️', desc:'Deep and cold. Rare species lurk.',      unlockCost:200,  sky:'linear-gradient(180deg,#080612 0%,#141028 55%,#1e1840 100%)', water:'linear-gradient(180deg,#0a1848 0%,#060e2a 60%,#030610 100%)', shore:'linear-gradient(135deg,#1a1a0e 0%,#2a2a14 50%,#1e1e0c 100%)', moonTint:'rgba(200,200,255,0.2)', stars:30},
 {id:'sea',   name:'Open Sea',         icon:'🌊', desc:'Enormous fish. Dangerous waves.',         unlockCost:500,  sky:'linear-gradient(180deg,#040810 0%,#081428 55%,#0c2040 100%)', water:'linear-gradient(180deg,#062040 0%,#041028 60%,#020810 100%)', shore:'linear-gradient(135deg,#2a1e08 0%,#3a2c0c 50%,#2e2208 100%)', moonTint:'rgba(255,255,220,0.25)', stars:40},
 {id:'cave',  name:'Underground Cave', icon:'🕳️', desc:'Ancient fish. Blind. Priceless.',        unlockCost:1200, sky:'linear-gradient(180deg,#020204 0%,#050508 55%,#080610 100%)', water:'linear-gradient(180deg,#060610 0%,#040408 60%,#020204 100%)', shore:'linear-gradient(135deg,#0e0c06 0%,#181408 50%,#100e06 100%)', moonTint:'rgba(0,255,200,0.08)', stars:5},
];
const FISH_BY_LOC={
 pond:[
 {id:'boot', e:'👟', name:'Old Boot', rarity:'common', baseVal:1, minSize:20, maxSize:35},
 {id:'minnow', e:'🐟', name:'Minnow', rarity:'common', baseVal:3, minSize:8, maxSize:15},
 {id:'perch', e:'🐠', name:'Agitated Perch', rarity:'common', baseVal:6, minSize:15, maxSize:30},
 {id:'carp', e:'🐡', name:'Suspicious Carp', rarity:'uncommon', baseVal:14, minSize:30, maxSize:60},
 {id:'duck_toy',e:'🦆', name:'Rubber Duck', rarity:'uncommon', baseVal:20, minSize:10, maxSize:10},
 {id:'goldfish',e:'🐟', name:'Golden Goldfish', rarity:'rare', baseVal:40, minSize:8, maxSize:12},
 ],
 river:[
 {id:'trout', e:'🐟', name:'Brown Trout', rarity:'common', baseVal:8, minSize:25, maxSize:50},
 {id:'salmon', e:'🐡', name:'Leaping Salmon', rarity:'uncommon', baseVal:22, minSize:40, maxSize:80},
 {id:'eel', e:'🐍', name:'Electric Eel', rarity:'uncommon', baseVal:30, minSize:50, maxSize:90},
 {id:'pike', e:'🐟', name:'Grumpy Pike', rarity:'rare', baseVal:55, minSize:60, maxSize:100},
 {id:'crown', e:'👑', name:'Sunken Crown', rarity:'legendary',baseVal:150,minSize:5, maxSize:5},
 ],
 lake:[
 {id:'bass', e:'🐟', name:'Striped Bass', rarity:'common', baseVal:12, minSize:30, maxSize:60},
 {id:'tench', e:'🐡', name:'Mysterious Tench', rarity:'uncommon', baseVal:28, minSize:40, maxSize:70},
 {id:'sturgeon',e:'🐟', name:'Ancient Sturgeon', rarity:'rare', baseVal:75, minSize:80, maxSize:150},
 {id:'monster', e:'🦕', name:'Lake Monster', rarity:'legendary',baseVal:200,minSize:200,maxSize:200},
 ],
 sea:[
 {id:'mackerel',e:'🐟', name:'Mackerel', rarity:'common', baseVal:15, minSize:25, maxSize:45},
 {id:'tuna', e:'🐡', name:'Bluefin Tuna', rarity:'uncommon', baseVal:45, minSize:80, maxSize:160},
 {id:'swordfish',e:'🐟',name:'Swordfish', rarity:'rare', baseVal:100,minSize:100,maxSize:180},
 {id:'whale', e:'🐳', name:'Friendly Whale', rarity:'legendary',baseVal:300,minSize:500,maxSize:500},
 {id:'bottle', e:'🍾', name:'Message in Bottle',rarity:'uncommon', baseVal:35, minSize:5, maxSize:5},
 ],
 cave:[
 {id:'cavefish',e:'🐟', name:'Blind Cavefish', rarity:'common', baseVal:25, minSize:15, maxSize:30},
 {id:'glowfish',e:'✨', name:'Glowfish', rarity:'uncommon', baseVal:60, minSize:20, maxSize:40},
 {id:'fossil', e:'🦴', name:'Living Fossil', rarity:'rare', baseVal:150,minSize:30, maxSize:50},
 {id:'ancientd',e:'🦆', name:'Ancient Duck God', rarity:'legendary',baseVal:500,minSize:999,maxSize:999},
 ],
};
const RODS=[
 {id:'stick', name:'Twig Rod', icon:'🎋', desc:'A stick with string. Does the job.', cost:0, owned:true, equipped:true, bonus:0, baitSlots:1},
 {id:'basic', name:'Basic Rod', icon:'🎣', desc:'+10% catch chance.', cost:30, owned:false,equipped:false,bonus:0.1, baitSlots:1},
 {id:'good', name:'Fibreglass Rod', icon:'🎣', desc:'+25% catch chance, faster reel.', cost:100, owned:false,equipped:false,bonus:0.25,baitSlots:2},
 {id:'pro', name:'Carbon Rod', icon:'🎣', desc:'+40% catch chance, rarer fish.', cost:300, owned:false,equipped:false,bonus:0.4, baitSlots:2},
 {id:'legend', name:'Legendary Rod', icon:'✨', desc:'+60% catch chance, much rarer fish.', cost:800, owned:false,equipped:false,bonus:0.6, baitSlots:3},
];
const BAITS=[
 {id:'bread', name:'Bread Crumbs', icon:'🍞', desc:'Standard bait. Attracts most fish.', cost:5, owned:true, count:10, effect:'none'},
 {id:'worm', name:'Worm', icon:'🪱', desc:'Uncommon fish more likely.', cost:15, owned:false,count:0, effect:'uncommon'},
 {id:'lure', name:'Shiny Lure', icon:'🌟', desc:'Rare fish more likely.', cost:40, owned:false,count:0, effect:'rare'},
 {id:'goldlure',name:'Golden Lure', icon:'🏆', desc:'Legendary fish possible.', cost:120,owned:false,count:0, effect:'legendary'},
];
const RARITY_WEIGHTS={
 none: {common:60,uncommon:30,rare:8,legendary:2},
 uncommon: {common:30,uncommon:50,rare:17,legendary:3},
 rare: {common:15,uncommon:30,rare:45,legendary:10},
 legendary:{common:5, uncommon:20,rare:35,legendary:40},
};
const RARITY_COLORS={common:'#a0c0a0',uncommon:'#60d8ff',rare:'#c080ff',legendary:'#f0c040'};

// ── State ──────────────────────────────────────────────────
let gold=0,locId='pond',activeTab='shop';
let catchLog=[];
let castState='idle'; // idle|charging|cast|nibble|hooked|reeling|caught|escaped
let castPower=0,castPowerDir=1;
let floatX=0.5,floatY=0.62;
let reelProgress=0,reelTarget=100;
let tensionPos=0.5,tensionDir=1,tensionSpeed=0.004;
let tensionHeld=false;
let nibbleTimer=0,nibbleWarned=false;
let pendingFish=null;
let castAnim=null;
let inputBlocked=false;
let hotspots=[];

function getLoc(){return LOCATIONS.find(l=>l.id===locId);}
function getEquippedRod(){return RODS.find(r=>r.equipped);}
function getEquippedBait(){return BAITS.find(b=>b.owned&&b.count>0)||BAITS[0];}

// ── DOM ─────────────────────────────────────────────────────
_fishEl=_ce('div');_fishEl.id='fish';
_fishEl.innerHTML=`
<div id="fish-hdr">
  <div id="fish-title">🎣 Duck Fishing</div>
 <div class="fish-pill">🪙 <span id="fish-gold">0</span></div>
 <div class="fish-pill">📍 <span id="fish-loc-name">Duck Pond</span></div>
</div>
<div id="fish-scene">
 <div id="fish-sky"></div>
 <div id="fish-moon"></div>
 <div id="fish-water"></div>
 <div id="fish-water-shimmer"></div>
 <div id="fish-shore"></div>
 <div id="fish-shore-grass"></div>
 <div id="fish-duck">🎣🦆</div>
 <div id="fish-rod"></div>
 <canvas id="fish-line-canvas" style="position:absolute;inset:0;z-index:6;pointer-events:none;"></canvas>
 <div id="fish-float">🔵</div>
 <div id="fish-splash" style="display:none;">💦</div>
 <div id="fish-power-wrap">
 <div id="fish-power-bar"><div id="fish-power-fill"></div></div>
 <div id="fish-power-lbl">Hold to charge · Release to cast</div>
 </div>
 <div id="fish-reel-wrap">
 <div id="fish-reel-inst">Hold when marker is in the zone</div>
 <div id="fish-tension-track">
 <div id="fish-tension-zone"></div>
 <div id="fish-tension-marker"></div>
 </div>
 <div id="fish-reel-progress">
 <div id="fish-reel-bar"><div id="fish-reel-fill"></div></div>
 </div>
 </div>
 <div id="fish-catch-overlay">
 <div id="fish-catch-emoji">🐟</div>
 <div id="fish-catch-name">Fish!</div>
 <div id="fish-catch-rarity"></div>
 <div id="fish-catch-size"></div>
 <div id="fish-catch-value"></div>
 <button id="fish-catch-btn">Keep fishing! 🎣</button>
 </div>
 <div id="fish-msg"></div>
</div>
<div id="fish-panel">
 <div id="fish-tabs">
 <div class="fish-tab active" data-tab="shop">🛒 Shop</div>
 <div class="fish-tab" data-tab="locations">📍 Spots</div>
 <div class="fish-tab" data-tab="catch">📖 Caught</div>
 </div>
 <div id="fish-panel-body"></div>
</div>
`;
_ba(_fishEl);

const $=id=>_gi(id);
const scene=$('fish-scene');

// ── Helpers ─────────────────────────────────────────────────
let _msgT=null;
function msg(txt,dur=2000){
 const el=$('fish-msg');if(!el)return;
 if(_msgT)clearTimeout(_msgT);
 el.textContent=txt;el.style.opacity='1';
 _msgT=setTimeout(()=>{if(el)el.style.opacity='0';},dur);
}
function updateGoldHUD(){
 const g=$('fish-gold');if(g)g.textContent=gold;
}

// ── Scene setup ─────────────────────────────────────────────
function setupScene(){
 const loc=getLoc();
 const sky=$('fish-sky');
 const water=$('fish-water');
 const shore=$('fish-shore');
 if(sky)sky.style.background=loc.sky;
 if(water)water.style.background=loc.water;
 if(shore)shore.style.background=loc.shore;
 const moon=$('fish-moon');
 if(moon){moon.style.opacity=loc.id==='cave'?'0':'1';moon.style.boxShadow=`0 0 18px 6px ${loc.moonTint},0 0 55px 18px ${loc.moonTint}`;}
 const shimmer=$('fish-water-shimmer');
 if(shimmer)shimmer.style.opacity=loc.id==='cave'?'0.03':'1';
 const ln=$('fish-loc-name');if(ln)ln.textContent=loc.name;
 // Stars
 scene.querySelectorAll('.fish-star').forEach(s=>s.remove());
 for(let i=0;i<(loc.stars||20);i++){
 const s=_ce('div');s.className='fish-star';
 const sz=_mr()<0.3?2:1;
 s.style.cssText=`width:${sz}px;height:${sz}px;left:${38+_mr()*62}%;top:${_mr()*70}%;animation-delay:${_mr()*3}s;`;
 scene.appendChild(s);
 }
 // Cave glowworms
 if(loc.id==='cave'){for(let i=0;i<12;i++){const g=_ce('div');g.className='fish-star';g.style.cssText=`position:absolute;width:4px;height:4px;border-radius:50%;background:#00ffcc;left:${38+_mr()*60}%;top:${5+_mr()*50}%;opacity:${0.4+_mr()*0.6};animation:fishTwinkle ${1+_mr()*2}s ease-in-out infinite;animation-delay:${_mr()*2}s;`;scene.appendChild(g);}}
 // Hotspots
 scene.querySelectorAll('.fish-hotspot').forEach(h=>h.remove());
 hotspots=[];
 for(let i=0;i<3;i++){
 const x=0.38+_mr()*0.56,y=0.48+_mr()*0.38;
 const h=_ce('div');h.className='fish-hotspot';
 h.style.cssText=`left:${x*100}%;top:${y*100}%;width:40px;height:40px;margin-left:-20px;margin-top:-20px;`;
 const r=_ce('div');r.className='fish-ripple';
 r.style.cssText=`width:30px;height:30px;margin:-15px;position:absolute;animation-delay:${_mr()*2}s;`;
 h.appendChild(r);
 scene.appendChild(h);
 hotspots.push({x,y,el:h});
 }
 // Duck position
 const duck=$('fish-duck');
 if(duck){duck.style.left='9%';duck.style.top='28%';}
 const fl=$('fish-float');
 if(fl){fl.style.display='none';}
 drawLine(null,null);
}

// ── Line drawing ─────────────────────────────────────────────
function drawLine(fx,fy){
 const cv=$('fish-line-canvas');if(!cv)return;
 const rect=scene.getBoundingClientRect();
 cv.width=rect.width;cv.height=rect.height;
 const ctx=cv.getContext('2d');
 ctx.clearRect(0,0,cv.width,cv.height);
 if(fx===null)return;
 const duck=$('fish-duck');
 if(!duck)return;
 const dr=duck.getBoundingClientRect();
 const sx=(dr.left-rect.left+dr.width*1.0);
 const sy=(dr.top-rect.top+dr.height*0.05);
 ctx.beginPath();
 ctx.moveTo(sx,sy);
 const cx=sx+(fx*cv.width-sx)*0.5;
 const cy=sy-40;
 ctx.quadraticCurveTo(cx,cy,fx*cv.width,fy*cv.height);
 ctx.strokeStyle='rgba(200,200,180,0.7)';
 ctx.lineWidth=1.5;
 ctx.stroke();
}

// ── Fish selection ────────────────────────────────────────────
function pickFish(){
 const pool=FISH_BY_LOC[locId]||FISH_BY_LOC.pond;
 const bait=getEquippedBait();
 const rod=getEquippedRod();
 const weights=RARITY_WEIGHTS[bait.effect]||RARITY_WEIGHTS.none;
 // Rod bonus shifts rarity up
 const rn=_mr()*100;
 let rarity;
 const bonusRare=_mr()<(rod.bonus||0);
 if(bonusRare){
 const w2=RARITY_WEIGHTS.rare;
 const rn2=_mr()*100;
 rarity=rn2<w2.legendary?'legendary':rn2<w2.legendary+w2.rare?'rare':rn2<w2.legendary+w2.rare+w2.uncommon?'uncommon':'common';
 } else {
 rarity=rn<weights.legendary?'legendary':rn<weights.legendary+weights.rare?'rare':rn<weights.legendary+weights.rare+weights.uncommon?'uncommon':'common';
 }
 const byRarity=pool.filter(f=>f.rarity===rarity);
 const eligible=byRarity.length?byRarity:pool;
 const def=eligible[_mf(_mr()*eligible.length)];
 const size=def.minSize+_mf(_mr()*(def.maxSize-def.minSize+1));
 const val=_mf(def.baseVal*(size/def.minSize)*0.8+def.baseVal*0.2);
 return {def,size,val,rarity};
}
function rarityLabel(r){return r.charAt(0).toUpperCase()+r.slice(1);}

// ── Cast state machine ────────────────────────────────────────
function startCharging(){
 if(castState!=='idle')return;
 castState='charging';
 castPower=0;castPowerDir=1;
 const pw=$('fish-power-wrap');if(pw)pw.style.display='block';
 const fill=$('fish-power-fill');
 let pAnim;
 function tick(){
 if(castState!=='charging'){if(fill)fill.style.width='0%';return;}
 castPower=_mn(100,_mx(0,castPower+castPowerDir*2.5));
 if(castPower>=100||castPower<=0)castPowerDir*=-1;
 if(fill)fill.style.width=castPower+'%';
 pAnim=_raf(tick);
 }
 castAnim=pAnim;
 tick();
}
function releasecast(){
 if(castState!=='charging')return;
 castState='cast';
 _caf(castAnim);
 const pw=$('fish-power-wrap');if(pw)pw.style.display='none';
 // Determine float landing position based on power
 const pw2=castPower/100;
 const fl=$('fish-float');
 floatX=0.48+pw2*0.46;
 floatY=0.55+_mr()*0.25;
 // Animate float flying out
 if(fl){
 fl.style.display='block';
 fl.style.left=(floatX*100)+'%';
 fl.style.top=(floatY*100)+'%';
 fl.style.transition='left .4s ease-out,top .4s ease-out';
 fl.textContent='🎣';
 setTimeout(()=>{
 if(fl)fl.textContent='🪀';
 drawLine(floatX,floatY);
 const _rpl=_ce('div');_rpl.style.cssText=`position:absolute;left:${floatX*100}%;top:${floatY*100}%;width:0;height:0;border-radius:50%;border:2px solid rgba(100,200,255,0.65);transform:translate(-50%,-50%);z-index:9;pointer-events:none;animation:fishSplashRipple 0.55s ease-out forwards;`;scene.appendChild(_rpl);setTimeout(()=>_rpl.remove(),600);
 msg('Waiting for a bite...',3000);
 castState='waiting';
 nibbleTimer=60+_mf(_mr()*120);
 nibbleWarned=false;
 },450);
 }
 // Use bait
 const bait=getEquippedBait();
 if(bait&&bait.id!=='bread'){bait.count=_mx(0,bait.count-1);}
}
function doNibble(){
 castState='nibble';
 const fl=$('fish-float');
 if(fl){fl.id='fish-bob-anim';fl.textContent='🎣';fl.style.animation='fishBob .5s ease-in-out infinite';}
 msg('🐟 Nibble! Tap now!',1500);
 nibbleTimer=40; // ticks to tap before fish escapes
}
function doHook(){
 if(castState!=='nibble')return;
 castState='reeling';
 const fl=$('fish-float');
 if(fl){fl.style.animation='';fl.textContent='💦';}
 pendingFish=pickFish();
 reelProgress=0;
 reelTarget=40+_mf(_mr()*30);
 tensionPos=0.5;
 tensionSpeed=0.003+pendingFish.def.baseVal/2400;
 const rw=$('fish-reel-wrap');if(rw)rw.style.display='flex';
 msg('Fish on! Hold to reel!',2000);
 startReelLoop();
}
function startReelLoop(){
 function tick(){
 if(castState!=='reeling')return;
 // Tension marker bounces
 tensionPos+=tensionDir*tensionSpeed*(getEquippedRod().id==='legend'?0.7:1);
 if(tensionPos>1){tensionPos=1;tensionDir=-1;}
 if(tensionPos<0){tensionPos=0;tensionDir=1;}
 // Update marker
 const marker=$('fish-tension-marker');
 const track=$('fish-tension-track');
 if(marker&&track){marker.style.left=_mx(0,_mn(track.offsetWidth-12,tensionPos*track.offsetWidth-6))+'px';}
 // Check if holding and in zone
 const zone=$('fish-tension-zone');
 const zoneL=zone?parseFloat(zone.style.left)/100:0.3;
 const zoneR=zoneL+0.3;
 const inZone=tensionPos>=zoneL&&tensionPos<=zoneR;
 if(tensionHeld&&inZone){
 reelProgress=_mn(reelTarget,reelProgress+2.0);
 } else if(tensionHeld&&!inZone){
 // Over-tension — line snaps if held too long outside zone
 reelProgress=_mx(0,reelProgress-0.1);
 } else {
 reelProgress=_mx(0,reelProgress-0.15);
 }
 // Update reel bar
 const fill=$('fish-reel-fill');
 if(fill)fill.style.width=(reelProgress/reelTarget*100)+'%';

 if(reelProgress>=reelTarget){fishCaught();return;}
 _raf(tick);
 }
 // Init zone
 const zone=$('fish-tension-zone');
 if(zone){zone.style.left='25%';zone.style.width='50%';}
 _raf(tick);
}
function fishCaught(){
 castState='caught';
 const rw=$('fish-reel-wrap');if(rw)rw.style.display='none';
 const fl=$('fish-float');if(fl)fl.style.display='none';
 drawLine(null,null);
 const f=pendingFish;
 if(!f)return;
 gold+=f.val;
 updateGoldHUD();
 catchLog.unshift({...f.def,size:f.size,val:f.val,rarity:f.rarity,ts:Date.now()});
 if(catchLog.length>30)catchLog.pop();
 // Show catch overlay
 const ov=$('fish-catch-overlay');
 const en=$('fish-catch-emoji');
 const nm=$('fish-catch-name');
 const ra=$('fish-catch-rarity');
 const sz=$('fish-catch-size');
 const vl=$('fish-catch-value');
 if(en)en.textContent=f.def.e;
 if(nm)nm.textContent=f.def.name;
 if(ra){ra.textContent=rarityLabel(f.rarity);ra.className='fish-rarity-'+f.rarity;}
 if(sz)sz.textContent=f.size<10?'Tiny!':f.size<50?f.size+'cm':f.size<200?(f.size/100).toFixed(1)+'m':f.size+'cm 😱';
 if(vl)vl.textContent='+'+f.val+'🪙';
 const _jfl=$('fish-float');
 if(_jfl&&f){_jfl.textContent=f.def.e;_jfl.style.display='block';
   _jfl.style.transition='top .2s ease-out';
   _jfl.style.top=(floatY*100-10)+'%';
   setTimeout(()=>{_jfl.style.top=(floatY*100+2)+'%';
     setTimeout(()=>{if(ov)ov.style.display='flex';},170);},230);
 } else {if(ov)ov.style.display='flex';}
 if(activeTab==='catch')renderPanel();
}
function fishEscaped(){
 castState='idle';
 const rw=$('fish-reel-wrap');if(rw)rw.style.display='none';
 const fl=$('fish-float');if(fl)fl.style.display='none';
 drawLine(null,null);
 msg('🐟 It got away!',1800);
}
function resetCast(){
 castState='idle';
 nibbleTimer=0;
 pendingFish=null;
 reelProgress=0;
 tensionHeld=false;
 const pw=$('fish-power-wrap');if(pw)pw.style.display='none';
 const rw=$('fish-reel-wrap');if(rw)rw.style.display='none';
 const fl=$('fish-float');if(fl)fl.style.display='none';
 drawLine(null,null);
}

// ── Main tick ──────────────────────────────────────────────
let lastTickTime=0;
function tick(ts){
 if(!window._fishingActive)return;
 _raf(tick);
 if(ts-lastTickTime<50)return; // 20fps for game logic
 lastTickTime=ts;
 if(castState==='waiting'){
 nibbleTimer--;
 if(nibbleTimer<=0){
 // No nibble — float drifts away
 msg('Nothing... Try again.',1500);
 resetCast();
 } else if(nibbleTimer<=20&&!nibbleWarned){
 // 1 second before giving up, fish bites
 nibbleWarned=true;
 doNibble();
 }
 }
 if(castState==='nibble'){
 nibbleTimer--;
 if(nibbleTimer<=0){
 castState='idle';
 msg('Too slow! It got away.',1500);
 const fl=$('fish-float');if(fl){fl.style.animation='';fl.style.display='none';}
 drawLine(null,null);
 }
 }
}

// ── Input ──────────────────────────────────────────────────
function _sceneActivate(){
 if(inputBlocked)return;
 if(castState==='idle'){startCharging();return;}
 if(castState==='nibble'){doHook();return;}
 if(castState==='reeling'){tensionHeld=true;return;}
}
function _sceneRelease(){
 if(castState==='charging'){releasecast();return;}
 if(castState==='reeling'){tensionHeld=false;return;}
}
// Touch — mobile
scene.addEventListener('touchstart',e=>{e.preventDefault();_sceneActivate();},{passive:false});
scene.addEventListener('touchend',e=>{e.preventDefault();_sceneRelease();},{passive:false});
scene.addEventListener('touchcancel',()=>{tensionHeld=false;},{passive:true});
// Mouse — desktop
scene.addEventListener('mousedown',()=>_sceneActivate());
scene.addEventListener('mouseup',()=>_sceneRelease());
scene.addEventListener('mouseleave',()=>{tensionHeld=false;});
// Make element interactive on iOS (needs onclick or role)
scene.setAttribute('role','button');
scene.addEventListener('contextmenu',e=>e.preventDefault());

const _catchBtn=_fishEl.querySelector('#fish-catch-btn');
function _dismissCatch(e){
 e.stopPropagation();e.preventDefault();
 const ov=$('fish-catch-overlay');
 if(ov)ov.style.display='none';
 resetCast();
 inputBlocked=true;
 setTimeout(()=>{inputBlocked=false;},350);
}
// Wire all touch/mouse events so the button always works
_catchBtn.addEventListener('touchend',_dismissCatch,{passive:false});
_catchBtn.addEventListener('click',_dismissCatch);
_catchBtn.addEventListener('touchstart',e=>{e.stopPropagation();e.preventDefault();},{passive:false});
// ── Tabs — use delegation on container ────────────────────
const _tabsEl=_fishEl.querySelector('#fish-tabs');
if(_tabsEl)_tabsEl.addEventListener('click',e=>{
 const tab=e.target.closest('[data-tab]');
 if(!tab)return;
 activeTab=tab.dataset.tab;
 _fishEl.querySelectorAll('.fish-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===activeTab));
 renderPanel();
});

// ── Panel rendering ────────────────────────────────────────
function renderPanel(){
 const body=$('fish-panel-body');if(!body)return;
 if(activeTab==='shop')renderShop(body);
 else if(activeTab==='locations')renderLocations(body);
 else renderCatchLog(body);
}
function renderShop(body){
 let html='<div class="fish-panel-content"><div style="font-size:9px;font-weight:900;color:rgba(100,200,255,.35);letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px;">🎣 Rods</div>';
 RODS.forEach(r=>{
 const owned=r.owned;const eq=r.equipped;
 html+=`<div class="fish-shop-item${owned?' owned':''}">
 <div class="fish-shop-icon">${r.icon}</div>
 <div class="fish-shop-info"><div class="fish-shop-name">${r.name}${eq?' ✓':''}</div><div class="fish-shop-desc">${r.desc}</div></div>
 ${owned?`<button class="fish-shop-btn ${eq?'':'fish-shop-btn-eq'}" data-equip-rod="${r.id}">${eq?'Equipped':'Equip'}</button>`
 :`<button class="fish-shop-btn fish-shop-btn-buy" data-buy-rod="${r.id}" ${gold<r.cost?'disabled':''}>${r.cost}🪙</button>`}
 </div>`;
 });
 html+='<div style="font-size:9px;font-weight:900;color:rgba(100,200,255,.35);letter-spacing:.1em;text-transform:uppercase;margin:8px 0 6px;">🪱 Bait</div>';
 BAITS.forEach(b=>{
 const own=b.owned;
 html+=`<div class="fish-shop-item">
 <div class="fish-shop-icon">${b.icon}</div>
 <div class="fish-shop-info"><div class="fish-shop-name">${b.name}${own?' (×'+b.count+')':''}</div><div class="fish-shop-desc">${b.desc}</div></div>
 <button class="fish-shop-btn fish-shop-btn-buy" data-buy-bait="${b.id}" ${gold<b.cost?'disabled':''}>${b.cost}🪙 ×5</button>
 </div>`;
 });
 html+='</div>';
 body.innerHTML=html;
 body.querySelectorAll('[data-buy-rod]').forEach(btn=>{
 btn.addEventListener('click',()=>{
 const r=RODS.find(x=>x.id===btn.dataset.buyRod);
 if(!r||gold<r.cost)return;
 gold-=r.cost;r.owned=true;
 updateGoldHUD();renderPanel();
 });
 });
 body.querySelectorAll('[data-equip-rod]').forEach(btn=>{
 btn.addEventListener('click',()=>{
 RODS.forEach(x=>x.equipped=false);
 const r=RODS.find(x=>x.id===btn.dataset.equipRod);
 if(r)r.equipped=true;
 renderPanel();
 });
 });
 body.querySelectorAll('[data-buy-bait]').forEach(btn=>{
 btn.addEventListener('click',()=>{
 const b=BAITS.find(x=>x.id===btn.dataset.buyBait);
 if(!b||gold<b.cost)return;
 gold-=b.cost;b.owned=true;b.count+=5;
 updateGoldHUD();renderPanel();
 });
 });
}
function renderLocations(body){
 let html='<div class="fish-panel-content">';
 LOCATIONS.forEach(loc=>{
 const active=loc.id===locId;
 const locked=loc.unlockCost>0&&gold<loc.unlockCost&&loc.id!==locId;
 const owned=loc.unlockCost===0||gold>=loc.unlockCost||active;
 html+=`<div class="fish-loc-card${active?' active':''}${locked?' locked':''}" data-loc="${loc.id}">
 <div class="fish-loc-icon">${loc.icon}</div>
 <div class="fish-loc-info"><div class="fish-loc-name">${loc.name}</div><div class="fish-loc-desc">${loc.desc}</div></div>
 <div class="fish-loc-badge" style="background:${active?'rgba(96,216,255,.15)':'rgba(255,255,255,.06)'};color:${active?'#60d8ff':'rgba(255,255,255,.3)'};">
 ${active?'HERE':locked?loc.unlockCost+'🪙':'Go'}
 </div>
 </div>`;
 });
 html+='</div>';
 body.innerHTML=html;
 body.querySelectorAll('[data-loc]').forEach(card=>{
 card.addEventListener('click',()=>{
 const loc=LOCATIONS.find(l=>l.id===card.dataset.loc);
 if(!loc)return;
 if(loc.unlockCost>0&&gold<loc.unlockCost&&loc.id!==locId){msg('Not enough gold!',1500);return;}
 locId=loc.id;
 resetCast();
 setupScene();
 renderPanel();
 });
 });
}
function renderCatchLog(body){
 if(!catchLog.length){
 body.innerHTML='<div class="fish-panel-content" style="text-align:center;padding:20px;font-size:11px;color:rgba(100,200,255,.3);font-weight:700;">Nothing caught yet!<br>Cast your line to get started.</div>';
 return;
 }
 let html='<div class="fish-panel-content">';
 catchLog.slice(0,20).forEach(c=>{
 html+=`<div class="fish-inv-row">
 <div class="fish-inv-emoji">${c.e}</div>
 <div class="fish-inv-name">${c.name} <span class="fish-rarity-${c.rarity}" style="font-size:9px;font-weight:900;">${rarityLabel(c.rarity)}</span></div>
 <div style="font-size:10px;color:rgba(240,220,160,.45);font-weight:700;">${c.size}cm</div>
 <div class="fish-inv-val">+${c.val}🪙</div>
 </div>`;
 });
 html+='</div>';
 body.innerHTML=html;
}

// ── Init ───────────────────────────────────────────────────
setupScene();
renderPanel();
updateGoldHUD();
msg('Tap and hold to charge cast!',2500);
_raf(tick);
}
(()=>{
let _spellEl=null,_spellRAF=null;
window._launchSpell=function(){
  window.paused=true;
  if(window._menuEl)window._menuEl.style.display='none';
  if(window._homeBtn)window._homeBtn.style.display='';
  window._spellActive=true;
  if(_spellEl){_spellEl.remove();_spellEl=null;}
  if(_spellRAF){_caf(_spellRAF);_spellRAF=null;}
  _buildSpell();
};
window._exitSpell=function(){
  window._spellActive=false;
  window.paused=false;
  if(_spellRAF){_caf(_spellRAF);_spellRAF=null;}
  if(_spellEl){_spellEl.remove();_spellEl=null;}
  if(window._menuEl)window._menuEl.style.display='flex';
  if(window._randomiseFeatured)window._randomiseFeatured();
  if(window._homeBtn)window._homeBtn.style.display='none';
};

function _buildSpell(){
const SPELLS=[
  {id:'fireball',    e:'🔥',name:'Fireball',    desc:'Burns one enemy for 2 turns',  cost:2, target:'single', effect:'burn'},
  {id:'lightning',   e:'⚡',name:'Lightning',   desc:'Chains to 3 enemies',          cost:3, target:'chain3', effect:'shock'},
  {id:'iceshard',    e:'❄️',name:'Ice Shard',   desc:'Freezes target, skips turn',   cost:2, target:'single', effect:'freeze'},
  {id:'tidal',       e:'🌊',name:'Tidal Wave',  desc:'Pushes all enemies back',      cost:3, target:'all',    effect:'push'},
  {id:'explosion',   e:'💥',name:'Explosion',   desc:'AoE hits everything near',     cost:4, target:'aoe',    effect:'blast'},
  {id:'vortex',      e:'🌀',name:'Vortex',      desc:'Pulls all to centre +dmg',     cost:4, target:'all',    effect:'pull'},
  {id:'barrier',     e:'🛡️',name:'Barrier',    desc:'Absorb next hit',              cost:2, target:'self',   effect:'shield'},
  {id:'heal',        e:'💧',name:'Heal',        desc:'Restore 20 HP',                cost:2, target:'self',   effect:'heal'},
  {id:'meteor',      e:'☄️',name:'Meteor',     desc:'Massive damage, 2-turn CD',    cost:5, target:'single', effect:'meteor'},
  {id:'poison',      e:'🍄',name:'Poison Cloud',desc:'Poisons all enemies 3 turns',  cost:3, target:'all',    effect:'poison'},
  {id:'tornado',     e:'🌪️',name:'Tornado',    desc:'Hits 5 random enemies',        cost:3, target:'random5',effect:'wind'},
  {id:'shadow',      e:'🌑',name:'Shadow Clone',desc:'Decoy absorbs one hit',        cost:2, target:'self',   effect:'decoy'},
];
const ENEMY_TYPES=[
  {e:'🐀',name:'Rat',        hp:8,  atk:3, spd:2, reward:2, row:0, special:null},
  {e:'🐊',name:'Croc',       hp:30, atk:8, spd:1, reward:5, row:0, special:'tanky'},
  {e:'🦊',name:'Fox',        hp:15, atk:5, spd:1, reward:4, row:0, special:'dodge'},
  {e:'🐗',name:'Boar',       hp:20, atk:7, spd:1, reward:4, row:0, special:'charge'},
  {e:'🦡',name:'Badger',     hp:18, atk:4, spd:1, reward:5, row:0, special:'heal_adj'},
  {e:'🐍',name:'Snake',      hp:12, atk:5, spd:1, reward:4, row:0, special:'poison'},
  {e:'🐢',name:'Turtle',     hp:25, atk:4, spd:1, reward:5, row:0, special:'armoured'},
  {e:'🦝',name:'Raccoon',    hp:14, atk:4, spd:1, reward:5, row:0, special:'steal'},
  {e:'🐻',name:'Bear',       hp:40, atk:6, spd:1, reward:7, row:0, special:'enrage'},
  {e:'🦌',name:'Deer',       hp:16, atk:4, spd:1, reward:5, row:0, special:'summon'},
  {e:'🦇',name:'Bat',        hp:10, atk:4, spd:2, reward:3, row:1, special:'double'},
  {e:'🦅',name:'Eagle',      hp:18, atk:7, spd:1, reward:6, row:1, special:'bypass'},
  {e:'🪲',name:'Beetle',     hp:20, atk:5, spd:1, reward:4, row:1, special:'armoured'},
  {e:'🐝',name:'Bee',        hp:5,  atk:3, spd:2, reward:2, row:1, special:'swarm'},
  {e:'🦉',name:'Owl',        hp:16, atk:5, spd:1, reward:6, row:1, special:'silence'},
  {e:'🧟',name:'Zombie Duck',hp:18, atk:5, spd:1, reward:5, row:0, special:'split'},
  {e:'💀',name:'Skeleton',   hp:15, atk:6, spd:1, reward:5, row:0, special:'fire_immune'},
  {e:'👻',name:'Ghost',      hp:12, atk:6, spd:1, reward:6, row:0, special:'magic_only'},
  {e:'🕷️',name:'Spider',    hp:14, atk:5, spd:1, reward:5, row:0, special:'web'},
  {e:'🦴',name:'Bone Drake', hp:35, atk:8, spd:1, reward:8, row:0, special:'summon_bones'},
  {e:'🐸',name:'Frog',       hp:12, atk:4, spd:2, reward:4, row:0, special:'jump'},
  {e:'🦑',name:'Squid',      hp:20, atk:5, spd:1, reward:6, row:1, special:'ink'},
  {e:'🦀',name:'Crab',       hp:22, atk:5, spd:1, reward:5, row:0, special:'block_adj'},
  {e:'🐙',name:'Octopus',    hp:25, atk:4, spd:1, reward:6, row:1, special:'drain_mana'},
  {e:'🐡',name:'Pufferfish', hp:14, atk:3, spd:1, reward:5, row:1, special:'explode_death'},
  {e:'🧿',name:'Eye',        hp:16, atk:0, spd:1, reward:7, row:1, special:'mirror'},
  {e:'🔮',name:'Orb',        hp:20, atk:0, spd:1, reward:6, row:1, special:'shield_adj'},
  {e:'⚗️',name:'Alchemist',  hp:18, atk:4, spd:1, reward:8, row:1, special:'transform'},
  {e:'🌑',name:'Shadow Duck', hp:20, atk:7, spd:2, reward:7, row:0, special:'teleport'},
  {e:'🧊',name:'Ice Golem',  hp:35, atk:5, spd:1, reward:8, row:0, special:'slow_spells'},
];
const BOSSES=[
  {e:'💀',name:'Lich Duck',   hp:120,atk:12,reward:30,special:'raise_dead',wave:5},
  {e:'🐲',name:'Dragon',      hp:160,atk:15,reward:40,special:'breathe_fire',wave:10},
  {e:'🧙',name:'Dark Wizard', hp:140,atk:10,reward:40,special:'mirror_spell',wave:15},
  {e:'🌊',name:'Kraken',      hp:180,atk:12,reward:50,special:'pull',wave:20},
  {e:'👑',name:'Rat King',    hp:100,atk:8, reward:35,special:'swarm_call',wave:25},
  {e:'🌑',name:'Void Duck',   hp:200,atk:14,reward:60,special:'nullify',wave:30},
];

let player={hp:100,maxHp:100,mana:10,maxMana:10,wave:0,dust:0,shield:false,decoy:false,poisoned:0,webbed:0,silenced:[],spellCDs:{},enrageTurn:0};
let enemies=[];
let hand=[];
let allSpells=[...SPELLS];
let unlockedSpells=['fireball','lightning','iceshard','tidal','barrier','heal'];
let log=[];
let phase='wave_start'; // wave_start|player_turn|enemy_turn|wave_end|shop|game_over
let selectedSpell=null;
let selectedEnemy=null;
let animating=false;
let particles=[];
let frameCount=0;

// ── DOM ──────────────────────────────────────────────────────
_spellEl=_ce('div');
_spellEl.style.cssText='position:fixed;inset:0;z-index:1000085;background:#07091a;font-family:Nunito,sans-serif;display:flex;flex-direction:column;overflow:hidden;user-select:none;-webkit-user-select:none;touch-action:manipulation;';

_spellEl.innerHTML=`
<div id="sp-hud" style="background:linear-gradient(180deg,#0d0f24,#10122a);border-bottom:1px solid rgba(255,255,255,0.07);padding:8px 14px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
  <div style="display:flex;flex-direction:column;gap:3px;">
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="font-size:20px;">🧙🦆</span>
      <div>
        <div id="sp-hp-bar" style="width:120px;height:7px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;"><div id="sp-hp-fill" style="height:100%;background:linear-gradient(90deg,#e84040,#f07030);border-radius:4px;width:100%;transition:width .3s;"></div></div>
        <div id="sp-hp-text" style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:1px;">100/100 HP</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;">
      <div id="sp-mana-bar" style="width:120px;height:5px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;"><div id="sp-mana-fill" style="height:100%;background:linear-gradient(90deg,#4060f0,#80a0ff);border-radius:3px;width:100%;transition:width .3s;"></div></div>
      <div id="sp-mana-text" style="font-size:9px;color:rgba(120,160,255,0.7);">10/10 💧</div>
    </div>
  </div>
  <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">
    <div id="sp-wave" style="font-size:11px;font-weight:900;color:#f5e642;">Wave 0</div>
    <div id="sp-dust" style="font-size:10px;color:rgba(255,255,255,0.5);">✨ 0</div>
    <div id="sp-status" style="font-size:9px;color:rgba(255,255,255,0.35);"></div>
  </div>
</div>
<canvas id="sp-canvas" style="flex:1;display:block;width:100%;"></canvas>
<div id="sp-log-bar" style="background:rgba(0,0,0,0.5);padding:4px 14px;height:22px;display:flex;align-items:center;overflow:hidden;flex-shrink:0;">
  <div id="sp-log-text" style="font-size:10px;color:rgba(255,255,255,0.5);white-space:nowrap;"></div>
</div>
<div id="sp-hand" style="background:linear-gradient(0deg,#0d0f24,#10122a);border-top:1px solid rgba(255,255,255,0.07);padding:8px 10px;display:flex;gap:7px;overflow-x:auto;flex-shrink:0;scrollbar-width:none;-webkit-overflow-scrolling:touch;min-height:90px;align-items:center;">
</div>
<div id="sp-overlay" style="display:none;position:absolute;inset:0;background:rgba(0,0,0,0.85);z-index:50;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px;"></div>
`;
_ba(_spellEl);

const canvas=_gi('sp-canvas');
const ctx=canvas.getContext('2d');
const hand_el=_gi('sp-hand');
const overlay=_gi('sp-overlay');
let W=0,H=0;

function resize(){
  const r=canvas.getBoundingClientRect();
  W=canvas.width=_rnd(r.width*devicePixelRatio);
  H=canvas.height=_rnd(r.height*devicePixelRatio);
}
resize();
window.addEventListener('resize',resize);

// ── Helpers ──────────────────────────────────────────────────
function addLog(msg){log.unshift(msg);if(log.length>6)log.pop();const el=_gi('sp-log-text');if(el)el.textContent=log[0];}
function uid(){return Math.random().toString(36).slice(2,8);}
function clamp(v,a,b){return _mn(b,_mx(a,v));}

function getSpell(id){return SPELLS.find(s=>s.id===id);}
function getEnemy(idx){return enemies[idx]||null;}

// ── Wave generation ───────────────────────────────────────────
function genWave(){
  player.wave++;
  enemies=[];
  // Check for boss
  const boss=BOSSES.find(b=>b.wave===player.wave);
  if(boss){
    enemies.push({...boss,id:uid(),maxHp:boss.hp,status:[],isBoss:true,row:0,x:0,y:0});
    addLog(`⚠️ BOSS: ${boss.e} ${boss.name} appears!`);
  } else {
    // Scale difficulty
    const count=3+_mf(player.wave*0.8);
    const pool=ENEMY_TYPES.filter(e=>player.wave>=1+(ENEMY_TYPES.indexOf(e)*0.5)|0);
    const available=pool.length?pool:ENEMY_TYPES.slice(0,5);
    for(let i=0;i<_mn(count,8);i++){
      const t=available[_mf(_mr()*available.length)];
      const scale=1+player.wave*0.06;
      enemies.push({...t,id:uid(),hp:_mf(t.hp*scale),maxHp:_mf(t.hp*scale),atk:_mf(t.atk*scale*(0.8+_mr()*0.4)),status:[],isBoss:false,x:0,y:0});
    }
  }
  // Restore some mana/hp
  player.mana=player.maxMana;
  player.shield=false;
  player.decoy=false;
  if(player.silenced)player.silenced=[];
  phase='player_turn';
  drawHand();
  updateHUD();
  addLog(`🌊 Wave ${player.wave} begins! ${enemies.length} enemies`);
}

// ── Hand ──────────────────────────────────────────────────────
function drawHand(){
  hand_el.innerHTML='';
  // Draw 4 spells from unlocked pool
  const pool=SPELLS.filter(s=>unlockedSpells.includes(s.id));
  // Keep existing hand if in mid-turn, else fresh draw
  if(hand.length===0||phase==='wave_start'||phase==='player_turn'&&hand.length<4){
    hand=[];
    const used=new Set();
    while(hand.length<_mn(4,pool.length)){
      const pick=pool[_mf(_mr()*pool.length)];
      if(!used.has(pick.id)||pool.length<=4){used.add(pick.id);hand.push({...pick});}
    }
  }
  hand.forEach((sp,i)=>{
    const cd=player.spellCDs[sp.id]||0;
    const silenced=player.silenced&&player.silenced.includes(sp.id);
    const cantAfford=sp.cost>player.mana;
    const disabled=cd>0||silenced||cantAfford||phase!=='player_turn'||animating;
    const card=_ce('div');
    card.style.cssText=`flex-shrink:0;width:68px;border-radius:12px;padding:7px 6px;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:${disabled?'default':'pointer'};background:${selectedSpell===i?'rgba(100,150,255,0.2)':'rgba(255,255,255,0.05)'};border:1.5px solid ${selectedSpell===i?'rgba(100,150,255,0.6)':'rgba(255,255,255,0.1)'};opacity:${disabled?'0.4':'1'};transition:all .15s;touch-action:manipulation;`;
    card.innerHTML=`<div style="font-size:22px;line-height:1;">${sp.e}</div><div style="font-size:9px;font-weight:900;color:#fff;text-align:center;line-height:1.2;">${sp.name}</div><div style="font-size:9px;color:${cantAfford?'#ff5040':'rgba(120,160,255,0.8)'};">💧${sp.cost}</div>${cd>0?`<div style="font-size:8px;color:#f07030;">CD:${cd}</div>`:''}${silenced?'<div style="font-size:8px;color:#888;">🔇</div>':''}`;
    if(!disabled){
      card.addEventListener('pointerdown',e=>{e.stopPropagation();selectSpell(i);});
    }
    hand_el.appendChild(card);
  });
  // End turn button
  if(phase==='player_turn'&&!animating){
    const endBtn=_ce('button');
    endBtn.style.cssText='flex-shrink:0;width:60px;padding:8px 4px;border-radius:12px;border:1.5px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;';
    endBtn.textContent='End\nTurn';
    endBtn.addEventListener('pointerdown',e=>{e.stopPropagation();endTurn();});
    hand_el.appendChild(endBtn);
  }
}

function selectSpell(i){
  if(animating||phase!=='player_turn')return;
  selectedSpell=selectedSpell===i?null:i;
  selectedEnemy=null;
  drawHand();
  // Auto-cast self spells
  if(selectedSpell!==null){
    const sp=hand[selectedSpell];
    if(sp.target==='self'){castSpell(sp,null);}
    else if(sp.target==='all'||sp.target==='aoe'||sp.target==='random5'){castSpell(sp,null);}
  }
}

function selectTarget(idx){
  if(selectedSpell===null||animating)return;
  const sp=hand[selectedSpell];
  if(sp.target==='self'||sp.target==='all')return;
  castSpell(sp,idx);
}

// ── Spell casting ─────────────────────────────────────────────
function castSpell(sp,targetIdx){
  if(player.mana<sp.cost){addLog('Not enough mana!');return;}
  if(player.spellCDs[sp.id]>0){addLog('Spell on cooldown!');return;}
  animating=true;
  player.mana-=sp.cost;
  if(sp.id==='meteor')player.spellCDs[sp.id]=2;
  selectedSpell=null;
  selectedEnemy=null;

  const target=targetIdx!==null?enemies[targetIdx]:null;
  let dmg=0;
  let hits=[];

  switch(sp.target){
    case 'single':
      if(!target){animating=false;drawHand();return;}
      dmg=spellDmg(sp);
      hits=[{idx:targetIdx,dmg}];
      break;
    case 'chain3':{
      const sorted=[...enemies.keys()].sort(()=>_mr()-0.5).slice(0,3);
      sorted.forEach(i=>{hits.push({idx:i,dmg:spellDmg(sp)});});
      break;}
    case 'all':
      enemies.forEach((_,i)=>hits.push({idx:i,dmg:spellDmg(sp)}));
      break;
    case 'aoe':
      if(!target){animating=false;drawHand();return;}
      enemies.forEach((_,i)=>hits.push({idx:i,dmg:_mf(spellDmg(sp)*(i===targetIdx?1:0.5))}));
      break;
    case 'random5':{
      const idxs=enemies.map((_,i)=>i);
      for(let i=0;i<_mn(5,idxs.length);i++){
        const pick=idxs[_mf(_mr()*idxs.length)];
        hits.push({idx:pick,dmg:spellDmg(sp)});
      }
      break;}
    case 'self':
      applyPlayerEffect(sp);
      animating=false;
      addLog(`${sp.e} ${sp.name}!`);
      postCast();
      return;
  }

  // Apply hits with animation delay
  spawnSpellParticle(sp.e,sp.effect);
  addLog(`${sp.e} ${sp.name}!`);
  setTimeout(()=>{
    hits.forEach(h=>{
      if(!enemies[h.idx])return;
      const e=enemies[h.idx];
      // Check dodge
      if(e.special==='dodge'&&_mr()<0.4){addLog(`${e.e} ${e.name} dodged!`);return;}
      // Check armoured
      if(e.special==='armoured'&&sp.effect!=='blast'&&sp.effect!=='wind'){h.dmg=_mf(h.dmg*0.4);}
      // Check magic_only
      if(e.special==='magic_only'&&sp.effect==='burn')h.dmg=0;
      // Check fire_immune
      if(e.special==='fire_immune'&&sp.effect==='burn')h.dmg=0;
      applyDmgToEnemy(h.idx,h.dmg,sp.effect);
    });
    // Apply field effects
    if(sp.effect==='freeze'&&target){addStatus(targetIdx,'frozen',2);}
    if(sp.effect==='poison'){enemies.forEach((_,i)=>addStatus(i,'poisoned',3));}
    if(sp.effect==='push'){enemies.forEach(e=>{if(e.row>0)e.row--;});}
    if(sp.effect==='pull'){enemies.forEach(e=>{e.row=_mn(e.row+1,2);});}
    removeDeadEnemies();
    animating=false;
    postCast();
  },350);
}

function spellDmg(sp){
  const base={fireball:18,lightning:14,iceshard:16,tidal:10,explosion:22,vortex:12,barrier:0,heal:0,meteor:45,poison:8,tornado:14,shadow:0};
  return _mf((base[sp.id]||10)*(0.85+_mr()*0.3));
}

function applyPlayerEffect(sp){
  if(sp.id==='barrier'){player.shield=true;addLog('🛡️ Barrier up!');}
  if(sp.id==='heal'){const amt=20;player.hp=_mn(player.maxHp,player.hp+amt);addLog(`💧 Healed ${amt} HP!`);}
  if(sp.id==='shadow'){player.decoy=true;addLog('🌑 Shadow Clone summoned!');}
  updateHUD();
}

function applyDmgToEnemy(idx,dmg,effect){
  if(!enemies[idx])return;
  const e=enemies[idx];
  e.hp-=dmg;
  spawnDmgNumber(e,dmg);
  addStatus(idx,effect,effect==='burn'?2:effect==='shock'?1:0);
}

function addStatus(idx,status,turns){
  if(!enemies[idx]||!status||turns<=0)return;
  const e=enemies[idx];
  e.status=e.status||[];
  const existing=e.status.find(s=>s.type===status);
  if(existing)existing.turns=_mx(existing.turns,turns);
  else e.status.push({type:status,turns});
}

function removeDeadEnemies(){
  const dead=enemies.filter(e=>e.hp<=0);
  dead.forEach(e=>{
    player.dust+=e.reward;
    // Split zombie
    if(e.special==='split'&&!e._split){
      const t=ENEMY_TYPES.find(t=>t.name==='Rat');
      if(t){enemies.push({...t,id:uid(),hp:t.hp,maxHp:t.hp,atk:t.atk,status:[],_split:true,row:e.row,x:e.x,y:e.y});}
    }
    // Explode death
    if(e.special==='explode_death'){
      player.hp-=10;
      addLog(`💥 ${e.e} exploded! -10 HP`);
      updateHUD();
    }
    addLog(`${e.e} ${e.name} defeated! +${e.reward}✨`);
  });
  enemies=enemies.filter(e=>e.hp>0);
}

function postCast(){
  // Tick CDs
  Object.keys(player.spellCDs).forEach(id=>{if(player.spellCDs[id]>0)player.spellCDs[id]--;});
  drawHand();
  updateHUD();
  if(enemies.length===0){waveEnd();return;}
}

function endTurn(){
  if(animating||phase!=='player_turn')return;
  phase='enemy_turn';
  drawHand();
  doEnemyTurn();
}

// ── Enemy turn ────────────────────────────────────────────────
function doEnemyTurn(){
  animating=true;
  let delay=0;
  enemies.forEach((e,i)=>{
    setTimeout(()=>{
      if(!enemies[i])return;
      // Tick statuses
      e.status=e.status||[];
      e.status.forEach(s=>{
        if(s.type==='poisoned'){e.hp-=4;spawnDmgNumber(e,4,'#40c040');addLog(`☠️ ${e.e} poisoned -4`);}
        s.turns--;
      });
      e.status=e.status.filter(s=>s.turns>0);
      if(e.hp<=0){removeDeadEnemies();return;}
      // Frozen - skip
      if(e.status.find(s=>s.type==='frozen')){addLog(`❄️ ${e.e} is frozen!`);return;}
      // Heal adjacent
      if(e.special==='heal_adj'){
        const adj=enemies.filter((_,j)=>j!==i&&_ma(j-i)===1);
        adj.forEach(a=>{a.hp=_mn(a.maxHp,a.hp+6);});
        if(adj.length)addLog(`${e.e} ${e.name} healed allies`);
      }
      // Shield adjacent
      if(e.special==='shield_adj'){
        enemies.filter((_,j)=>j!==i&&_ma(j-i)<=1).forEach(a=>addStatus(enemies.indexOf(a),'shielded',1));
      }
      // Steal spell
      if(e.special==='steal'&&hand.length>0&&_mr()<0.4){
        const stolen=hand.splice(_mf(_mr()*hand.length),1)[0];
        if(stolen){addLog(`🦝 Raccoon stole ${stolen.e} ${stolen.name}!`);drawHand();}
      }
      // Silence
      if(e.special==='silence'&&_mr()<0.5){
        const sp=hand[_mf(_mr()*hand.length)];
        if(sp){player.silenced=[...(player.silenced||[]),sp.id];addLog(`🦉 ${sp.name} silenced!`);}
      }
      // Mirror
      if(e.special==='mirror'&&_mr()<0.3){addLog(`🧿 Eye mirrors your last spell!`);}
      // Transform
      if(e.special==='transform'&&_mr()<0.2&&enemies.length<8){
        const t=ENEMY_TYPES[_mf(_mr()*_mn(ENEMY_TYPES.length,player.wave*2))];
        enemies.push({...t,id:uid(),hp:t.hp,maxHp:t.hp,atk:t.atk,status:[],row:0,x:0,y:0});
        addLog(`⚗️ Alchemist summoned ${t.e} ${t.name}!`);
      }
      // Drain mana
      if(e.special==='drain_mana'){player.mana=_mx(0,player.mana-2);addLog(`🐙 Drained 2 mana!`);}
      // Web
      if(e.special==='web'&&_mr()<0.3){
        player.webbed=(player.webbed||0)+1;
        addLog(`🕷️ You're webbed! Skip next turn`);
      }
      // Ink
      if(e.special==='ink'&&_mr()<0.3){addLog(`🦑 Inked! Spells randomised`);}
      // Summon
      if(e.special==='summon'&&enemies.length<8){
        const rat=ENEMY_TYPES[0];
        enemies.push({...rat,id:uid(),hp:rat.hp,maxHp:rat.hp,atk:rat.atk,status:[],row:0,x:0,y:0});
        addLog(`🦌 ${e.name} summoned a rat!`);
      }
      // Summon bones
      if(e.special==='summon_bones'&&enemies.length<8){
        const skel=ENEMY_TYPES.find(t=>t.name==='Skeleton')||ENEMY_TYPES[0];
        enemies.push({...skel,id:uid(),hp:skel.hp,maxHp:skel.hp,atk:skel.atk,status:[],row:0,x:0,y:0});
        addLog(`🦴 Bone Drake summoned skeleton!`);
      }
      // Raise dead (Lich)
      if(e.special==='raise_dead'&&_mr()<0.3&&enemies.length<8){
        const zombie=ENEMY_TYPES.find(t=>t.name==='Zombie Duck')||ENEMY_TYPES[0];
        enemies.push({...zombie,id:uid(),hp:zombie.hp,maxHp:zombie.hp,atk:zombie.atk,status:[],row:0,x:0,y:0});
        addLog(`💀 Lich raised a zombie duck!`);
      }
      // Swarm call
      if(e.special==='swarm_call'&&enemies.length<8){
        for(let j=0;j<2;j++){
          const rat=ENEMY_TYPES[0];
          enemies.push({...rat,id:uid(),hp:rat.hp,maxHp:rat.hp,atk:rat.atk,status:[],row:0,x:0,y:0});
        }
        addLog(`👑 Rat King calls the swarm!`);
      }
      // Charge
      if(e.special==='charge'){e.row=_mx(0,e.row-1);}
      // Bypass (Eagle attacks regardless of row)
      // Enrage
      if(e.special==='enrage'&&e.hp<e.maxHp*0.5&&!e._enraged){e._enraged=true;e.atk=_mf(e.atk*2);addLog(`🐻 Bear ENRAGED!`);}
      // Teleport
      if(e.special==='teleport'&&_mr()<0.3){e.row=0;addLog(`🌑 Shadow Duck teleports!`);}
      // Breathe fire (Dragon)
      if(e.special==='breathe_fire'){
        const burn=_mf(e.atk*1.5);
        dealDmgToPlayer(burn,e);
        addLog(`🔥 Dragon breathes fire! -${burn} HP`);
        return;
      }
      // Nullify (Void Duck)
      if(e.special==='nullify'&&_mr()<0.4){
        player.spellCDs[hand[0]?.id||'fireball']=3;
        addLog(`🌑 Void Duck nullified a spell!`);
      }
      // Normal attack
      if(e.row===0||e.special==='bypass'){
        let atk=e.atk;
        if(e.special==='double')atk*=2;
        dealDmgToPlayer(atk,e);
      } else {
        e.row=_mx(0,e.row-1);
        addLog(`${e.e} ${e.name} advances!`);
      }
    }, delay);
    delay+=120;
  });
  setTimeout(()=>{
    removeDeadEnemies();
    if(player.hp<=0){gameOver();return;}
    if(enemies.length===0){waveEnd();return;}
    // Webbed - auto end next turn
    if(player.webbed>0){
      player.webbed--;
      addLog('🕷️ Webbed! Turn skipped');
      phase='player_turn';
      player.mana=_mn(player.maxMana,player.mana+3);
      animating=false;
      drawHand();updateHUD();
      setTimeout(endTurn,600);
      return;
    }
    phase='player_turn';
    player.mana=_mn(player.maxMana,player.mana+4);
    // Tick silenced
    if(player.silenced&&player.silenced.length>0)player.silenced=[];
    animating=false;
    hand=[]; // fresh hand
    drawHand();
    updateHUD();
  }, delay+300);
}

function dealDmgToPlayer(dmg,attacker){
  if(player.decoy){player.decoy=false;addLog('🌑 Decoy absorbed the hit!');return;}
  if(player.shield){player.shield=false;addLog('🛡️ Barrier blocked the hit!');return;}
  if(attacker.special==='poison'){player.poisoned=(player.poisoned||0)+3;}
  player.hp-=dmg;
  player.hp=_mx(0,player.hp);
  spawnPlayerHitParticle(dmg);
  addLog(`${attacker.e} ${attacker.name} attacks! -${dmg} HP`);
  updateHUD();
}

// ── Wave end / shop ───────────────────────────────────────────
function waveEnd(){
  phase='wave_end';
  animating=false;
  // Tick poison on player
  if(player.poisoned>0){
    player.hp=_mx(0,player.hp-6);
    player.poisoned--;
    updateHUD();
  }
  showShop();
}

function showShop(){
  overlay.style.display='flex';
  overlay.innerHTML='';
  const w=_ce('div');w.style.cssText='width:100%;max-width:340px;display:flex;flex-direction:column;gap:8px;';
  w.innerHTML=`<div style="text-align:center;"><div style="font-size:28px;">🪷</div><div style="font-size:18px;font-weight:900;color:#fff;">Lily Pad Shop</div><div style="font-size:12px;color:#f5e642;margin-top:2px;">✨ ${player.dust} spell dust</div></div>`;
  // Shop items
  const items=[
    {e:'❤️',name:'Health Potion',desc:'Restore 40 HP',cost:8,apply:()=>{player.hp=_mn(player.maxHp,player.hp+40);addLog('❤️ +40 HP');}},
    {e:'💎',name:'Mana Crystal',desc:'+2 max mana permanently',cost:12,apply:()=>{player.maxMana+=2;player.mana=_mn(player.maxMana,player.mana+2);addLog('💎 +2 max mana');}},
    {e:'🗡️',name:'Power Surge',desc:'+25% spell damage this run',cost:10,apply:()=>{player._dmgBoost=(player._dmgBoost||1)*1.25;addLog('🗡️ +25% spell damage');}},
    {e:'🌿',name:'Regeneration',desc:'Heal 8 HP per wave',cost:15,apply:()=>{player._regen=(player._regen||0)+8;addLog('🌿 Regen +8/wave');}},
  ];
  // Unlock new spell
  const locked=SPELLS.filter(s=>!unlockedSpells.includes(s.id));
  if(locked.length>0){
    const pick=locked[_mf(_mr()*locked.length)];
    items.push({e:pick.e,name:`Unlock: ${pick.name}`,desc:pick.desc,cost:15,apply:()=>{unlockedSpells.push(pick.id);addLog(`${pick.e} ${pick.name} unlocked!`);}});
  }
  const grid=_ce('div');grid.style.cssText='display:flex;flex-direction:column;gap:6px;';
  items.forEach(item=>{
    const can=player.dust>=item.cost;
    const d=_ce('div');
    d.style.cssText=`background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,${can?'0.12':'0.05'});border-radius:12px;padding:10px 12px;display:flex;align-items:center;gap:10px;cursor:${can?'pointer':'default'};opacity:${can?'1':'0.45'};`;
    d.innerHTML=`<span style="font-size:22px;">${item.e}</span><div style="flex:1;"><div style="font-size:12px;font-weight:900;color:#fff;">${item.name}</div><div style="font-size:10px;color:rgba(255,255,255,0.4);">${item.desc}</div></div><div style="font-size:11px;font-weight:900;color:${can?'#f5e642':'#ff5040'};">✨${item.cost}</div>`;
    if(can){d.addEventListener('pointerdown',e=>{e.stopPropagation();player.dust-=item.cost;item.apply();updateHUD();showShop();});}
    grid.appendChild(d);
  });
  w.appendChild(grid);
  const nextBtn=_ce('button');
  nextBtn.style.cssText='padding:14px;border-radius:14px;border:none;background:linear-gradient(135deg,#3050c0,#5080f0);color:#fff;font-size:15px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;width:100%;margin-top:4px;';
  nextBtn.textContent=`▶ Wave ${player.wave+1}`;
  nextBtn.addEventListener('pointerdown',e=>{
    e.stopPropagation();
    overlay.style.display='none';
    // Apply regen
    if(player._regen){player.hp=_mn(player.maxHp,player.hp+player._regen);}
    hand=[];
    genWave();
  });
  w.appendChild(nextBtn);
  overlay.appendChild(w);
  updateHUD();
}

function gameOver(){
  phase='game_over';
  overlay.style.display='flex';
  overlay.innerHTML=`
  <div style="text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px;">
    <div style="font-size:48px;">💀</div>
    <div style="font-size:22px;font-weight:900;color:#fff;">Defeated!</div>
    <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px 24px;font-size:12px;color:rgba(255,255,255,0.5);">
      <div>Survived <span style="color:#fff;font-weight:900;">Wave ${player.wave}</span></div>
      <div style="margin-top:4px;">Collected <span style="color:#f5e642;font-weight:900;">✨ ${player.dust}</span> spell dust</div>
    </div>
    <button id="sp-retry" style="padding:14px 32px;border-radius:14px;border:none;background:linear-gradient(135deg,#3050c0,#5080f0);color:#fff;font-size:15px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">▶ Try Again</button>
    <button id="sp-menu-go" style="padding:10px 28px;border-radius:12px;border:1.5px solid rgba(255,255,255,0.15);background:transparent;color:rgba(255,255,255,0.6);font-size:13px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">🏠 Menu</button>
  </div>`;
  setTimeout(()=>{
    const r=_gi('sp-retry');if(r)r.addEventListener('pointerdown',e=>{e.stopPropagation();resetGame();});
    const m=_gi('sp-menu-go');if(m)m.addEventListener('pointerdown',e=>{e.stopPropagation();window._exitSpell();});
  },50);
}

function resetGame(){
  player={hp:100,maxHp:100,mana:10,maxMana:10,wave:0,dust:0,shield:false,decoy:false,poisoned:0,webbed:0,silenced:[],spellCDs:{}};
  enemies=[];hand=[];log=[];
  unlockedSpells=['fireball','lightning','iceshard','tidal','barrier','heal'];
  phase='wave_start';selectedSpell=null;selectedEnemy=null;animating=false;
  overlay.style.display='none';
  genWave();
}

// ── HUD ───────────────────────────────────────────────────────
function updateHUD(){
  const hpf=_gi('sp-hp-fill');if(hpf)hpf.style.width=(player.hp/player.maxHp*100)+'%';
  const hpt=_gi('sp-hp-text');if(hpt)hpt.textContent=player.hp+'/'+player.maxHp+' HP';
  const mf=_gi('sp-mana-fill');if(mf)mf.style.width=(player.mana/player.maxMana*100)+'%';
  const mt=_gi('sp-mana-text');if(mt)mt.textContent=player.mana+'/'+player.maxMana+' 💧';
  const wv=_gi('sp-wave');if(wv)wv.textContent='Wave '+player.wave;
  const du=_gi('sp-dust');if(du)du.textContent='✨ '+player.dust;
  const st=_gi('sp-status');
  if(st){
    const flags=[];
    if(player.shield)flags.push('🛡️');
    if(player.decoy)flags.push('🌑');
    if(player.poisoned)flags.push('☠️x'+player.poisoned);
    st.textContent=flags.join(' ');
  }
}

// ── Particles & canvas ────────────────────────────────────────
function spawnSpellParticle(emoji,effect){
  const colors={burn:'#ff6030',shock:'#f0e040',freeze:'#40c0ff',blast:'#ff8030',wind:'#80f080',pull:'#c060ff',poison:'#40c040',meteor:'#ff4020',heal:'#40ff80',shield:'#4080ff'};
  const col=colors[effect]||'#ffffff';
  if(particles.length>18)particles.length=18;
  for(let i=0;i<7;i++){
    const a=_mr()*Math.PI*2,spd=(1+_mr()*3)*(W/400);
    particles.push({x:W/2,y:H/2,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,life:1,r:(3+_mr()*5)*(W/400),color:col,type:'spell'});
  }
}

function spawnDmgNumber(enemy,dmg,col){
  if(!enemy)return;
  particles.push({x:enemy.x||W*0.7,y:enemy.y||H*0.4,vx:(_mr()-.5)*2,vy:-3,life:1.2,txt:'-'+dmg,color:col||'#ff6040',type:'text'});
}

function spawnPlayerHitParticle(dmg){
  particles.push({x:W*0.15,y:H*0.4,vx:-2,vy:-3,life:1.2,txt:'-'+dmg,color:'#ff4040',type:'text'});
}

// ── Canvas draw ───────────────────────────────────────────────
function draw(){
  ctx.clearRect(0,0,W,H);
  const dpr=devicePixelRatio||1;

  // Background
  ctx.fillStyle='#080a1c';
  ctx.fillRect(0,0,W,H);

  // Pond glow — ellipse instead of gradient
  ctx.globalAlpha=0.13;
  ctx.fillStyle='#1450a0';
  ctx.beginPath();ctx.ellipse(W/2,H*0.55,W*0.35,H*0.2,0,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=1;

  // Draw player
  const px=W*0.12,py=H*0.45;
  ctx.font=`${_mf(38*W/400)}px serif`;
  ctx.textAlign='center';ctx.textBaseline='middle';
  if(player.shield){
    ctx.globalAlpha=0.4+Math.sin(frameCount*0.1)*0.2;
    ctx.fillStyle='#4080ff';
    ctx.beginPath();ctx.arc(px,py,28*W/400,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=1;
  }
  ctx.fillText('🧙🦆',px,py);

  // Draw enemies
  const cols=_mn(enemies.length,4);
  const rows=Math.ceil(enemies.length/cols)||1;
  const cellW=W*0.65/cols;
  const cellH=H*0.55/rows;
  const startX=W*0.3;
  const startY=H*0.15;

  enemies.forEach((e,i)=>{
    const col=i%cols;
    const row=_mf(i/cols);
    const ex=startX+col*cellW+cellW/2;
    const ey=startY+row*cellH+cellH/2;
    e.x=ex;e.y=ey;

    // HP bar
    const barW=cellW*0.7;
    const barX=ex-barW/2;
    const barY=ey+18*W/400;
    ctx.fillStyle='rgba(0,0,0,0.5)';
    ctx.fillRect(barX,barY,barW,5*W/400);
    const pct=e.hp/e.maxHp;
    ctx.fillStyle=pct>0.5?'#40c040':pct>0.25?'#c0c040':'#c04040';
    ctx.fillRect(barX,barY,barW*pct,5*W/400);

    // Status icons
    const statuses=e.status||[];
    statuses.forEach((s,si)=>{
      ctx.font=`${_mf(12*W/400)}px serif`;
      ctx.fillText(s.type==='frozen'?'❄️':s.type==='poisoned'?'☠️':s.type==='burn'?'🔥':'✨',ex-10*W/400+si*12*W/400,ey-24*W/400);
    });

    // Enemy emoji
    const fontSize=e.isBoss?_mf(44*W/400):_mf(32*W/400);
    ctx.font=`${fontSize}px serif`;

    // Selected glow
    if(selectedEnemy===i){
      ctx.globalAlpha=0.4+Math.sin(frameCount*0.15)*0.2;
      ctx.fillStyle='#f5e642';
      ctx.beginPath();ctx.arc(ex,ey,22*W/400,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=1;
    }
    ctx.fillText(e.e,ex,ey);

    // HP text
    ctx.font=`bold ${_mf(9*W/400)}px Nunito,sans-serif`;
    ctx.fillStyle='rgba(255,255,255,0.5)';
    ctx.fillText(e.hp+'/'+e.maxHp,ex,barY+10*W/400);
  });

  // Particles
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    p.x+=p.vx;p.y+=p.vy;p.vy+=0.08;p.life-=0.04;
    if(p.life<=0){particles.splice(i,1);continue;}
    ctx.globalAlpha=_mx(0,p.life);
    if(p.type==='text'){
      ctx.font=`bold ${_mf(14*W/400)}px Nunito,sans-serif`;
      ctx.fillStyle=p.color;
      ctx.textAlign='center';
      ctx.fillText(p.txt,p.x,p.y);
    } else {
      ctx.fillStyle=p.color;
      ctx.beginPath();ctx.arc(p.x,p.y,p.r*p.life,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;
  }

  // Phase indicator
  if(phase==='enemy_turn'){
    ctx.globalAlpha=0.6+Math.sin(frameCount*0.1)*0.3;
    ctx.font=`bold ${_mf(11*W/400)}px Nunito,sans-serif`;
    ctx.fillStyle='#ff6040';
    ctx.textAlign='center';
    ctx.fillText('⚔️ ENEMY TURN',W/2,H*0.92);
    ctx.globalAlpha=1;
  }
}

// Canvas touch for targeting
canvas.addEventListener('pointerdown',e=>{
  if(selectedSpell===null||phase!=='player_turn'||animating)return;
  const sp=hand[selectedSpell];
  if(!sp||sp.target==='self'||sp.target==='all'||sp.target==='random5')return;
  const rect=canvas.getBoundingClientRect();
  const dpr=devicePixelRatio||1;
  const cx=(e.clientX-rect.left)*dpr;
  const cy=(e.clientY-rect.top)*dpr;
  // Find closest enemy
  let best=-1,bestD=999999;
  enemies.forEach((en,i)=>{
    const d=(en.x-cx)**2+(en.y-cy)**2;
    if(d<bestD){bestD=d;best=i;}
  });
  if(best>=0&&bestD<(50*W/400)**2){
    selectedEnemy=best;
    castSpell(sp,best);
  }
},{passive:true});

// ── Loop ──────────────────────────────────────────────────────
function loop(ts){
  if(!window._spellActive)return;
  _spellRAF=_raf(loop);
  frameCount++;
  if(!_spellEl._lt||ts-_spellEl._lt>=33){_spellEl._lt=ts;draw();}
}

// ── Init ─────────────────────────────────────────────────────
genWave();
updateHUD();
_spellRAF=_raf(loop);
}
})();

(()=>{
let _shopEl=null;
window._launchShop=function(){
  window.paused=true;
  if(window._menuEl)window._menuEl.style.display='none';
  if(window._homeBtn)window._homeBtn.style.display='';
  window._shopActive=true;
  if(_shopEl){_shopEl.remove();_shopEl=null;}
  _buildShop();
};
window._exitShop=function(){
  window._shopActive=false;
  window.paused=false;
  if(_shopEl){_shopEl.remove();_shopEl=null;}
  if(window._menuEl)window._menuEl.style.display='flex';
  if(window._randomiseFeatured)window._randomiseFeatured();
  if(window._homeBtn)window._homeBtn.style.display='none';
};

function _buildShop(){

// ── Data ─────────────────────────────────────────────────────
const ITEMS=[
  // Food
  {id:'bread',     e:'🍞',name:'Bread',        cat:'food',  buyPrice:3,  sellMin:5,  sellMax:9,  desc:'Classic pond snack'},
  {id:'seeds',     e:'🌾',name:'Seeds',         cat:'food',  buyPrice:2,  sellMin:4,  sellMax:7,  desc:'Birds love these'},
  {id:'pondweed',  e:'🌿',name:'Pond Weed',     cat:'food',  buyPrice:1,  sellMin:3,  sellMax:6,  desc:'Acquired taste'},
  {id:'bugbix',    e:'🐛',name:'Bug Biscuits',  cat:'food',  buyPrice:4,  sellMin:7,  sellMax:12, desc:'Crunchy and delicious'},
  {id:'fishsnack', e:'🐟',name:'Fish Snacks',   cat:'food',  buyPrice:6,  sellMin:10, sellMax:18, desc:'Premium pond cuisine'},
  // Fishing
  {id:'rod',       e:'🎣',name:'Fishing Rod',   cat:'gear',  buyPrice:15, sellMin:22, sellMax:35, desc:'Standard rod'},
  {id:'bait',      e:'🪱',name:'Bait',          cat:'gear',  buyPrice:4,  sellMin:7,  sellMax:11, desc:'Wriggly and fresh'},
  {id:'net',       e:'🥅',name:'Fishing Net',   cat:'gear',  buyPrice:12, sellMin:18, sellMax:28, desc:'Catch more at once'},
  {id:'tackle',    e:'🧰',name:'Tackle Box',    cat:'gear',  buyPrice:20, sellMin:30, sellMax:45, desc:'Holds all your gear'},
  // Pond Supplies
  {id:'lilypad',   e:'🪷',name:'Lily Pad',      cat:'pond',  buyPrice:8,  sellMin:14, sellMax:22, desc:'Finest floating flora'},
  {id:'reeds',     e:'🌾',name:'Reeds',         cat:'pond',  buyPrice:5,  sellMin:9,  sellMax:15, desc:'For nesting'},
  {id:'nest',      e:'🪹',name:'Nest Kit',      cat:'pond',  buyPrice:18, sellMin:28, sellMax:42, desc:'Complete nesting set'},
  // Beauty
  {id:'preenol',   e:'🧴',name:'Preening Oil',  cat:'beauty',buyPrice:10, sellMin:16, sellMax:26, desc:'Keeps feathers glossy'},
  {id:'beakbalm',  e:'💄',name:'Beak Balm',     cat:'beauty',buyPrice:7,  sellMin:12, sellMax:20, desc:'Shiny and moisturised'},
  {id:'featherpol',e:'✨',name:'Feather Polish',cat:'beauty',buyPrice:14, sellMin:22, sellMax:36, desc:'Competition-grade shine'},
  // Toys
  {id:'rubberduck',e:'🦆',name:'Rubber Duck',   cat:'toys',  buyPrice:5,  sellMin:9,  sellMax:16, desc:'Squeaky classic'},
  {id:'puzzle',    e:'🧩',name:'Pond Puzzle',   cat:'toys',  buyPrice:12, sellMin:20, sellMax:30, desc:'100 pieces'},
  {id:'plushie',   e:'🧸',name:'Duck Plushie',  cat:'toys',  buyPrice:15, sellMin:24, sellMax:38, desc:'Incredibly soft'},
  // Potions
  {id:'speedpot',  e:'⚡',name:'Speed Potion',  cat:'potion',buyPrice:20, sellMin:32, sellMax:50, desc:'Zoom zoom'},
  {id:'luckpot',   e:'🍀',name:'Lucky Charm',   cat:'potion',buyPrice:25, sellMin:40, sellMax:60, desc:'Fortune favours ducks'},
  {id:'shinepot',  e:'🌟',name:'Shine Serum',   cat:'potion',buyPrice:18, sellMin:28, sellMax:45, desc:'Glitter guaranteed'},
];

const CUSTOMER_TYPES=[
  {id:'duck',     e:'🦆',name:'Regular Duck',  budget:[8,25],  patience:8,  haggle:0.1, shoplift:0,   ratingBoost:0,   wantsCats:['food','gear','pond','toys']},
  {id:'swan',     e:'🦢',name:'Swan',          budget:[30,70], patience:5,  haggle:0.05,shoplift:0,   ratingBoost:0.5, wantsCats:['beauty','potion','toys']},
  {id:'frog',     e:'🐸',name:'Frog',          budget:[5,18],  patience:6,  haggle:0.4, shoplift:0,   ratingBoost:0,   wantsCats:['food','pond']},
  {id:'bear',     e:'🐻',name:'Bear',          budget:[40,80], patience:10, haggle:0,   shoplift:0,   ratingBoost:0,   wantsCats:['food','gear'],bulkBuy:3},
  {id:'fox',      e:'🦊',name:'Fox',           budget:[10,30], patience:4,  haggle:0.2, shoplift:0.3, ratingBoost:-0.5,wantsCats:['food','beauty','potion']},
  {id:'wizard',   e:'🧙',name:'Wizard Duck',   budget:[50,100],patience:4,  haggle:0,   shoplift:0,   ratingBoost:1,   wantsCats:['potion']},
  {id:'duckling', e:'🐥',name:'Duckling',      budget:[3,10],  patience:12, haggle:0,   shoplift:0,   ratingBoost:1.5, wantsCats:['food','toys']},
];

const STAFF_TYPES=[
  {id:'assistant', e:'🦆',name:'Shop Assistant',desc:'Serves customers faster',    cost:80,  wage:5,  effect:'speed'},
  {id:'stocker',   e:'📦',name:'Stock Duck',    desc:'Auto-buys low stock items',  cost:120, wage:8,  effect:'stock'},
  {id:'security',  e:'🔒',name:'Security Duck', desc:'Catches shoplifters',        cost:100, wage:6,  effect:'security'},
  {id:'marketing', e:'📢',name:'Marketing Duck',desc:'+2 customers per day',       cost:150, wage:10, effect:'marketing'},
];

const UPGRADES=[
  {id:'shelf1',  name:'Extra Shelf',     desc:'Stock 2 more item types',  cost:200, effect:'slots',    value:2},
  {id:'speed1',  name:'Faster Service',  desc:'Customers wait 25% longer',cost:150, effect:'patience', value:0.25},
  {id:'price1',  name:'Market Research', desc:'+15% max sell prices',     cost:180, effect:'prices',   value:0.15},
  {id:'size1',   name:'Bigger Shop',     desc:'+2 customer capacity',     cost:300, effect:'capacity', value:2},
  {id:'supplier',name:'New Supplier',    desc:'Unlock all item categories',cost:400, effect:'unlock',   value:1},
];

// ── State ─────────────────────────────────────────────────────
let state={
  coins:100,
  day:1,
  rating:3.0,
  phase:'morning', // morning|open|evening|gameover
  inventory:{},    // itemId -> {qty, price}
  staff:[],
  upgrades:[],
  customers:[],
  log:[],
  dailyProfit:0,
  dailyTarget:50,
  missedTargets:0,
  shopSlots:6,
  capacity:2,
  unlockedCats:['food','gear'],
  dayStats:{served:0,revenue:0,upset:0,stolen:0},
};

function getItem(id){return ITEMS.find(i=>i.id===id);}
function hasUpgrade(id){return state.upgrades.includes(id);}
function hasStaff(id){return state.staff.some(s=>s.id===id);}
function patienceMultiplier(){
  let m=1;
  if(hasUpgrade('speed1'))m+=0.25;
  if(hasStaff('assistant'))m+=0.2;
  return m;
}

// ── DOM ───────────────────────────────────────────────────────
_shopEl=_ce('div');
_shopEl.style.cssText='position:fixed;inset:0;z-index:1000085;background:#0e1220;font-family:Nunito,sans-serif;display:flex;flex-direction:column;overflow:hidden;user-select:none;-webkit-user-select:none;touch-action:manipulation;';
_ba(_shopEl);

function render(){
  if(!_shopEl)return;
  _shopEl.innerHTML='';

  if(state.phase==='morning') renderMorning();
  else if(state.phase==='open') renderOpen();
  else if(state.phase==='evening') renderEvening();
  else if(state.phase==='gameover') renderGameOver();
}

// ── Morning Phase — Buy Stock ─────────────────────────────────
function renderMorning(){
  _shopEl.innerHTML=`
  <div style="background:linear-gradient(180deg,#12162a,#181e38);border-bottom:1px solid rgba(255,255,255,0.07);padding:10px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
    <div>
      <div style="font-size:16px;font-weight:900;color:#fff;">🌅 Morning — Day ${state.day}</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.4);">Buy stock before opening</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:14px;font-weight:900;color:#f5e642;">🪙 ${state.coins}</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.4);">Target: +${state.dailyTarget}🪙</div>
    </div>
  </div>
  <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:14px 14px 6px;">
    <div style="font-size:10px;font-weight:900;color:rgba(255,255,255,0.3);letter-spacing:.1em;text-transform:uppercase;margin-bottom:10px;">📦 Buy Stock</div>
    <div id="sh-items" style="display:flex;flex-direction:column;gap:7px;"></div>
  </div>
  <div style="padding:12px 14px;border-top:1px solid rgba(255,255,255,0.07);flex-shrink:0;">
    <button id="sh-open-btn" style="width:100%;padding:14px;border-radius:14px;border:none;background:linear-gradient(135deg,#2040a0,#4060e0);color:#fff;font-size:15px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">🏪 Open Shop</button>
  </div>`;

  const container=_shopEl.querySelector('#sh-items');
  const available=ITEMS.filter(i=>state.unlockedCats.includes(i.cat));
  // Show up to shopSlots unique items
  const shown=available.slice(0,state.shopSlots+available.length);

  shown.forEach(item=>{
    const inv=state.inventory[item.id]||{qty:0,price:item.sellMin};
    const canBuy=state.coins>=item.buyPrice;
    const row=_ce('div');
    row.style.cssText=`background:rgba(255,255,255,0.04);border:1.5px solid rgba(255,255,255,${canBuy?'0.09':'0.04'});border-radius:12px;padding:10px 12px;display:flex;align-items:center;gap:10px;`;
    row.innerHTML=`
      <span style="font-size:24px;">${item.e}</span>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:900;color:#fff;">${item.name} <span style="color:rgba(255,255,255,0.3);font-size:10px;">${item.desc}</span></div>
        <div style="font-size:10px;color:rgba(255,255,255,0.4);">Stock: <b style="color:#fff;">${inv.qty}</b> &nbsp;·&nbsp; Sell price: <b style="color:#f5e642;">${inv.price}🪙</b></div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:5px;">
          <span style="font-size:10px;color:rgba(255,255,255,0.4);">Price:</span>
          <button class="sh-price-down" data-id="${item.id}" style="width:22px;height:22px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.07);color:#fff;font-size:13px;cursor:pointer;touch-action:manipulation;">-</button>
          <span style="font-size:11px;font-weight:900;color:#f5e642;min-width:24px;text-align:center;">${inv.price}</span>
          <button class="sh-price-up" data-id="${item.id}" style="width:22px;height:22px;border-radius:6px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.07);color:#fff;font-size:13px;cursor:pointer;touch-action:manipulation;">+</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;">
        <button class="sh-buy" data-id="${item.id}" style="padding:6px 12px;border-radius:9px;border:none;background:${canBuy?'linear-gradient(135deg,#2040a0,#4060e0)':'rgba(255,255,255,0.06)'};color:${canBuy?'#fff':'rgba(255,255,255,0.25)'};font-size:11px;font-weight:900;cursor:${canBuy?'pointer':'default'};font-family:Nunito,sans-serif;touch-action:manipulation;">Buy 🪙${item.buyPrice}</button>
        ${inv.qty>0?`<button class="sh-buy5" data-id="${item.id}" style="padding:4px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.6);font-size:10px;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">×5 🪙${item.buyPrice*5}</button>`:''}
      </div>`;
    container.appendChild(row);
  });

  // Event listeners
  _shopEl.querySelectorAll('.sh-buy').forEach(btn=>{
    btn.addEventListener('pointerdown',e=>{e.stopPropagation();
      const it=getItem(btn.dataset.id);
      if(!it||state.coins<it.buyPrice)return;
      state.coins-=it.buyPrice;
      if(!state.inventory[it.id])state.inventory[it.id]={qty:0,price:it.sellMin};
      state.inventory[it.id].qty++;
      render();
    });
  });
  _shopEl.querySelectorAll('.sh-buy5').forEach(btn=>{
    btn.addEventListener('pointerdown',e=>{e.stopPropagation();
      const it=getItem(btn.dataset.id);
      if(!it||state.coins<it.buyPrice*5)return;
      state.coins-=it.buyPrice*5;
      if(!state.inventory[it.id])state.inventory[it.id]={qty:0,price:it.sellMin};
      state.inventory[it.id].qty+=5;
      render();
    });
  });
  _shopEl.querySelectorAll('.sh-price-up').forEach(btn=>{
    btn.addEventListener('pointerdown',e=>{e.stopPropagation();
      const it=getItem(btn.dataset.id);if(!it)return;
      if(!state.inventory[it.id])state.inventory[it.id]={qty:0,price:it.sellMin};
      const maxP=hasUpgrade('price1')?_mf(it.sellMax*1.15):it.sellMax;
      state.inventory[it.id].price=_mn(maxP,state.inventory[it.id].price+1);
      render();
    });
  });
  _shopEl.querySelectorAll('.sh-price-down').forEach(btn=>{
    btn.addEventListener('pointerdown',e=>{e.stopPropagation();
      const it=getItem(btn.dataset.id);if(!it)return;
      if(!state.inventory[it.id])state.inventory[it.id]={qty:0,price:it.sellMin};
      state.inventory[it.id].price=_mx(it.buyPrice+1,state.inventory[it.id].price-1);
      render();
    });
  });
  _shopEl.querySelector('#sh-open-btn').addEventListener('pointerdown',e=>{
    e.stopPropagation();openShop();
  });
}

// ── Open Phase — Serve Customers ──────────────────────────────
let _custInterval=null;
function openShop(){
  state.phase='open';
  state.dayStats={served:0,revenue:0,upset:0,stolen:0};
  state.customers=[];
  spawnCustomers();
  if(_custInterval)clearInterval(_custInterval);
  const interval=hasStaff('marketing')?5000:7000;
  _custInterval=setInterval(()=>{
    if(state.phase!=='open'){clearInterval(_custInterval);return;}
    const maxCust=(hasUpgrade('size1')?state.capacity+2:state.capacity+1);
    if(state.customers.length<maxCust)spawnCustomers();
    tickCustomers();
  },1000);
  render();
}

function spawnCustomers(){
  const count=hasStaff('marketing')?(_mr()<0.4?2:1):1;
  for(let i=0;i<count;i++){
    const t=CUSTOMER_TYPES[_mf(_mr()*CUSTOMER_TYPES.length)];
    // Pick something they want that we have in stock
    // Pick from items customer wants — prefer in-stock but show up anyway
    const wantable=ITEMS.filter(it=>t.wantsCats.includes(it.cat)&&state.inventory[it.id]&&state.inventory[it.id].qty>0);
    const anyWant=ITEMS.filter(it=>t.wantsCats.includes(it.cat));
    if(!anyWant.length)continue;
    const want=(wantable.length?wantable:anyWant)[_mf(_mr()*(wantable.length||anyWant.length))];
    const budget=t.budget[0]+_mf(_mr()*(t.budget[1]-t.budget[0]));
    const patience=_mf(t.patience*10*patienceMultiplier());
    state.customers.push({
      id:Math.random().toString(36).slice(2),
      type:t.id,e:t.e,name:t.name,
      want:want.id,budget,patience,maxPatience:patience,
      haggle:t.haggle,shoplift:t.shoplift,
      ratingBoost:t.ratingBoost,
      bulkBuy:t.bulkBuy||1,
      status:'waiting', // waiting|served|upset|stolen|left
    });
  }
  render();
}

function tickCustomers(){
  let changed=false;
  state.customers=state.customers.filter(c=>{
    c.patience--;
    if(c.patience<=0){
      c.status='upset';
      state.dayStats.upset++;
      state.rating=_mx(1,state.rating-0.1);
      addLog(`${c.e} ${c.name} left upset!`);
      changed=true;
      return false;
    }
    return true;
  });
  if(changed)render();
}

function serveCustomer(custId){
  const c=state.customers.find(c=>c.id===custId);
  if(!c)return;
  const inv=state.inventory[c.want];
  const item=getItem(c.want);
  if(!inv||!item||inv.qty<1){addLog(`No ${item?.name||'item'} in stock!`);return;}

  const price=inv.price;

  // Shoplift check
  if(c.shoplift>0&&_mr()<c.shoplift&&!hasStaff('security')){
    const stolen=_mn(c.bulkBuy,inv.qty);
    inv.qty-=stolen;
    state.dayStats.stolen+=stolen;
    state.rating=_mx(1,state.rating-0.2);
    addLog(`🦊 ${c.name} stole ${stolen}x ${item.e}${item.name}!`);
    state.customers=state.customers.filter(x=>x.id!==custId);
    render();return;
  }

  // Budget check with haggling
  let finalPrice=price;
  if(price>c.budget){
    if(_mr()<c.haggle){
      finalPrice=_mf(c.budget*0.9);
      addLog(`${c.e} haggled! Sold ${item.e} for 🪙${finalPrice}`);
    } else {
      addLog(`${c.e} can't afford ${item.e}${item.name} at 🪙${price}`);
      state.customers=state.customers.filter(x=>x.id!==custId);
      state.dayStats.upset++;
      state.rating=_mx(1,state.rating-0.05);
      render();return;
    }
  }

  const qty=_mn(c.bulkBuy,inv.qty);
  const earned=finalPrice*qty;
  inv.qty-=qty;
  state.coins+=earned;
  state.dailyProfit+=earned;
  state.dayStats.served++;
  state.dayStats.revenue+=earned;
  state.rating=_mn(5,state.rating+(c.ratingBoost*0.05)+0.02);
  addLog(`${c.e} bought ${qty}x ${item.e}${item.name} for 🪙${earned}`);
  state.customers=state.customers.filter(x=>x.id!==custId);
  render();
}

function addLog(msg){
  state.log.unshift(msg);
  if(state.log.length>5)state.log.pop();
}

function renderOpen(){
  const starsStr='⭐'.repeat(_mf(state.rating))+'☆'.repeat(5-_mf(state.rating));
  _shopEl.innerHTML=`
  <div style="background:linear-gradient(180deg,#12162a,#181e38);border-bottom:1px solid rgba(255,255,255,0.07);padding:8px 14px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
    <div>
      <div style="font-size:14px;font-weight:900;color:#fff;">🏪 Open — Day ${state.day}</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.4);">${starsStr} &nbsp;·&nbsp; +${state.dailyProfit}🪙 today</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">
      <div style="font-size:13px;font-weight:900;color:#f5e642;">🪙 ${state.coins}</div>
      <button id="sh-close-btn" style="padding:5px 10px;border-radius:8px;border:1px solid rgba(255,100,100,0.3);background:rgba(255,60,60,0.1);color:rgba(255,150,150,0.8);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">🔒 Close</button>
    </div>
  </div>
  <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 14px;display:flex;flex-direction:column;gap:8px;">
    <div id="sh-customers" style="display:flex;flex-direction:column;gap:7px;"></div>
    <div style="font-size:9px;font-weight:900;color:rgba(255,255,255,0.2);letter-spacing:.1em;text-transform:uppercase;margin-top:4px;">📜 Log</div>
    <div style="display:flex;flex-direction:column;gap:3px;">${state.log.map(l=>`<div style="font-size:10px;color:rgba(255,255,255,0.4);">${l}</div>`).join('')}</div>
  </div>`;

  const custEl=_shopEl.querySelector('#sh-customers');
  if(state.customers.length===0){
    custEl.innerHTML=`<div style="text-align:center;padding:20px;font-size:13px;color:rgba(255,255,255,0.25);">Waiting for customers…</div>`;
  } else {
    state.customers.forEach(c=>{
      const item=getItem(c.want);
      const inv=state.inventory[c.want];
      const inStock=inv&&inv.qty>0;
      const pctPatience=c.patience/c.maxPatience;
      const patCol=pctPatience>0.5?'#40c040':pctPatience>0.25?'#c0c040':'#c04040';
      const card=_ce('div');
      card.style.cssText='background:rgba(255,255,255,0.04);border:1.5px solid rgba(255,255,255,0.08);border-radius:12px;padding:10px 12px;display:flex;align-items:center;gap:10px;';
      card.innerHTML=`
        <span style="font-size:26px;">${c.e}</span>
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:900;color:#fff;">${c.name}</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.45);">Wants: ${item?item.e+''+item.name:'?'} &nbsp;·&nbsp; Budget: 🪙${c.budget}</div>
          <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;margin-top:5px;overflow:hidden;">
            <div style="height:100%;background:${patCol};border-radius:2px;width:${pctPatience*100}%;transition:width .5s;"></div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;">
          <button class="sh-serve" data-id="${c.id}" style="padding:7px 11px;border-radius:9px;border:none;background:${inStock?'linear-gradient(135deg,#206020,#40a040)':'rgba(255,255,255,0.06)'};color:${inStock?'#fff':'rgba(255,255,255,0.25)'};font-size:11px;font-weight:900;cursor:${inStock?'pointer':'default'};font-family:Nunito,sans-serif;touch-action:manipulation;">${inStock?'Serve':'No Stock'}</button>
          <button class="sh-kick" data-id="${c.id}" style="padding:5px 11px;border-radius:9px;border:1px solid rgba(255,80,80,0.3);background:rgba(255,40,40,0.08);color:rgba(255,120,120,0.8);font-size:10px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">Kick 🥾</button>
        </div>`;
      custEl.appendChild(card);
    });
  }

  _shopEl.querySelectorAll('.sh-serve').forEach(btn=>{
    btn.addEventListener('pointerdown',e=>{e.stopPropagation();serveCustomer(btn.dataset.id);});
  });
  _shopEl.querySelectorAll('.sh-kick').forEach(btn=>{
    btn.addEventListener('pointerdown',e=>{e.stopPropagation();
      const c=state.customers.find(x=>x.id===btn.dataset.id);
      if(!c)return;
      state.customers=state.customers.filter(x=>x.id!==btn.dataset.id);
      state.rating=_mx(1,state.rating-0.08);
      addLog(`👢 Kicked out ${c.e} ${c.name}!`);
      render();
    });
  });
  _shopEl.querySelector('#sh-close-btn').addEventListener('pointerdown',e=>{
    e.stopPropagation();closeShop();
  });
}

function closeShop(){
  if(_custInterval){clearInterval(_custInterval);_custInterval=null;}
  state.phase='evening';
  state.customers=[];
  render();
}

// ── Evening Phase — End of Day ────────────────────────────────
function renderEvening(){
  const metTarget=state.dailyProfit>=state.dailyTarget;
  if(!metTarget){
    state.missedTargets++;
  } else {
    state.missedTargets=_mx(0,state.missedTargets-1);
  }
  const livesLeft=3-state.missedTargets;
  if(state.missedTargets>=3){state.phase='gameover';render();return;}

  _shopEl.innerHTML=`
  <div style="background:linear-gradient(180deg,#12162a,#181e38);border-bottom:1px solid rgba(255,255,255,0.07);padding:10px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
    <div style="font-size:16px;font-weight:900;color:#fff;">🌙 End of Day ${state.day}</div>
    <div style="font-size:13px;font-weight:900;color:#f5e642;">🪙 ${state.coins}</div>
  </div>
  <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:14px;">
    <div style="background:rgba(255,255,255,0.04);border-radius:14px;padding:14px;margin-bottom:12px;">
      <div style="font-size:12px;font-weight:900;color:rgba(255,255,255,0.4);margin-bottom:8px;">📊 TODAY'S STATS</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="text-align:center;"><div style="font-size:20px;font-weight:900;color:#fff;">${state.dayStats.served}</div><div style="font-size:9px;color:rgba(255,255,255,0.4);">Customers Served</div></div>
        <div style="text-align:center;"><div style="font-size:20px;font-weight:900;color:#f5e642;">🪙${state.dayStats.revenue}</div><div style="font-size:9px;color:rgba(255,255,255,0.4);">Revenue</div></div>
        <div style="text-align:center;"><div style="font-size:20px;font-weight:900;color:#ff6040;">${state.dayStats.upset}</div><div style="font-size:9px;color:rgba(255,255,255,0.4);">Left Upset</div></div>
        <div style="text-align:center;"><div style="font-size:20px;font-weight:900;color:#ff4040;">${state.dayStats.stolen}</div><div style="font-size:9px;color:rgba(255,255,255,0.4);">Items Stolen</div></div>
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:12px;color:rgba(255,255,255,0.5);">Target: 🪙${state.dailyTarget}</span>
        <span style="font-size:13px;font-weight:900;color:${metTarget?'#40c040':'#ff6040'};">${metTarget?'✅ Met!':'❌ Missed'} (${livesLeft}/3 ❤️)</span>
      </div>
    </div>

    <div style="font-size:10px;font-weight:900;color:rgba(255,255,255,0.3);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px;">🏗️ Upgrades & Staff</div>
    <div id="sh-upgrades" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;"></div>

    <div style="font-size:10px;font-weight:900;color:rgba(255,255,255,0.3);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px;">👥 Staff</div>
    <div id="sh-staff" style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;"></div>
  </div>
  <div style="padding:12px 14px;border-top:1px solid rgba(255,255,255,0.07);flex-shrink:0;">
    <button id="sh-next-btn" style="width:100%;padding:14px;border-radius:14px;border:none;background:linear-gradient(135deg,#2040a0,#4060e0);color:#fff;font-size:15px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">☀️ Next Day</button>
  </div>`;

  // Upgrades
  const upgEl=_shopEl.querySelector('#sh-upgrades');
  UPGRADES.forEach(u=>{
    const owned=hasUpgrade(u.id);
    const canBuy=!owned&&state.coins>=u.cost;
    const d=_ce('div');
    d.style.cssText=`background:rgba(255,255,255,0.04);border:1.5px solid rgba(255,255,255,${canBuy?'0.1':'0.04'});border-radius:11px;padding:9px 12px;display:flex;align-items:center;gap:9px;opacity:${owned?'0.4':'1'};`;
    d.innerHTML=`<div style="flex:1;"><div style="font-size:12px;font-weight:900;color:#fff;">${owned?'✅ ':''} ${u.name}</div><div style="font-size:10px;color:rgba(255,255,255,0.4);">${u.desc}</div></div>${owned?'':`<button class="sh-upg" data-id="${u.id}" style="padding:6px 11px;border-radius:8px;border:none;background:${canBuy?'linear-gradient(135deg,#2040a0,#4060e0)':'rgba(255,255,255,0.06)'};color:${canBuy?'#fff':'rgba(255,255,255,0.25)'};font-size:11px;font-weight:900;cursor:${canBuy?'pointer':'default'};font-family:Nunito,sans-serif;touch-action:manipulation;">🪙${u.cost}</button>`}`;
    upgEl.appendChild(d);
  });

  // Staff
  const staffEl=_shopEl.querySelector('#sh-staff');
  STAFF_TYPES.forEach(s=>{
    const owned=hasStaff(s.id);
    const canBuy=!owned&&state.coins>=s.cost;
    const d=_ce('div');
    d.style.cssText=`background:rgba(255,255,255,0.04);border:1.5px solid rgba(255,255,255,${canBuy?'0.1':'0.04'});border-radius:11px;padding:9px 12px;display:flex;align-items:center;gap:9px;`;
    d.innerHTML=`<span style="font-size:22px;">${s.e}</span><div style="flex:1;"><div style="font-size:12px;font-weight:900;color:#fff;">${owned?'✅ ':''} ${s.name}</div><div style="font-size:10px;color:rgba(255,255,255,0.4);">${s.desc}${owned?` · 🪙${s.wage}/day wage`:''}</div></div>${owned?'':`<button class="sh-staff-buy" data-id="${s.id}" style="padding:6px 11px;border-radius:8px;border:none;background:${canBuy?'linear-gradient(135deg,#206040,#40a060)':'rgba(255,255,255,0.06)'};color:${canBuy?'#fff':'rgba(255,255,255,0.25)'};font-size:11px;font-weight:900;cursor:${canBuy?'pointer':'default'};font-family:Nunito,sans-serif;touch-action:manipulation;">🪙${s.cost}</button>`}`;
    staffEl.appendChild(d);
  });

  // Listeners
  _shopEl.querySelectorAll('.sh-upg').forEach(btn=>{
    btn.addEventListener('pointerdown',e=>{e.stopPropagation();
      const u=UPGRADES.find(x=>x.id===btn.dataset.id);
      if(!u||state.coins<u.cost||hasUpgrade(u.id))return;
      state.coins-=u.cost;
      state.upgrades.push(u.id);
      if(u.effect==='slots')state.shopSlots+=u.value;
      if(u.effect==='capacity')state.capacity+=u.value;
      if(u.effect==='unlock')state.unlockedCats=[...new Set([...state.unlockedCats,'food','gear','pond','beauty','toys','potion'])];
      render();
    });
  });
  _shopEl.querySelectorAll('.sh-staff-buy').forEach(btn=>{
    btn.addEventListener('pointerdown',e=>{e.stopPropagation();
      const s=STAFF_TYPES.find(x=>x.id===btn.dataset.id);
      if(!s||state.coins<s.cost||hasStaff(s.id))return;
      state.coins-=s.cost;
      state.staff.push({id:s.id,wage:s.wage});
      render();
    });
  });
  _shopEl.querySelector('#sh-next-btn').addEventListener('pointerdown',e=>{
    e.stopPropagation();nextDay();
  });
}

function nextDay(){
  // Pay wages
  state.staff.forEach(s=>{state.coins-=s.wage;});
  state.day++;
  state.dailyProfit=0;
  state.dailyTarget=_mf(50+state.day*8);
  state.phase='morning';
  render();
}

// ── Game Over ─────────────────────────────────────────────────
function renderGameOver(){
  _shopEl.innerHTML=`
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px;">
    <div style="font-size:52px;">🏚️</div>
    <div style="font-size:22px;font-weight:900;color:#fff;">Shop Closed Down</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.4);text-align:center;">You missed 3 daily targets.<br>The bank has repossessed your shop.</div>
    <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:14px 24px;text-align:center;">
      <div style="font-size:12px;color:rgba(255,255,255,0.5);">Survived <span style="color:#fff;font-weight:900;">${state.day} days</span></div>
      <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px;">Final coins: <span style="color:#f5e642;font-weight:900;">🪙${state.coins}</span></div>
    </div>
    <button id="sh-retry" style="padding:14px 36px;border-radius:14px;border:none;background:linear-gradient(135deg,#2040a0,#4060e0);color:#fff;font-size:15px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">▶ Try Again</button>
    <button id="sh-menu" style="padding:10px 28px;border-radius:12px;border:1.5px solid rgba(255,255,255,0.15);background:transparent;color:rgba(255,255,255,0.6);font-size:13px;font-weight:900;cursor:pointer;font-family:Nunito,sans-serif;touch-action:manipulation;">🏠 Menu</button>
  </div>`;
  _shopEl.querySelector('#sh-retry').addEventListener('pointerdown',e=>{e.stopPropagation();resetShop();render();});
  _shopEl.querySelector('#sh-menu').addEventListener('pointerdown',e=>{e.stopPropagation();window._exitShop();});
}

function resetShop(){
  state={coins:100,day:1,rating:3.0,phase:'morning',inventory:{},staff:[],upgrades:[],customers:[],log:[],dailyProfit:0,dailyTarget:50,missedTargets:0,shopSlots:6,capacity:2,unlockedCats:['food','gear'],dayStats:{served:0,revenue:0,upset:0,stolen:0}};
}

// ── Start ─────────────────────────────────────────────────────
render();
}
})();

})();
if(window._qolWrapAll)window._qolWrapAll();
