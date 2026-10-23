import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startAutosave } from './store/project';
import { startTheme } from './theme';
import { installWriteGuard } from './sync/guard';
import { startFileAutosave } from './io/fileSave';
import { startOffline } from './offline';
import { startCardTables } from './ui/cardTables';
import { startKeyboardInset } from './ui/responsive';
import { applyPrefs } from './prefs';
import './styles.css';

startAutosave();
startTheme();
installWriteGuard();
startFileAutosave();
startOffline();
startCardTables();
startKeyboardInset();
applyPrefs();
// Dev only: opengateAudit() in the console lists text running off its button, menu or the screen.
if (import.meta.env.DEV) void import('./ui/overflowAudit').then((m) => m.installOverflowAudit());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
