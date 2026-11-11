
import { useState } from "react";
import "./CreateTask.css";

function CreateTask({ columnId, onTaskCreated }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const token = sessionStorage.getItem("token");
    const tenantId = sessionStorage.getItem("tenantId");
    const boardId = sessionStorage.getItem("boardId");

    setError("");
    setLoading(true);

    try {
      const response = await fetch(
        `http://localhost:5000/api/tenants/${tenantId}/boards/${boardId}/tasks`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            columnId
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to create task");
      }

      setTitle("");
      setDescription("");
      setIsOpen(false);

      onTaskCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
    setError("");
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        className="create-task-trigger"
        onClick={() => setIsOpen(true)}
      >
        <span className="create-task-plus" aria-hidden="true">
          +
        </span>
        <span>Add Task</span>
      </button>
    );
  }

  return (
    <form className="create-task-form" onSubmit={handleSubmit}>
      <div className="create-task-heading">
        <div>
          <span className="create-task-eyebrow">
            NEW TASK
          </span>
          <h3>Create Task</h3>
        </div>

        <button
          type="button"
          className="create-task-close"
          onClick={handleCancel}
          disabled={loading}
          aria-label="Close task form"
        >
          ×
        </button>
      </div>

      <div className="create-task-field">
        <label htmlFor={`title-${columnId}`}>
          Task Title <span className="create-task-required">*</span>
        </label>

        <input
          id={`title-${columnId}`}
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Design dashboard layout"
          required
          maxLength={200}
          autoFocus
        />
      </div>

      <div className="create-task-field">
        <label htmlFor={`description-${columnId}`}>
          Description
        </label>

        <textarea
          id={`description-${columnId}`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Add more details about this task..."
          rows={3}
        />
      </div>

      {error && (
        <p className="create-task-error" role="alert">
          {error}
        </p>
      )}

      <div className="create-task-actions">
        <button
          type="button"
          className="create-task-cancel"
          disabled={loading}
          onClick={handleCancel}
        >
          Cancel
        </button>

        <button
          type="submit"
          className="create-task-submit"
          disabled={loading}
        >
          {loading ? "Creating..." : "+ Create Task"}
        </button>
      </div>
    </form>
  );
}

export default CreateTask;
