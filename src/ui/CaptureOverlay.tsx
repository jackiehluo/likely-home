import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { initialCaptureState, transition } from "../domain";
import type { Channel, ChannelVisibility } from "../domain";
import type { ExtractedCapture } from "./extract";
import { request } from "./runtime";

type Props = Readonly<{ capture: ExtractedCapture; onClose(): void }>;

type OnboardingStep = "checking" | "arena" | "jev" | "picker";

export function CaptureOverlay({ capture, onClose }: Props) {
  const [state, dispatch] = useReducer(transition, initialCaptureState(capture.target, capture.context));
  const nextRequestId = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("checking");
  const [jevApiKey, setJevApiKey] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);
  const knownJevSetup = useRef(false);
  const [newChannel, setNewChannel] = useState<
    | { kind: "closed" }
    | { kind: "editing"; title: string; visibility: ChannelVisibility }
    | { kind: "creating"; title: string; visibility: ChannelVisibility }
  >({ kind: "closed" });

  const loadChannels = useCallback(async (query: string) => {
    const requestId = ++nextRequestId.current;
    dispatch({ type: "channels-requested", query, requestId });
    const response = await request({ type: "list-channels", query });
    if (!response.ok) return dispatch({ type: "failed", message: response.message });
    if (response.type !== "channels") return dispatch({ type: "failed", message: "Are.na returned an unexpected response." });
    dispatch({ type: "channels-loaded", channels: response.channels, requestId });
    const ranking = await request({ type: "rank-channels", context: capture.context, channels: response.channels });
    if (!ranking.ok || ranking.type !== "ranking" || !ranking.ranking) {
      dispatch({ type: "ranking-unavailable", requestId });
      return;
    }
    dispatch({ type: "channels-ranked", ranking: ranking.ranking, requestId });
  }, [capture.context]);

  useEffect(() => {
    void request({ type: "get-status" }).then((response) => {
      if (!response.ok) return dispatch({ type: "failed", message: response.message });
      if (response.type !== "status") return;
      knownJevSetup.current = response.jevConfigured;
      dispatch({ type: "auth-resolved", connected: response.arenaConnected });
      if (!response.arenaConnected) return setOnboardingStep("arena");
      if (!knownJevSetup.current) return setOnboardingStep("jev");
      setOnboardingStep("picker");
      void loadChannels("");
    });
  }, [loadChannels]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  async function signIn() {
    const response = await request({ type: "authorize" });
    if (!response.ok) return dispatch({ type: "failed", message: response.message });
    dispatch({ type: "auth-resolved", connected: true });
    if (!knownJevSetup.current) {
      setOnboardingStep("jev");
      return;
    }
    setOnboardingStep("picker");
    await loadChannels("");
  }

  async function finishJevSetup(key: string) {
    setSetupError(null);
    const response = await request({ type: "complete-jev-setup", jevApiKey: key });
    if (!response.ok) return setSetupError(response.message);
    knownJevSetup.current = true;
    setOnboardingStep("picker");
    await loadChannels("");
  }

  function openOptions() {
    void request({ type: "open-options" });
  }

  function openJevHelp() {
    void request({ type: "open-jev-help" });
  }

  function search(query: string) {
    setSearchValue(query);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void loadChannels(query), 180);
  }

  function openChannelForm() {
    setNewChannel({ kind: "editing", title: searchValue.trim(), visibility: "private" });
  }

  async function createNewChannel() {
    if (newChannel.kind !== "editing" || !newChannel.title.trim()) return;
    const input = newChannel;
    setNewChannel({ ...input, kind: "creating" });
    const response = await request({ type: "create-channel", title: input.title, visibility: input.visibility });
    if (!response.ok) {
      setNewChannel(input);
      return dispatch({ type: "failed", message: response.message });
    }
    if (response.type !== "channel-created") {
      setNewChannel(input);
      return dispatch({ type: "failed", message: "Are.na returned an unexpected response." });
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearchValue("");
    setNewChannel({ kind: "closed" });
    dispatch({ type: "channel-created", channel: response.channel });
  }

  async function connect() {
    dispatch({ type: "connect-requested" });
    const response = await request({ type: "connect", target: state.target, channelIds: [...state.selectedIds] });
    if (!response.ok) return dispatch({ type: "failed", message: response.message });
    if (response.type !== "connected") return dispatch({ type: "failed", message: "Are.na returned an unexpected response." });
    dispatch({ type: "connect-succeeded" });
    setTimeout(onClose, 900);
  }

  const channels = state.displayOrder.map((id) => state.channels.get(id)).filter((channel): channel is Channel => Boolean(channel));

  return (
    <div className="lh-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`lh-panel${state.error ? " has-error" : ""}`} role="dialog" aria-modal="true" aria-label="Connect to Are.na">
        <header className="lh-header">
          <svg className="lh-brand-icon" viewBox="0 0 512 512" role="img" aria-label="Likely Home on Are.na">
            <path fill="#1a1a1a" d="M8 216 256 10l248 206h-40v286H48V216H8Z" />
            <text x="256" y="478" fill="#fff" fontFamily="Arial Unicode MS" fontSize="242" letterSpacing="-30" textAnchor="middle">✶✶</text>
          </svg>
          <div className="lh-header-actions">
            <button className="lh-icon-button lh-preferences-button" onClick={openOptions} aria-label="Preferences">⋯</button>
            <button className="lh-icon-button lh-close-button" onClick={onClose} aria-label="Close">×</button>
          </div>
        </header>

        {onboardingStep === "checking" ? (
          <main className="lh-auth"><p>Getting things ready…</p></main>
        ) : onboardingStep === "arena" ? (
          <main className="lh-auth">
            <p>Connect your Are.na account to see your channels.</p>
            <button className="lh-primary" onClick={() => void signIn()}>Continue with Are.na</button>
            <button className="lh-text-button" onClick={openOptions}>Settings</button>
          </main>
        ) : onboardingStep === "jev" ? (
          <main className="lh-jev">
            <div>
              <h2>Add Jev</h2>
              <p>Jev sorts your channels by where this page probably belongs.</p>
            </div>
            <label>
              <span>API key</span>
              <input type="password" value={jevApiKey} onChange={(event) => setJevApiKey(event.currentTarget.value)} placeholder="apikey_…" autoComplete="off" autoFocus />
            </label>
            {setupError ? <p className="lh-setup-error">{setupError}</p> : null}
            <div className="lh-jev-actions">
              <button className="lh-primary" disabled={!jevApiKey.trim()} onClick={() => void finishJevSetup(jevApiKey)}>Continue</button>
            </div>
            <button className="lh-text-button lh-key-help" onClick={openJevHelp}>Where do I get a key?</button>
          </main>
        ) : (
          <>
            <div className="lh-capture">
              <div className="lh-capture-copy">
                <span className="lh-capture-title">{capture.context.title || capture.context.url}</span>
                <span className="lh-capture-url">{new URL(capture.context.url).hostname}</span>
              </div>
              <span className="lh-capture-type">{capture.target.kind === "text" ? "Text" : capture.target.kind === "image" ? "Image" : "Link"}</span>
            </div>
            <div className="lh-search-wrap">
              <span className="lh-search-icon" aria-hidden="true">⌕</span>
              <input className="lh-search" type="search" placeholder="Search channels" value={searchValue} onChange={(event) => search(event.currentTarget.value)} autoFocus />
            </div>
            <main className="lh-channels">
              {newChannel.kind === "closed" ? (
                <button className="lh-create-trigger" onClick={openChannelForm}>+ New channel</button>
              ) : (
                <form className="lh-create-form" onSubmit={(event) => { event.preventDefault(); void createNewChannel(); }}>
                  <input
                    className="lh-create-title"
                    aria-label="Channel name"
                    placeholder="Channel name"
                    value={newChannel.title}
                    disabled={newChannel.kind === "creating"}
                    onChange={(event) => setNewChannel({ kind: "editing", title: event.currentTarget.value, visibility: newChannel.visibility })}
                    autoFocus
                  />
                  <div className="lh-visibility" role="radiogroup" aria-label="Channel visibility">
                    {([
                      { value: "private", label: "Private" },
                      { value: "closed", label: "Closed" },
                      { value: "public", label: "Public" },
                    ] satisfies readonly { value: ChannelVisibility; label: string }[]).map(({ value, label }) => (
                      <label key={value} className={newChannel.visibility === value ? "is-selected" : ""}>
                        <input
                          type="radio"
                          name="visibility"
                          value={value}
                          checked={newChannel.visibility === value}
                          disabled={newChannel.kind === "creating"}
                          onChange={() => setNewChannel({ kind: "editing", title: newChannel.title, visibility: value })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div className="lh-create-actions">
                    <button type="button" className="lh-text-button" disabled={newChannel.kind === "creating"} onClick={() => setNewChannel({ kind: "closed" })}>Cancel</button>
                    <button type="submit" className="lh-small-primary" disabled={newChannel.kind === "creating" || !newChannel.title.trim()}>{newChannel.kind === "creating" ? "Creating…" : "Create"}</button>
                  </div>
                </form>
              )}
              {state.phase === "loading" && channels.length === 0 ? <p className="lh-empty">Loading channels…</p> : null}
              {channels.map((channel) => (
                <label key={channel.id} className={`lh-channel ${state.selectedIds.has(channel.id) ? "is-selected" : ""}`}>
                  <input type="checkbox" checked={state.selectedIds.has(channel.id)} onChange={() => dispatch({ type: "channel-toggled", channelId: channel.id })} />
                  <span className="lh-check" aria-hidden="true">{state.selectedIds.has(channel.id) ? "✓" : ""}</span>
                  <span className="lh-channel-title">{channel.title}</span>
                </label>
              ))}
              {state.phase !== "loading" && channels.length === 0 && !state.error && newChannel.kind === "closed" ? <p className="lh-empty">No matching channels.</p> : null}
              {state.error ? <div className="lh-error-state"><p>{state.error}</p><button className="lh-text-button" onClick={() => void loadChannels(state.query)}>Try again</button></div> : null}
            </main>
            <footer className="lh-footer">
              <button className="lh-primary" disabled={state.selectedIds.size === 0 || state.phase === "connecting" || state.phase === "done"} onClick={() => void connect()}>
                {state.phase === "done" ? "Saved" : state.phase === "connecting" ? "Saving…" : `Save${state.selectedIds.size ? ` to ${state.selectedIds.size}` : ""}`}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
