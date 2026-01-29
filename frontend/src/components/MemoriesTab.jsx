import { useState, useEffect } from "react";
import { api } from "../services/api";
import "./MemoriesTab.css";

const CATEGORIES = [
  { value: "user", label: "User" },
  { value: "user_preference", label: "User Preference" },
  { value: "project_info", label: "Project Info" },
  { value: "personal_fact", label: "Personal Fact" },
  { value: "system", label: "System" },
  { value: "other", label: "Other" },
];

function MemoriesTab() {
  const [cloudMemories, setCloudMemories] = useState([]);
  const [localMemories, setLocalMemories] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newMemory, setNewMemory] = useState({
    content: "",
    category: "user",
  });
  const [editForm, setEditForm] = useState({
    content: "",
    category: "",
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
    if (!newMemory.content.trim()) {
      setError("Memory content cannot be empty");
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const memory = {
      id: tempId,
      content: newMemory.content.trim(),
      category: newMemory.category,
      createdAt: new Date().toISOString(),
      metadata: {},
    };

    setLocalMemories([...localMemories, memory]);
    setNewMemory({ content: "", category: "user" });
    setAddingNew(false);
  };

  // Handle edit memory
  const startEdit = (memory) => {
    setEditingId(memory.id);
    setEditForm({
      content: memory.content,
      category: memory.category,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ content: "", category: "" });
  };

  const saveEdit = () => {
    if (!editForm.content.trim()) {
      setError("Memory content cannot be empty");
      return;
    }

    setLocalMemories(
      localMemories.map((m) =>
        m.id === editingId
          ? {
              ...m,
              content: editForm.content.trim(),
              category: editForm.category,
              updatedAt: new Date().toISOString(),
            }
          : m
      )
    );
    setEditingId(null);
    setEditForm({ content: "", category: "" });
  };

  // Handle delete memory
  const handleDeleteMemory = (memory) => {
    // Block deletion of system memories
    if (memory.category === "system" && memory.metadata?.isDefault) {
      setError("Cannot delete system memories");
      return;
    }

    if (
      !confirm(
        `Are you sure you want to delete this memory?\n\n"${memory.content.substring(0, 100)}..."`
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
      // Identify deletions (in cloud but not in local, excluding system)
      const localIds = new Set(localMemories.map((m) => m.id));
      const toDelete = cloudMemories.filter(
        (m) =>
          !localIds.has(m.id) &&
          !(m.category === "system" && m.metadata?.isDefault)
      );

      // Identify additions (temp IDs)
      const toAdd = localMemories.filter((m) => m.id.startsWith("temp-"));

      // Identify updates (different content/category/metadata)
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
        await api.addMemory(memory.content, memory.category, memory.metadata);
      }

      for (const memory of toUpdate) {
        await api.updateMemory(memory.id, {
          content: memory.content,
          category: memory.category,
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

  // Filter memories by category
  const filteredMemories =
    categoryFilter === "all"
      ? localMemories
      : localMemories.filter((m) => m.category === categoryFilter);

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
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            disabled={isSaving}
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
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
                className="category-select"
                value={newMemory.category}
                onChange={(e) =>
                  setNewMemory({ ...newMemory, category: e.target.value })
                }
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className="memory-content-edit"
              value={newMemory.content}
              onChange={(e) =>
                setNewMemory({ ...newMemory, content: e.target.value })
              }
              placeholder="Enter memory content..."
              rows={3}
              autoFocus
            />
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
            {categoryFilter === "all"
              ? "No memories found. Click '+ Add Memory' to create one."
              : `No memories found in category '${CATEGORIES.find((c) => c.value === categoryFilter)?.label}'.`}
          </div>
        )}

        {/* Memory list */}
        {!isLoading &&
          filteredMemories.map((memory) => {
            const isEditing = editingId === memory.id;
            const isSystem = memory.category === "system" && memory.metadata?.isDefault;

            return (
              <div
                key={memory.id}
                className={`memory-item category-${memory.category}`}
              >
                <div className="memory-header">
                  {isEditing ? (
                    <select
                      className="category-select"
                      value={editForm.category}
                      onChange={(e) =>
                        setEditForm({ ...editForm, category: e.target.value })
                      }
                      disabled={isSystem}
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="memory-category">
                      {CATEGORIES.find((c) => c.value === memory.category)
                        ?.label || memory.category}
                    </span>
                  )}
                  <span className="memory-timestamp">
                    {formatTimestamp(memory.updatedAt || memory.createdAt)}
                  </span>
                </div>

                {isEditing ? (
                  <textarea
                    className="memory-content-edit"
                    value={editForm.content}
                    onChange={(e) =>
                      setEditForm({ ...editForm, content: e.target.value })
                    }
                    rows={3}
                  />
                ) : (
                  <div className="memory-content">{memory.content}</div>
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
                        disabled={isSystem || isSaving}
                        title={
                          isSystem
                            ? "Cannot delete system memories"
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
