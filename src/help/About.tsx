import { appContext, REPO } from './feedback';
import { HelpLinks } from './HelpMenu';

/** Settings → About & help: version, licence, where the code is, and the help links. */
export function AboutSettings() {
  const c = appContext();
  return (
    <div className="prefs about-settings">
      <h3>About Open Gate</h3>
      <p>Version <b>{c.version}</b> · {c.environment}</p>
      <p className="small">Free and open source under the <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer noopener">GPL-3.0 licence</a>. The code: <a href={REPO} target="_blank" rel="noreferrer noopener">github.com/opengateapp/opengate</a>. The projects it builds on are credited on the Home screen.</p>
      <h4>Help</h4>
      <HelpLinks tab="setup" />
    </div>
  );
}
