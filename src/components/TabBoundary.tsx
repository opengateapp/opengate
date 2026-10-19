import { Component, type ReactNode } from 'react';

// If one tab hits an error (damaged data, a bug), show a message there instead of blanking the
// whole app. The project and every other tab keep working.

export class TabBoundary extends Component<{ tab: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error) { console.error('Tab error', error); }

  componentDidUpdate(prev: { tab: string }) {
    // Switching tabs gives the new one a fresh start.
    if (prev.tab !== this.props.tab && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="tab-error">
        <h3>This tab ran into a problem</h3>
        <p className="muted">Your project is safe, and the other tabs still work. Something in this tab couldn't be shown{this.state.error.message ? `: ${this.state.error.message}` : '.'}</p>
        <div className="row">
          <button className="primary" onClick={() => this.setState({ error: null })}>Try again</button>
          <button onClick={() => location.reload()}>Reload Open Gate</button>
        </div>
      </div>
    );
  }
}
