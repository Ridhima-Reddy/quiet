const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('quietNative', {
  platform: 'desktop',
  googleToken: opts => ipcRenderer.invoke('google-token', opts),
  googleSignOut: () => ipcRenderer.invoke('google-signout'),
  setLoginItem: on => ipcRenderer.invoke('login-item', on),
  openMain: hash => ipcRenderer.send('open-main', hash),
  widgetSize: mode => ipcRenderer.send('widget-size', mode),
});
