
// window.__volumeBooster__ = window.__volumeBooster__ || {};
// var vb = window.__volumeBooster__;

// vb.audioCtx = vb.audioCtx || new AudioContext();
// vb.gainNode = vb.gainNode || vb.audioCtx.createGain();
// vb.gainNode.connect(vb.audioCtx.destination);
// vb.multiplier = vb.multiplier || 1;
// vb.enabled = (vb.enabled !== false);
// vb.mediaNodes = vb.mediaNodes || new WeakMap();

// // Connect media safely
// function connect(media) {
//   if(!media || vb.mediaNodes.has(media)) return;
//   try {
//     const source = vb.audioCtx.createMediaElementSource(media);
//     source.connect(vb.gainNode);
//     vb.mediaNodes.set(media, source);
//     apply();
//   } catch(e) {
//     console.log('Volume Booster: Cannot connect media', e);
//   }
// }

// // Apply gain
// function apply() {
//   if(!vb.gainNode) return;
//   vb.gainNode.gain.value = vb.enabled ? vb.multiplier : 1;
// }

// // Initialize existing media
// document.querySelectorAll('video,audio').forEach(connect);

// // Listen to messages from popup
// chrome.runtime.onMessage.addListener(msg => {
//   if(msg.type === 'SET_MULTIPLIER'){
//     vb.multiplier = parseFloat(msg.value);
//     vb.enabled = true;
//     apply(); // Real-time
//   }
//   if(msg.type === 'TURN_OFF'){
//     vb.enabled = false;
//     apply(); // Reset
//   }
// });

// // Observe new media dynamically
// new MutationObserver(()=>document.querySelectorAll('video,audio').forEach(connect))
//   .observe(document.body,{childList:true,subtree:true});

// // Handle play events
// document.addEventListener('play', e => {
//   if(e.target.tagName==='VIDEO'||e.target.tagName==='AUDIO') connect(e.target);
// }, true);

// ---------------------------------------------------------------------

// window.__volumeBooster__ = window.__volumeBooster__ || {};
// var vb = window.__volumeBooster__;

// vb.audioCtx = vb.audioCtx || new AudioContext();
// vb.gainNode = vb.gainNode || vb.audioCtx.createGain();
// vb.gainNode.connect(vb.audioCtx.destination);
// vb.multiplier = vb.multiplier || 1;
// vb.enabled = (vb.enabled !== false);
// vb.mediaNodes = vb.mediaNodes || new WeakMap();
// vb.smoothTime = 0.3; // smooth transition in seconds

// // Connect media safely
// function connect(media) {
//   if(!media || vb.mediaNodes.has(media)) return;
//   try {
//     const source = vb.audioCtx.createMediaElementSource(media);
//     source.connect(vb.gainNode);
//     vb.mediaNodes.set(media, source);
//     apply(); // apply current multiplier smoothly
//   } catch(e) {
//     console.log('Volume Booster: Cannot connect media', e);
//   }
// }

// // Apply gain smoothly
// function apply() {
//   if(!vb.gainNode) return;
//   const target = vb.enabled ? vb.multiplier : 1;
//   const now = vb.audioCtx.currentTime;
//   vb.gainNode.gain.cancelScheduledValues(now);
//   vb.gainNode.gain.linearRampToValueAtTime(target, now + vb.smoothTime);
// }

// // Initialize existing media
// document.querySelectorAll('video,audio').forEach(connect);

// // Listen to messages from popup
// chrome.runtime.onMessage.addListener(msg => {
//   if(msg.type === 'SET_MULTIPLIER'){
//     vb.multiplier = parseFloat(msg.value);
//     vb.enabled = true;
//     apply(); // smooth real-time change
//   }
//   if(msg.type === 'TURN_OFF'){
//     vb.enabled = false;
//     apply(); // smooth reset
//   }
// });

// // Observe new media dynamically
// new MutationObserver(()=>document.querySelectorAll('video,audio').forEach(connect))
//   .observe(document.body,{childList:true,subtree:true});

// // Handle play events
// document.addEventListener('play', e => {
//   if(e.target.tagName==='VIDEO'||e.target.tagName==='AUDIO') connect(e.target);
// }, true);
window.__volumeBooster__ = window.__volumeBooster__ || {};
var vb = window.__volumeBooster__;

vb.audioCtx = vb.audioCtx || new AudioContext();
vb.gainNode = vb.gainNode || vb.audioCtx.createGain();
vb.compressor = vb.compressor || vb.audioCtx.createDynamicsCompressor();
vb.gainNode.connect(vb.compressor);
vb.compressor.connect(vb.audioCtx.destination);

vb.multiplier = vb.multiplier || 1;
vb.enabled = (vb.enabled !== false);
vb.mediaNodes = vb.mediaNodes || new WeakMap();
vb.smoothTime = 0.3; // smooth transition in seconds

// Connect media safely
function connect(media) {
  if(!media || vb.mediaNodes.has(media)) return;
  try {
    const source = vb.audioCtx.createMediaElementSource(media);
    source.connect(vb.gainNode);
    vb.mediaNodes.set(media, source);
    apply(); // smooth gain
  } catch(e) {
    console.log('Volume Booster: Cannot connect media', e);
  }
}

// Apply gain smoothly
function apply() {
  if(!vb.gainNode) return;
  const target = vb.enabled ? vb.multiplier : 1;
  const now = vb.audioCtx.currentTime;
  vb.gainNode.gain.cancelScheduledValues(now);
  vb.gainNode.gain.linearRampToValueAtTime(target, now + vb.smoothTime);
}

// Initialize existing media
document.querySelectorAll('video,audio').forEach(connect);

// Listen to messages from popup
chrome.runtime.onMessage.addListener(msg => {
  if(msg.type === 'SET_MULTIPLIER'){
    vb.multiplier = parseFloat(msg.value);
    vb.enabled = true;
    apply();
  }
  if(msg.type === 'TURN_OFF'){
    vb.enabled = false;
    apply();
  }
});

// Observe new media dynamically
new MutationObserver(()=>document.querySelectorAll('video,audio').forEach(connect))
  .observe(document.body,{childList:true,subtree:true});

// Handle play events
document.addEventListener('play', e => {
  if(e.target.tagName==='VIDEO'||e.target.tagName==='AUDIO') connect(e.target);
}, true);
