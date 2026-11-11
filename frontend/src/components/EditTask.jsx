
import { useState } from "react";
import "./EditTask.css";

function EditTask({ task, onTaskUpdated, onCancel }) {
  const [title, setTitle] = useState(task.title);
  const [editVersion] = useState(task.version);
  const [description, setDescription] = useState(
    task.description || ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    const token = sessionStorage.getItem("token");
    const tenantId = sessionStorage.getItem("tenantId");
    const boardId = sessionStorage.getItem("boardId");

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `http://localhost:5000/api/tenants/${tenantId}/boards/${boardId}/tasks/${task.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
version: editVersion          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error(
            "This task was modified by another user. Refresh the board and try again."
          );
        }

        throw new Error(data.message || "Failed to update task");
      }

      await onTaskUpdated();
      onCancel();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="edit-task-form" onSubmit={handleSubmit}>
      <div className="edit-task-heading">
        <div>
          <span className="edit-task-eyebrow">
            TASK DETAILS
          </span>
          <h3>Edit Task</h3>
          <p>Update the details of this task.</p>
        </div>

        <button
          type="button"
          className="edit-task-close"
          onClick={onCancel}
          disabled={loading}
          aria-label="Close edit task form"
        >
          ×
        </button>
      </div>

      <div className="edit-task-field">
        <label htmlFor={`edit-title-${task.id}`}>
          Task Title
          <span className="edit-task-required"> *</span>
        </label>

        <input
          id={`edit-title-${task.id}`}
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Enter task title"
          maxLength={200}
          required
          autoFocus
        />
      </div>

      <div className="edit-task-field">
        <label htmlFor={`edit-description-${task.id}`}>
          Description
        </label>

        <textarea
          id={`edit-description-${task.id}`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Add details about this task..."
          rows={3}
        />
      </div>

      {error && (
        <p className="edit-task-error" role="alert">
          {error}
        </p>
      )}

      <div className="edit-task-actions">
        <button
          type="button"
          className="edit-task-cancel"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </button>

        <button
          type="submit"
          className="edit-task-submit"
          disabled={loading}
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

export default EditTask;
