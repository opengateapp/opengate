import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startAutosave } from './store/project';
import { startTheme } from './theme';
import { installWriteGuard } from './sync/guard';
import { startFileAutosave } from './io/fileSave';
import { startOffline } from './offline';
import './styles.css';

startAutosave();
startTheme();
installWriteGuard();
startFileAutosave();
startOffline();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
