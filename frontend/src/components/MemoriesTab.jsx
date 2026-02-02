import { useState, useEffect } from "react";
import { api } from "../services/api";
import "./MemoriesTab.css";

const TYPES = [
  { value: "skill", label: "Skill" },
  { value: "new_insight", label: "New Insight" },
  { value: "system_instruction", label: "System Instruction" },
  { value: "user_preference", label: "User Preference" },
];

function MemoriesTab() {
  const [cloudMemories, setCloudMemories] = useState([]);
  const [localMemories, setLocalMemories] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newMemory, setNewMemory] = useState({
    title: "",
    description: "",
    content: "",
    type: "system_instruction",
    includeInSystemMessage: true,
  });
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    content: "",
    type: "",
    includeInSystemMessage: true,
  });

  // Load memories from API
  const loadMemories = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getMemories();
      const memories = data.memories || [];
      setCloudMemories(memories);
      setLocalMemories(JSON.parse(JSON.stringify(memories))); // Deep clone
      setIsDirty(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMemories();
  }, []);

  // Check if local state differs from cloud state
  useEffect(() => {
    const isDifferent =
      JSON.stringify(cloudMemories) !== JSON.stringify(localMemories);
    setIsDirty(isDifferent);
  }, [cloudMemories, localMemories]);

  // Handle add new memory
  const handleAddMemory = () => {
    if (!newMemory.title.trim()) {
      setError("Memory title cannot be empty");
      return;
    }
    if (!newMemory.content.trim()) {
      setError("Memory content cannot be empty");
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const memory = {
      id: tempId,
      title: newMemory.title.trim(),
      description: newMemory.description.trim(),
      content: newMemory.content.trim(),
      type: newMemory.type,
      includeInSystemMessage: newMemory.includeInSystemMessage,
      createdAt: new Date().toISOString(),
      metadata: {},
    };

    setLocalMemories([...localMemories, memory]);
    setNewMemory({
      title: "",
      description: "",
      content: "",
      type: "system_instruction",
      includeInSystemMessage: true,
    });
    setAddingNew(false);
  };

  // Handle edit memory
  const startEdit = (memory) => {
    setEditingId(memory.id);
    setEditForm({
      title: memory.title,
      description: memory.description || "",
      content: memory.content,
      type: memory.type,
      includeInSystemMessage: memory.includeInSystemMessage !== false,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({
      title: "",
      description: "",
      content: "",
      type: "",
      includeInSystemMessage: true,
    });
  };

  const saveEdit = () => {
    if (!editForm.title.trim()) {
      setError("Memory title cannot be empty");
      return;
    }
    if (!editForm.content.trim()) {
      setError("Memory content cannot be empty");
      return;
    }

    setLocalMemories(
      localMemories.map((m) =>
        m.id === editingId
          ? {
              ...m,
              title: editForm.title.trim(),
              description: editForm.description.trim(),
              content: editForm.content.trim(),
              type: editForm.type,
              includeInSystemMessage: editForm.includeInSystemMessage,
              updatedAt: new Date().toISOString(),
            }
          : m
      )
    );
    setEditingId(null);
    setEditForm({
      title: "",
      description: "",
      content: "",
      type: "",
      includeInSystemMessage: true,
    });
  };

  // Handle delete memory
  const handleDeleteMemory = (memory) => {
    // Block deletion of default memories
    if (memory.metadata?.isDefault) {
      setError("Cannot delete default memories");
      return;
    }

    if (
      !confirm(
        `Are you sure you want to delete this memory?\n\n"${memory.title}"`
      )
    ) {
      return;
    }

    setLocalMemories(localMemories.filter((m) => m.id !== memory.id));
  };

  // Handle reload (discard local changes)
  const handleReload = async () => {
    if (
      isDirty &&
      !confirm("You have unsaved changes. Discard them and reload?")
    ) {
      return;
    }

    await loadMemories();
  };

  // Batch save changes to cloud
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      // Identify deletions (in cloud but not in local, excluding default)
      const localIds = new Set(localMemories.map((m) => m.id));
      const toDelete = cloudMemories.filter(
        (m) => !localIds.has(m.id) && !m.metadata?.isDefault
      );

      // Identify additions (temp IDs)
      const toAdd = localMemories.filter((m) => m.id.startsWith("temp-"));

      // Identify updates (different content/fields)
      const toUpdate = localMemories.filter((m) => {
        if (m.id.startsWith("temp-")) return false;
        const cloudVersion = cloudMemories.find((cm) => cm.id === m.id);
        if (!cloudVersion) return false;
        return JSON.stringify(cloudVersion) !== JSON.stringify(m);
      });

      // Execute operations sequentially
      for (const memory of toDelete) {
        await api.deleteMemory(memory.id);
      }

      for (const memory of toAdd) {
        await api.addMemory(
          memory.title,
          memory.description,
          memory.content,
          memory.type,
          memory.includeInSystemMessage,
          memory.metadata
        );
      }

      for (const memory of toUpdate) {
        await api.updateMemory(memory.id, {
          title: memory.title,
          description: memory.description,
          content: memory.content,
          type: memory.type,
          includeInSystemMessage: memory.includeInSystemMessage,
          metadata: memory.metadata,
        });
      }

      // Reload from cloud to sync state
      await loadMemories();
    } catch (err) {
      setError(`Failed to save changes: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Filter memories by type
  const filteredMemories =
    typeFilter === "all"
      ? localMemories
      : localMemories.filter((m) => m.type === typeFilter);

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="memories-tab">
      <div className="memories-header">
        <div className="memories-controls">
          <button
            className="add-button"
            onClick={() => setAddingNew(!addingNew)}
            disabled={isSaving}
          >
            {addingNew ? "Cancel" : "+ Add Memory"}
          </button>

          <select
            className="filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            disabled={isSaving}
          >
            <option value="all">All Types</option>
            {TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>

          <button
            className="reload-button"
            onClick={handleReload}
            disabled={isSaving || isLoading}
          >
            Reload
          </button>

          <button
            className={`save-button ${isDirty ? "dirty" : ""}`}
            onClick={handleSave}
            disabled={!isDirty || isSaving}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="memories-container">
        {error && <div className="error-message">{error}</div>}

        {/* Add new memory form */}
        {addingNew && (
          <div className="memory-item add-memory-form">
            <div className="memory-header">
              <select
                className="type-select"
                value={newMemory.type}
                onChange={(e) =>
                  setNewMemory({ ...newMemory, type: e.target.value })
                }
              >
                {TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              className="memory-title-input"
              value={newMemory.title}
              onChange={(e) =>
                setNewMemory({ ...newMemory, title: e.target.value })
              }
              placeholder="Memory title (required)"
              autoFocus
            />
            <input
              type="text"
              className="memory-description-input"
              value={newMemory.description}
              onChange={(e) =>
                setNewMemory({ ...newMemory, description: e.target.value })
              }
              placeholder="Brief description (optional)"
            />
            <textarea
              className="memory-content-edit"
              value={newMemory.content}
              onChange={(e) =>
                setNewMemory({ ...newMemory, content: e.target.value })
              }
              placeholder="Full memory content (required)"
              rows={3}
            />
            <label className="memory-toggle">
              <input
                type="checkbox"
                checked={newMemory.includeInSystemMessage}
                onChange={(e) =>
                  setNewMemory({
                    ...newMemory,
                    includeInSystemMessage: e.target.checked,
                  })
                }
              />
              <span>Include in system message</span>
            </label>
            <div className="memory-actions">
              <button className="action-cancel" onClick={() => setAddingNew(false)}>
                Cancel
              </button>
              <button className="action-save" onClick={handleAddMemory}>
                Add
              </button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="empty-state">Loading memories...</div>
        )}

        {/* Empty state */}
        {!isLoading && filteredMemories.length === 0 && (
          <div className="empty-state">
            {typeFilter === "all"
              ? "No memories found. Click '+ Add Memory' to create one."
              : `No memories found of type '${TYPES.find((t) => t.value === typeFilter)?.label}'.`}
          </div>
        )}

        {/* Memory list */}
        {!isLoading &&
          filteredMemories.map((memory) => {
            const isEditing = editingId === memory.id;
            const isDefault = memory.metadata?.isDefault;

            return (
              <div
                key={memory.id}
                className={`memory-item type-${memory.type}`}
              >
                <div className="memory-header">
                  {isEditing ? (
                    <select
                      className="type-select"
                      value={editForm.type}
                      onChange={(e) =>
                        setEditForm({ ...editForm, type: e.target.value })
                      }
                      disabled={isDefault}
                    >
                      {TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="memory-type">
                      {TYPES.find((t) => t.value === memory.type)?.label ||
                        memory.type}
                    </span>
                  )}
                  <span className="memory-timestamp">
                    {formatTimestamp(memory.updatedAt || memory.createdAt)}
                  </span>
                </div>

                {isEditing ? (
                  <>
                    <input
                      type="text"
                      className="memory-title-input"
                      value={editForm.title}
                      onChange={(e) =>
                        setEditForm({ ...editForm, title: e.target.value })
                      }
                      placeholder="Memory title (required)"
                    />
                    <input
                      type="text"
                      className="memory-description-input"
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm({ ...editForm, description: e.target.value })
                      }
                      placeholder="Brief description (optional)"
                    />
                    <textarea
                      className="memory-content-edit"
                      value={editForm.content}
                      onChange={(e) =>
                        setEditForm({ ...editForm, content: e.target.value })
                      }
                      rows={3}
                    />
                    <label className="memory-toggle">
                      <input
                        type="checkbox"
                        checked={editForm.includeInSystemMessage}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            includeInSystemMessage: e.target.checked,
                          })
                        }
                      />
                      <span>Include in system message</span>
                    </label>
                  </>
                ) : (
                  <>
                    <div className="memory-title">{memory.title}</div>
                    {memory.description && (
                      <div className="memory-description">
                        {memory.description}
                      </div>
                    )}
                    <div className="memory-content">{memory.content}</div>
                    {!memory.includeInSystemMessage && (
                      <div className="memory-excluded-badge">
                        Not included in system
                      </div>
                    )}
                  </>
                )}

                <div className="memory-actions">
                  {isEditing ? (
                    <>
                      <button className="action-cancel" onClick={cancelEdit}>
                        Cancel
                      </button>
                      <button className="action-save" onClick={saveEdit}>
                        Save
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="action-edit"
                        onClick={() => startEdit(memory)}
                        disabled={isSaving}
                      >
                        Edit
                      </button>
                      <button
                        className="action-delete"
                        onClick={() => handleDeleteMemory(memory)}
                        disabled={isDefault || isSaving}
                        title={
                          isDefault
                            ? "Cannot delete default memories"
                            : "Delete memory"
                        }
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

export default MemoriesTab;
