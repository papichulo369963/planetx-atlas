import { STATIC } from "../api";
import { Component, lazy, useEffect, useState, type ComponentType, type ReactNode } from "react";

/** React.lazy that survives a rebuild: if a chunk is missing (stale cached page), reload once. */
export function lazyWithReload<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return lazy(async () => {
    try {
      const mod = await load();
      try { sessionStorage.removeItem("px-chunk-reload"); } catch { /* storage blocked */ }
      return mod;
    } catch (err) {
      let already = false;
      try { already = sessionStorage.getItem("px-chunk-reload") === "1"; sessionStorage.setItem("px-chunk-reload", "1"); } catch { /* storage blocked */ }
      if (!already) { location.reload(); return new Promise<{ default: T }>(() => undefined); }
      throw err;
    }
  });
}

/** Keeps one failing tab from taking down the whole app. */
export class TabBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error(`Tab "${this.props.name}" failed:`, error); }
  render() {
    if (!this.state.error) return this.props.children;
    const chunk = /dynamically imported module|Loading chunk|Failed to fetch/i.test(this.state.error.message);
    return (
      <div role="alert" className="panel p-6 space-y-3 text-sm">
        <h2 className="font-semibold text-rose-300">The “{this.props.name}” tab could not be shown</h2>
        <p className="text-slate-300">{chunk
          ? "The app files could not be loaded. Usually the local server is not running, or the page is an older cached version."
          : this.state.error.message}</p>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => this.setState({ error: null })}>Try again</button>
          <button className="btn" onClick={() => location.reload()}>Reload page</button>
        </div>
      </div>
    );
  }
}

/** Banner shown when the local backend stops answering. */
export function ServerStatus() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    if (STATIC) return;
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        if (alive) setDown(!r.ok);
      } catch { if (alive) setDown(true); }
    };
    check();
    const id = setInterval(check, 10000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  if (!down) return null;
  return (
    <div role="alert" className="mx-auto max-w-[1700px] px-4 pt-3">
      <div className="rounded-lg border border-rose-400/50 bg-rose-500/15 p-3 text-sm text-rose-100">
        <b>The PlanetX Atlas local server is not running.</b> Open the <b>PlanetX Atlas</b> shortcut again (desktop or Start menu), wait a few seconds and press <button className="underline" onClick={() => location.reload()}>reload</button>.
      </div>
    </div>
  );
}
