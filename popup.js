
const slider = document.getElementById('vol');
const value = document.getElementById('val');
const offBtn = document.getElementById('offBtn');

// Load saved multiplier
chrome.storage.sync.get(['multiplier','enabled'], data => {
  slider.value = data.multiplier || 1;
  value.textContent = slider.value + 'x';
});

function send(msg){
  chrome.tabs.query({active:true,currentWindow:true}, tabs => {
    const tab = tabs[0];
    if(!tab) return;
    if(tab.url.startsWith('chrome://') || tab.url.startsWith('file://')) return;

    chrome.tabs.sendMessage(tab.id, msg, response => {
      // ignore errors and closed port
      if(chrome.runtime.lastError) return;
    });
  });
}

// Real-time slider
slider.oninput = () => {
  value.textContent = slider.value + 'x';
  send({type:'SET_MULTIPLIER', value: slider.value});
};

// Save multiplier when slider stops
slider.onchange = () => {
  chrome.storage.sync.set({multiplier: slider.value, enabled:true});
};

// OFF button
offBtn.onclick = () => {
  chrome.storage.sync.set({enabled:false});
  send({type:'TURN_OFF'});
};
