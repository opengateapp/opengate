import { setWriteGuard } from '../store/project';
import { toast } from '../components/common';
import { CHANNEL_LABELS, LOCAL_ONLY, channelOf } from './channels';
import { canWrite } from './state';
import { currentSync } from './engine';

// In a shared project, changes outside what your link allows are refused before they
// happen (the relay would refuse them too), with a short note saying why.

let lastToast = 0;

export function installWriteGuard() {
  setWriteGuard((fields) => {
    if (currentSync()?.isApplying) return true;
    for (const f of fields) {
      if (LOCAL_ONLY.has(f) || f === 'scriptDoc') continue;
      const ch = channelOf(f);
      if (!canWrite(ch)) {
        if (Date.now() - lastToast > 2500) {
          lastToast = Date.now();
          toast(`View only: your link doesn't allow changes to ${CHANNEL_LABELS[ch]}.`);
        }
        return false;
      }
    }
    return true;
  });
}
