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
import './styles.css';

startAutosave();
startTheme();
installWriteGuard();
startFileAutosave();
startOffline();
startCardTables();
startKeyboardInset();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
