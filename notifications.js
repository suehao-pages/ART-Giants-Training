'use strict';

// Called from the existing Hoopslot app after the shared app state has been initialized.
const PUSH_CATEGORY_GROUPS = [['training','Training','Practice'],['game','Spiel','Game']];
const PUSH_CATEGORY_ROWS = [
  ['open','Anmeldung','Registration'],
  ['change','Zeit-/Ortsänderungen','Time/location changes'],
  ['reminder','Erinnerungen','Reminders'],
];
const PUSH_CATEGORY_KEYS = PUSH_CATEGORY_GROUPS.flatMap(([kind])=>PUSH_CATEGORY_ROWS.map(([suffix])=>kind+'_'+suffix));
const PUSH_BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/></svg>';
const PUSH_DEVICE_CACHE = 'hoopslot-push-device-v1';
const PUSH_UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const pushText = (de,en)=>APP_STATE.language==='en'?en:de;
const pushTitle = ()=>pushText('Benachrichtigungen','Notifications');
const pushEndMessage = ()=>pushText('Die Uhrzeit ist noch nicht festgelegt. Deine Erinnerung wird berechnet, sobald sie feststeht.','The time has not been set. Your reminder will be scheduled once it is known.');
const pushStorage = {
  get(key){try{return localStorage.getItem('hoopslot-push:'+key)}catch{return null}},
  set(key,value){try{localStorage.setItem('hoopslot-push:'+key,value)}catch{}},
};
let pushState = emptyPushState();
function emptyPushState() {
  return { user:null, categories:[], reminders:new Map(), seen:false, key:'', subscribed:false, busy:false };
}
const pushSeenKey = user=>'seen-v81:'+(user||'demo');
const pushReminderKey = (kind,id)=>kind+':'+id;
const pushBoundUrl = ()=>new URL('./.push-device',document.baseURI).href;
const pushSupports = ()=>isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && 'caches' in window;
function pushRefreshUi() {
  const unseen = Boolean(APP_STATE.userId && !pushState.seen && !pushStorage.get(pushSeenKey(APP_STATE.userId)));
  $('#pushNavDot').classList.toggle('hidden',!unseen);
  $('#pushProfileDot').classList.toggle('hidden',!unseen);
  $('#pushSettingsTitle').textContent = pushTitle();
  $('#pushSettingsSub').textContent = pushText('Anmeldungen, Änderungen und Erinnerungen','Registration, changes and reminders');
}
function pushSetSeen(user) {
  pushStorage.set(pushSeenKey(user),'1');
  pushState.seen = true;
  pushRefreshUi();
  if(db && user) return db.from('hoopslot_push_preferences').upsert({user_id:user,seen:true},{onConflict:'user_id'});
  return Promise.resolve({});
}
async function pushAccountReady() {
  const user = APP_STATE.userId;
  if (!db || !user) return;
  if (pushState.user !== user) pushState = {...emptyPushState(),user};
  const state = pushState;
  pushRefreshUi();
  const [preferences,config,reminders] = await Promise.all([
    db.from('hoopslot_push_preferences').select('categories,seen').eq('user_id',user).maybeSingle(),
    db.from('hoopslot_push_config').select('vapid_public_key').eq('id',true).maybeSingle(),
    db.from('hoopslot_push_reminders').select('event_kind,event_id,lead_minutes').eq('user_id',user),
  ]);
  if (state !== pushState || user !== APP_STATE.userId) return;
  state.categories = preferences.data?.categories || [];
  state.seen = !!preferences.data?.seen || !!pushStorage.get(pushSeenKey(user));
  if(state.seen && !preferences.error && !preferences.data?.seen) void pushSetSeen(user);
  state.key = config.data?.vapid_public_key || '';
  state.reminders = new Map((reminders.data||[]).map(row=>[pushReminderKey(row.event_kind,row.event_id),row.lead_minutes]));
  pushRefreshUi();
  if ($('#pushPrefsDialog')) renderPushSettings();
  if (APP_STATE.currentScreen === 'signup') {
    const session = APP_STATE.sessions.find(item=>String(item.id)===String(APP_STATE.selectedSessionId));
    if (session) decoratePushTraining(session);
  }
  const openId = $('#modalOverlay').dataset.gameDetailId;
  if (openId) {
    const game = APP_STATE.games.find(item=>String(item.id)===openId);
    if (game) decoratePushGame(game);
  }
  if (!pushSupports() || Notification.permission!=='granted' || !state.key) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    const id = pushStorage.get('device:'+user);
    const bound = await (await caches.open(PUSH_DEVICE_CACHE)).match(pushBoundUrl());
    if (sub && id && bound && await bound.text()===id && state===pushState) {
      const result = await db.from('hoopslot_push_devices').select('id').eq('id',id).eq('endpoint',sub.endpoint).maybeSingle();
      if (state!==pushState) return;
      state.subscribed = !!result.data;
      if (state.subscribed) void pushSyncLanguage();
      if ($('#pushPrefsDialog') && !state.busy) renderPushSettings();
    }
  } catch {}
}
function pushDeviceStatus() {
  if (!pushState.key) return pushText('Push ist noch nicht eingerichtet.','Push is not set up yet.');
  if (!pushSupports()) return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)
    ? pushText('Füge Hoopslot zum Home-Bildschirm hinzu und öffne es dort.','Add Hoopslot to your Home Screen and open it from there.')
    : pushText('Dieser Browser unterstützt keine Push-Benachrichtigungen.','This browser does not support push notifications.');
  if (Notification.permission==='denied') return pushText('Erlaube Benachrichtigungen zuerst in den Browser- oder Systemeinstellungen.','Allow notifications in your browser or system settings first.');
  return pushText('Benachrichtigungen konnten nicht aktiviert werden.','Notifications could not be enabled.');
}
function pushApplicationKey(key) {
  return Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-key.length%4)%4)), c=>c.charCodeAt(0));
}
async function activatePushDevice() {
  if (!pushSupports() || !pushState.key) throw new Error(pushDeviceStatus());
  if (pushState.subscribed && Notification.permission==='granted') return;
  const state = pushState, user = APP_STATE.userId;
  if (!user || user!==state.user) throw new Error(pushText('Bitte melde dich zuerst an.','Please sign in first.'));
  // Ask from the tap, before awaiting any network or service-worker operation.
  const permission = Notification.permission==='default' ? await Notification.requestPermission() : Notification.permission;
  if (permission!=='granted') throw new Error(pushDeviceStatus());
  let timeout;
  const registration = await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{
    timeout=setTimeout(()=>reject(new Error(pushText('Bitte lade die App neu und versuche es erneut.','Reload Hoopslot and try again.'))),9000);
  })]).finally(()=>clearTimeout(timeout));
  let subscription = await registration.pushManager.getSubscription(), created = false;
  const cache = await caches.open(PUSH_DEVICE_CACHE);
  const bound = await cache.match(pushBoundUrl()), previous = bound && await bound.text();
  let id = pushStorage.get('device:'+user);
  const applicationServerKey = pushApplicationKey(state.key);
  if (subscription) {
    const existingKey = subscription.options?.applicationServerKey;
    const sameKey = existingKey && new Uint8Array(existingKey).length===applicationServerKey.length
      && new Uint8Array(existingKey).every((byte,i)=>byte===applicationServerKey[i]);
    if (!sameKey || !PUSH_UUID.test(id||'') || (previous && previous!==id)) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  if (!PUSH_UUID.test(id||'')) id = crypto.randomUUID();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey});
    created = true;
  }
  const encoded = subscription.toJSON();
  try {
    if (state!==pushState || user!==APP_STATE.userId || !encoded.keys?.p256dh || !encoded.keys?.auth) throw new Error(pushDeviceStatus());
    const {error} = await db.from('hoopslot_push_devices').upsert({
      id,user_id:user,endpoint:subscription.endpoint,p256dh:encoded.keys.p256dh.replace(/=+$/,''),
      auth_key:encoded.keys.auth.replace(/=+$/,''),language:APP_STATE.language,
    },{onConflict:'id'});
    if (error || state!==pushState) throw new Error(pushText('Dieses Gerät konnte nicht angemeldet werden. Bitte versuche es erneut.','This device could not be registered. Please try again.'));
    await cache.put(pushBoundUrl(),new Response(id));
    pushStorage.set('device:'+user,id);
    state.subscribed = true;
  } catch(error) {
    if (created) await subscription.unsubscribe().catch(()=>{});
    throw error;
  }
}
async function pushSyncLanguage() {
  const id = pushStorage.get('device:'+APP_STATE.userId);
  if (db && APP_STATE.userId && id && pushState.subscribed) {
    await db.from('hoopslot_push_devices').update({language:APP_STATE.language})
      .eq('id',id).eq('user_id',APP_STATE.userId);
  }
}
async function disconnectPushDevice() {
  const user = APP_STATE.userId, id = pushStorage.get('device:'+user);
  pushState = emptyPushState();
  try {
    if ('caches' in window) await (await caches.open(PUSH_DEVICE_CACHE)).delete(pushBoundUrl());
  } catch {}
  const clearDevice = async ()=>{
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      if(sub)await sub.unsubscribe();
      if(reg?.getNotifications) for(const notification of await reg.getNotifications()) {
        if(notification.tag.startsWith('hoopslot-'))notification.close();
      }
    }
  };
  const removeDbDevice = ()=>db && user && id
    ? db.from('hoopslot_push_devices').delete().eq('user_id',user).eq('id',id).abortSignal(AbortSignal.timeout(2500))
    : null;
  await Promise.race([
    Promise.allSettled([clearDevice(),removeDbDevice()]),
    new Promise(resolve=>setTimeout(resolve,2700)),
  ]);
}
function pushSwitchIndicator(active) {
  return '<span class="status-switch '+(active?'on':'off')+'" aria-hidden="true"><span>'+(active?'ON':'OFF')+'</span><i></i></span>';
}
function pushSwitch(label,active,action,groupId) {
  const labelId = 'push-label-'+action;
  return '<button type="button" class="push-toggle" data-push-toggle="'+action+'" role="switch" aria-checked="'+active+'"'
    +(groupId?' aria-labelledby="'+groupId+' '+labelId+'"':'')+'>'
    +'<span id="'+labelId+'">'+escapeHtml(label)+'</span>'
    +pushSwitchIndicator(active)+'</button>';
}
function pushCategoryGroup([kind,de,en]) {
  const headingId = 'push-group-'+kind;
  return '<section class="push-category-group" aria-labelledby="'+headingId+'"><h3 id="'+headingId+'">'+pushText(de,en)+'</h3>'
    +PUSH_CATEGORY_ROWS.map(([suffix,deLabel,enLabel])=>{
      const key = kind+'_'+suffix;
      return pushSwitch(pushText(deLabel,enLabel),pushState.categories.includes(key),key,headingId);
    }).join('')+'</section>';
}
function renderPushSettings() {
  const all = PUSH_CATEGORY_KEYS.every(key=>pushState.categories.includes(key));
  const subtitle = all ? pushText('Alle aktiv','All on') : pushState.categories.length
    ? pushText(pushState.categories.length+' von 6 aktiv',pushState.categories.length+' of 6 on') : pushText('Alle aus','All off');
  const connect = pushSupports() && pushState.key && !pushState.subscribed && Notification.permission!=='denied';
  showModal('<div id="pushPrefsDialog"><h2>'+pushTitle()+'</h2>'
    +(connect?'<button class="secondary full push-device-connect" type="button" id="pushConnect">'+pushText('Auf diesem Gerät aktivieren','Enable on this device')+'</button>':'')
    +pushSwitch(pushText('Alle Benachrichtigungen','All notifications'),all,'all')
    +'<div class="push-all-hint">'+escapeHtml(subtitle)+(pushState.categories.length && !all
      ? '<button id="pushAllOff" type="button">'+pushText('Alle ausschalten','Turn all off')+'</button>':'')+'</div>'
    +PUSH_CATEGORY_GROUPS.map(group=>'<hr class="push-divider">'+pushCategoryGroup(group)).join('')
    +'<div class="modal-actions"><button class="ghost" type="button" onclick="closeModal()">'+t('close')+'</button></div></div>');
  function update(next) {
    if (pushState.busy) return;
    const state = pushState;
    state.busy = true;
    void (async ()=>{
      try {
        if (!db || !APP_STATE.userId) throw new Error(pushText('Bitte melde dich zuerst an.','Please sign in first.'));
        if (next.some(key=>!state.categories.includes(key))) await activatePushDevice();
        await savePushCategories(next);
      } catch (error) { toast(error.message); }
      finally {
        state.busy=false;
        if ($('#pushPrefsDialog') && state===pushState) renderPushSettings();
      }
    })();
  }
  $$('[data-push-toggle]').forEach(button=>{
    const key = button.dataset.pushToggle;
    button.onclick=()=>update(key==='all'?(all?[]:[...PUSH_CATEGORY_KEYS])
      : pushState.categories.includes(key)?pushState.categories.filter(item=>item!==key):[...pushState.categories,key]);
  });
  if ($('#pushAllOff')) $('#pushAllOff').onclick=()=>update([]);
  if ($('#pushConnect')) $('#pushConnect').onclick=async()=>{
    const button=$('#pushConnect');button.disabled=true;
    try{await activatePushDevice()}catch(error){toast(error.message)}
    if ($('#pushPrefsDialog')) renderPushSettings();
  };
}
async function savePushCategories(next) {
  const user = APP_STATE.userId, state = pushState;
  if (!db || !user || state.user!==user) throw new Error(pushText('Bitte melde dich zuerst an.','Please sign in first.'));
  const {error} = await db.from('hoopslot_push_preferences').upsert({user_id:user,categories:next,seen:true},{onConflict:'user_id'});
  if (error || state!==pushState) throw new Error(pushText('Einstellungen konnten nicht gespeichert werden.','Settings could not be saved.'));
  state.categories = next;
  pushStorage.set(pushSeenKey(user),'1');state.seen=true;pushRefreshUi();
}
function openPushSettings() {
  void pushSetSeen(APP_STATE.userId);
  renderPushSettings();
}
function decoratePushTraining(session) {
  const head=$('#screen-signup .signup-hero-head');
  if (!head) return;
  head.querySelector('.push-detail-bell')?.remove();
  const start = gameStartInstant(session.date+'T'+session.time.split(/[–-]/)[0].trim());
  if (Number.isFinite(start) && start>Date.now()) appendPushBell(head,'training',session.id);
}
function decoratePushGame(game) {
  const head=$('#modal .game-detail-head');
  if (!head) return;
  head.querySelector('.push-detail-bell')?.remove();
  const gameStart=gameStartInstant(game.starts_at);
  if (game.status==='upcoming' && Number.isFinite(gameStart) && gameStart>Date.now()) appendPushBell(head,'game',game.id);
}
function appendPushBell(parent,kind,id) {
  const saved=pushState.reminders.has(pushReminderKey(kind,id));
  const active=saved && pushState.categories.includes(kind+'_reminder');
  const button=document.createElement('button');
  button.type='button';button.className='push-detail-bell'+(active?' is-set':'');
  const label=pushText('Erinnerung einstellen','Set reminder');
  button.setAttribute('aria-label',label);button.title=label;
  button.innerHTML=PUSH_BELL;
  button.onclick=()=>openPushReminder(kind,id);
  if (kind==='training') parent.append(button);else parent.prepend(button);
}
const PUSH_LEAD_CHOICES=Array.from({length:13},(_,i)=>i*15);
const PUSH_LEAD_HOURS=[0,1,2,3];
const pushLeadMinuteChoices=hours=>hours===0?[15,30,45]:hours===3?[0]:[0,15,30,45];
function bindPushWheel(node,format,onChange=()=>{}) {
  let values=[], index=0;
  const rowHeight=()=>node.children[0]?.offsetHeight||0;
  function select(next,snap) {
    index=Math.max(0,Math.min(values.length-1,next));
    const value=values[index];
    if (snap) node.scrollTop=index*rowHeight();
    Array.from(node.children).forEach((row,i)=>row.classList.toggle('is-selected',i===index));
    node.setAttribute('aria-valuenow',value);
    node.setAttribute('aria-valuetext',format(value));
    return value;
  }
  function read() {
    const height=rowHeight();
    if (!height || !values.length) return values[index];
    const value=select(Math.round(node.scrollTop/height),false);
    onChange(value);
    return value;
  }
  node.onscroll=read;
  node.onclick=event=>{
    const row=event.target.closest('[data-push-wheel-index]');
    if(row) onChange(select(Number(row.dataset.pushWheelIndex),true));
  };
  node.onkeydown=event=>{
    read();
    const next={ArrowUp:index+1,ArrowDown:index-1,ArrowRight:index+1,ArrowLeft:index-1,Home:0,End:values.length-1}[event.key];
    if (next===undefined) return;
    event.preventDefault();
    onChange(select(next,true));
  };
  return {read,replace(next,value){
    values=next;
    node.innerHTML=values.map((item,i)=>'<div class="push-wheel-option" data-push-wheel-index="'+i+'" aria-hidden="true">'+item+'</div>').join('');
    node.setAttribute('aria-valuemin',values[0]);
    node.setAttribute('aria-valuemax',values.at(-1));
    return select(Math.max(0,values.indexOf(value)),true);
  }};
}
function bindTrainingPushLead(selected,categoryOn) {
  const picker=$('#pushReminderPicker'), toggle=$('#pushReminderToggle');
  let enabled=selected>0 && categoryOn;
  let hours=Math.floor((selected||15)/60),minutes=(selected||15)%60;
  const minuteWheel=bindPushWheel($('#pushReminderMinutes'),value=>pushText(value+(value===1?' Minute':' Minuten'),value+(value===1?' minute':' minutes')),value=>{minutes=value;});
  const hourWheel=bindPushWheel($('#pushReminderHours'),value=>pushText(value+(value===1?' Stunde':' Stunden'),value+(value===1?' hour':' hours')),value=>{
    if (value===hours) return;
    // Read the outgoing minute column before replacing its constrained values.
    minuteWheel.read();
    hours=value;
    minutes=minuteWheel.replace(pushLeadMinuteChoices(hours),minutes);
  });
  function read() {
    if (!enabled) return 0;
    hourWheel.read();minuteWheel.read();
    return hours*60+minutes;
  }
  function render() {
    toggle.innerHTML=pushSwitchIndicator(enabled);
    toggle.setAttribute('aria-checked',enabled);
    picker.hidden=!enabled;
    if (enabled) {
      hourWheel.replace(PUSH_LEAD_HOURS,hours);
      minutes=minuteWheel.replace(pushLeadMinuteChoices(hours),minutes);
    }
  }
  toggle.onclick=()=>{read();enabled=!enabled;render();};
  render();
  return read;
}
function openPushReminder(kind,id) {
  const isGame=kind==='game', key=pushReminderKey(kind,id), cat=kind+'_reminder';
  const selected=pushState.reminders.get(key)||0;
  const categoryOn=pushState.categories.includes(cat);
  const event=isGame?APP_STATE.games.find(game=>String(game.id)===String(id))
    :APP_STATE.sessions.find(session=>String(session.id)===String(id));
  if(!event) return;
  const target=isGame?gameCountdownTarget(event):gameStartInstant(event.date+'T'+event.time.split(/[–-]/)[0].trim());
  const known=Number.isFinite(target) && (!isGame || gameMeeting(event) || gameClock(event.starts_at)!=='00:00');
  const waiting=isGame?event.registration_open!==true:event.status!=='confirmed';
  const back=()=>isGame?openGameDetails(id):closeModal();
  const label=minutes=>minutes===0?pushText('Aus','Off'):
    minutes<60?pushText(minutes+' Min. vorher',minutes+' min before'):
      pushText(Math.floor(minutes/60)+' Std.'+(minutes%60?' '+minutes%60+' Min.':'')+' vorher',
        Math.floor(minutes/60)+' hr'+(minutes%60?' '+minutes%60+' min':'')+' before');
  const reference=isGame ? (gameMeeting(event)?pushText('vor der Treffzeit','before the meeting time'):pushText('vor der Treffzeit oder dem Spielbeginn','before the meeting time or tip-off'))
    :pushText('vor Trainingsbeginn','before practice starts');
  const title='<h2>'+pushText('Erinnerung','Reminder')+'</h2>';
  const reminderHeader=isGame?title+'<p>'+pushText('Du erhältst eine Nachricht ','You will get a notification ')+reference+'.</p>'
    :'<div class="push-reminder-head">'+title+'<button class="push-reminder-toggle" id="pushReminderToggle" type="button" role="switch" aria-label="'+pushText('Trainingserinnerung','Practice reminder')+'" aria-controls="pushReminderPicker"></button></div>';
  const leadPicker=isGame?'<div class="field"><label for="pushLead">'+pushText('Wie lange vorher?','How far in advance?')+'</label><select id="pushLead">'
    +PUSH_LEAD_CHOICES.map(minutes=>'<option value="'+minutes+'"'+(selected===minutes?' selected':'')+'>'+escapeHtml(label(minutes))+'</option>').join('')+'</select></div>'
    :'<section class="push-reminder-picker" id="pushReminderPicker" aria-labelledby="pushReminderBefore" hidden>'
      +'<h3 class="push-reminder-picker-title" id="pushReminderBefore">'+pushText('Vor','Before')+'</h3>'
      +'<div class="push-wheel-labels" aria-hidden="true"><span>'+pushText('Std.','hr')+'</span><span>'+pushText('Min.','min')+'</span></div>'
      +'<div class="push-wheels"><div class="push-wheel" id="pushReminderHours" tabindex="0" role="spinbutton" aria-label="'+pushText('Stunden','Hours')+'"></div>'
      +'<div class="push-wheel" id="pushReminderMinutes" tabindex="0" role="spinbutton" aria-label="'+pushText('Minuten','Minutes')+'"></div></div></section>';
  showModal(reminderHeader
    +(!known?'<p>'+pushEndMessage()+'</p>':waiting?'<p>'+pushText('Die Erinnerung wird erst verschickt, wenn der Termin bestätigt ist.','The reminder will only be sent once the event is confirmed.')+'</p>':'')
    +(isGame&&!categoryOn?'<p class="push-settings-note">'+pushText('Wenn du eine Vorlaufzeit speicherst, schaltest du diese Erinnerungskategorie ein.','Saving a lead time also turns on this reminder category.')+'</p>':'')
    +leadPicker+'<div class="modal-actions"><button class="ghost" id="pushReminderBack" type="button">'+pushText('Zurück','Back')+'</button>'
    +'<button class="primary" id="pushReminderSave" type="button">'+t('save')+'</button></div>');
  const readMinutes=isGame?()=>Number($('#pushLead').value):bindTrainingPushLead(selected,categoryOn);
  $('#pushReminderBack').onclick=back;
  $('#pushReminderSave').onclick=async eventClick=>{
    const button=eventClick.currentTarget, minutes=readMinutes(), user=APP_STATE.userId, state=pushState;
    if (!db || !user || !PUSH_UUID.test(String(id))) {
      toast(pushText('Für diesen Termin ist noch keine Push-Erinnerung verfügbar.','Push reminders are not available for this event yet.'));return;
    }
    if (!PUSH_LEAD_CHOICES.includes(minutes)) return;
    if (minutes && known && target-Date.now()<=minutes*60000) {
      toast(pushText('Dieser Zeitpunkt ist schon vorbei. Wähle eine kürzere Vorlaufzeit.','That reminder time has passed. Choose a shorter lead time.'));return;
    }
    button.disabled=true;
    try {
      if (minutes>0) await activatePushDevice();
      if (state!==pushState || user!==APP_STATE.userId) return;
      if (minutes>0 && !categoryOn) await savePushCategories([...state.categories,cat]);
      if (minutes!==selected) {
        const table=db.from('hoopslot_push_reminders');
        const {error}=minutes>0?await table.upsert({
          user_id:user,event_kind:kind,event_id:id,lead_minutes:minutes,revision:crypto.randomUUID(),
        },{onConflict:'user_id,event_kind,event_id'})
          :await table.delete().eq('user_id',user).eq('event_kind',kind).eq('event_id',id);
        if (error) throw new Error(pushText('Erinnerung konnte nicht gespeichert werden.','Reminder could not be saved.'));
      }
      if(minutes>0)state.reminders.set(key,minutes);else state.reminders.delete(key);
      if(!isGame)decoratePushTraining(event);
      if(button.isConnected)back();
      toast(minutes>0?pushText('Erinnerung gespeichert','Reminder saved'):pushText('Erinnerung ausgeschaltet','Reminder turned off'));
    } catch(error) { if(button.isConnected)button.disabled=false;toast(error.message); }
  };
}
async function openPushDestination(kind,id) {
  if (!APP_STATE.userId || !PUSH_UUID.test(id||'')) return;
  if (kind==='game') {
    await loadGames(true,{quiet:true});
    if (!APP_STATE.games.some(game=>String(game.id)===id)) return;
    nav('games');void openGameDetails(id);
  } else if (kind==='training') {
    await loadTrainings(true);
    if (APP_STATE.sessions.some(session=>String(session.id)===id)) openTrainingPanel(id);
  }
}
function openPushStartLink() {
  const url=new URL(location.href),kind=url.searchParams.get('pushEvent'),id=url.searchParams.get('pushId');
  if(!kind||!id||!APP_STATE.userId)return;
  url.searchParams.delete('pushEvent');url.searchParams.delete('pushId');
  history.replaceState(null,'',url.href);
  void openPushDestination(kind,id);
}
function initPushUi() {
  $('#pushSettings').onclick=openPushSettings;
  navigator.serviceWorker?.addEventListener('message',event=>{
    if(event.data?.type==='HOOPSLOT_NOTIFICATION')void openPushDestination(event.data.eventKind,event.data.eventId);
  });
  pushRefreshUi();
}
