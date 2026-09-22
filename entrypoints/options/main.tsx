import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Settings } from "../../src/domain";
import { request } from "../../src/ui/runtime";
import "./style.css";

function agentPrompt(jevOnly: boolean): string {
  if (jevOnly) {
    return "Finish Jev setup for the Likely Home Chrome extension. Create or retrieve a TypeSafe Jev API key, paste it into the extension settings, save it, and test that likely channels are sorted on a normal webpage. Ask for confirmation immediately before creating an API key.";
  }
  return "Set up the Likely Home Chrome extension for me. Open its settings, create or retrieve a TypeSafe Jev API key, paste it into the extension, save the settings, connect my Are.na account using the built-in sign-in, and test the picker on a normal webpage. Ask for confirmation immediately before creating an API key.";
}

function Options() {
  const [settings, setSettings] = useState<Settings>({ jevApiKey: "" });
  const [notice, setNotice] = useState("");
  const jevOnly = new URLSearchParams(window.location.search).get("setup") === "jev";

  useEffect(() => {
    void request({ type: "get-settings" }).then((response) => {
      if (response.ok && response.type === "settings") setSettings(response.settings);
    });
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const response = await request({ type: "save-settings", settings });
    setNotice(response.ok ? "saved" : response.message);
  }

  async function connectArena() {
    const saved = await request({ type: "save-settings", settings });
    if (!saved.ok) return setNotice(saved.message);
    const response = await request({ type: "authorize" });
    setNotice(response.ok ? "are.na connected" : response.message);
  }

  async function copy(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(message);
    } catch {
      setNotice("could not copy. select the text instead.");
    }
  }

  return (
    <main>
      <header>
        <h1>likely home</h1>
        <p>sort your are.na channels by where a page probably belongs.</p>
      </header>

      <section className="setup" aria-labelledby="setup-title">
        <h2 id="setup-title">{jevOnly ? "add jev" : "setup"}</h2>
        <ol>
          <li>get a <a href="https://typesafe.ai" target="_blank" rel="noreferrer">typesafe jev api key</a>.</li>
          <li>paste the key and save.</li>
          {jevOnly ? null : <li>connect your are.na account.</li>}
        </ol>
      </section>

      <form onSubmit={(event) => void save(event)}>
        <label>
          <span>jev api key</span>
          <input type="password" value={settings.jevApiKey} onChange={(event) => setSettings({ ...settings, jevApiKey: event.currentTarget.value })} placeholder="api key" autoComplete="off" />
        </label>
        <div className="actions">
          <p role="status" aria-live="polite">{notice}</p>
          <button type="submit">save</button>
          {jevOnly ? null : <button type="button" className="primary" onClick={() => void connectArena()}>connect are.na</button>}
        </div>
      </form>

      <section className="agent" aria-labelledby="agent-title">
        <div>
          <h2 id="agent-title">give this to an agent</h2>
          <p>it can handle the setup from scratch.</p>
        </div>
        <button type="button" className="text-button" onClick={() => void copy(agentPrompt(jevOnly), "agent prompt copied")}>copy prompt</button>
        <pre>{agentPrompt(jevOnly)}</pre>
      </section>

    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Options root was not found.");
createRoot(root).render(<Options />);
