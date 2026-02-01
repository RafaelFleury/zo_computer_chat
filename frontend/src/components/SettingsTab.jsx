import { useState, useEffect } from "react";
import { api } from "../services/api";
import "./SettingsTab.css";

function SettingsTab() {
  const [cloudSettings, setCloudSettings] = useState(null);
  const [localSettings, setLocalSettings] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Load settings from API
  const loadSettings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const settings = await api.getSettings();
      setCloudSettings(settings);
      setLocalSettings(JSON.parse(JSON.stringify(settings))); // Deep clone
      setIsDirty(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // Check if local state differs from cloud state
  useEffect(() => {
    if (cloudSettings && localSettings) {
      const isDifferent =
        JSON.stringify(cloudSettings) !== JSON.stringify(localSettings);
      setIsDirty(isDifferent);
    }
  }, [cloudSettings, localSettings]);

  // Handle compression settings change
  const handleCompressionChange = (field, value) => {
    const numValue = parseInt(value, 10);

    // Validate
    if (field === "threshold" && numValue < 1000) {
      setError("Compression threshold must be at least 1000");
      return;
    }

    if (field === "keepRecentMessages" && (numValue < 0 || numValue > 100)) {
      setError("Keep recent messages must be between 0 and 100");
      return;
    }

    setError(null);
    setLocalSettings({
      ...localSettings,
      compression: {
        ...localSettings.compression,
        [field]: numValue,
      },
    });
  };

  const handleProactiveChange = (field, value) => {
    if (!localSettings?.proactive) return;

    if (field === "intervalMinutes") {
      const numValue = parseInt(value, 10);
      if (Number.isNaN(numValue) || numValue < 1 || numValue > 120) {
        setError("Proactive interval must be between 1 and 120 minutes");
        return;
      }
      setError(null);
      setLocalSettings({
        ...localSettings,
        proactive: {
          ...localSettings.proactive,
          intervalMinutes: numValue,
        },
      });
      return;
    }

    if (field === "enabled") {
      setError(null);
      setLocalSettings({
        ...localSettings,
        proactive: {
          ...localSettings.proactive,
          enabled: Boolean(value),
        },
      });
    }
  };

  // Handle save
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updatedSettings = await api.updateSettings({
        compression: localSettings.compression,
        proactive: localSettings.proactive,
      });

      setCloudSettings(updatedSettings);
      setLocalSettings(JSON.parse(JSON.stringify(updatedSettings)));
      setIsDirty(false);
      setSuccessMessage("Settings saved successfully");

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle reload
  const handleReload = async () => {
    if (isDirty && !confirm("You have unsaved changes. Discard them and reload?")) {
      return;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      const settings = await api.reloadSettings();
      setCloudSettings(settings);
      setLocalSettings(JSON.parse(JSON.stringify(settings)));
      setIsDirty(false);
      setSuccessMessage("Settings reloaded from file");

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle reset
  const handleReset = async () => {
    if (!confirm("Reset all settings to default values? This cannot be undone.")) {
      return;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      const settings = await api.resetSettings();
      setCloudSettings(settings);
      setLocalSettings(JSON.parse(JSON.stringify(settings)));
      setIsDirty(false);
      setSuccessMessage("Settings reset to defaults");

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  if (isLoading) {
    return (
      <div className="settings-tab">
        <div className="settings-loading">Loading settings...</div>
      </div>
    );
  }

  if (!localSettings) {
    return (
      <div className="settings-tab">
        <div className="settings-error">Failed to load settings</div>
      </div>
    );
  }

  return (
    <div className="settings-tab">
      <div className="settings-header">
        <h1>Settings</h1>
        <div className="settings-controls">
          <button className="settings-button" onClick={handleReload}>
            Reload
          </button>
          <button className="settings-button" onClick={handleReset}>
            Reset to Defaults
          </button>
          <button
            className="settings-button settings-button-save"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {error && <div className="settings-message settings-error">{error}</div>}
      {successMessage && (
        <div className="settings-message settings-success">{successMessage}</div>
      )}

      <div className="settings-container">
        <section className="settings-section">
          <h2>Context Compression</h2>
          <p className="settings-section-description">
            Configure how the system compresses conversation history to manage
            context size and token usage.
          </p>

          <div className="setting-item">
            <label>
              <span className="setting-label">Compression Threshold (tokens)</span>
              <span className="setting-description">
                Trigger compression when context exceeds this token count.
                Higher values preserve more context but use more tokens.
              </span>
            </label>
            <input
              type="number"
              min="1000"
              step="1000"
              value={localSettings.compression.threshold}
              onChange={(e) => handleCompressionChange("threshold", e.target.value)}
              className="setting-input"
            />
          </div>

          <div className="setting-item">
            <label>
              <span className="setting-label">Keep Recent Messages (count)</span>
              <span className="setting-description">
                Number of recent messages to keep uncompressed during compression.
                Set to 0 to compress all messages.
              </span>
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={localSettings.compression.keepRecentMessages}
              onChange={(e) =>
                handleCompressionChange("keepRecentMessages", e.target.value)
              }
              className="setting-input"
            />
          </div>
        </section>

        <section className="settings-section">
          <h2>Proactive Mode</h2>
          <p className="settings-section-description">
            Configure the autonomous proactive assistant triggers and prompt settings.
          </p>

          <div className="setting-item setting-item-row">
            <div className="setting-info-column">
              <span className="setting-label">Enable Proactive Mode</span>
              <span className="setting-description">
                Allow scheduled proactive runs to occur in the Proactive tab.
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={localSettings.proactive.enabled}
                onChange={(e) =>
                  handleProactiveChange("enabled", e.target.checked)
                }
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <label>
              <span className="setting-label">Trigger Interval (minutes)</span>
              <span className="setting-description">
                How often the backend triggers proactive runs. Range: 1-120 minutes.
              </span>
            </label>
            <input
              type="number"
              min="1"
              max="120"
              step="1"
              value={localSettings.proactive.intervalMinutes}
              onChange={(e) =>
                handleProactiveChange("intervalMinutes", e.target.value)
              }
              className="setting-input"
            />
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Proactive Prompt File</span>
              <code className="setting-value">
                /home/workspace/zo_chat_memories/proactive_persona.json
              </code>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2>File Information</h2>
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Settings File</span>
              <code className="setting-value">/home/workspace/zo_chat_memories/settings.json</code>
            </div>
            {cloudSettings.metadata && (
              <>
                <div className="setting-info">
                  <span className="setting-label">Last Updated</span>
                  <code className="setting-value">
                    {new Date(cloudSettings.metadata.lastUpdated).toLocaleString()}
                  </code>
                </div>
                <div className="setting-info">
                  <span className="setting-label">Version</span>
                  <code className="setting-value">{cloudSettings.metadata.version}</code>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default SettingsTab;
