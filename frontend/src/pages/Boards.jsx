
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProfilePanel from "../components/ProfilePanel";
import "./Boards.css";

const API_URL = "http://localhost:5000";

function Boards() {
  const navigate = useNavigate();

  const [boards, setBoards] = useState([]);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [boardName, setBoardName] = useState("");
  const [boardDescription, setBoardDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingBoardId, setEditingBoardId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const [deletingBoardId, setDeletingBoardId] = useState(null);

  const token = sessionStorage.getItem("token");
  const tenantId = sessionStorage.getItem("tenantId");

  const canManageBoards =
    role === "ORG_ADMIN" || role === "TENANT_ADMIN";



  const fetchBoards = async () => {
    const response = await fetch(
      `${API_URL}/api/boards?tenantId=${encodeURIComponent(tenantId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to load boards");
    }

    setBoards(data.boards || []);
  };

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    if (!tenantId) {
      navigate("/tenants", { replace: true });
      return;
    }

    let cancelled = false;

    const loadPage = async () => {
      try {
        setLoading(true);
        setError("");

        const accessResponse = await fetch(
          `${API_URL}/api/tenants/${tenantId}/access-check`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const accessData = await accessResponse.json();

        if (!accessResponse.ok) {
          throw new Error(
            accessData.message || "Unable to verify tenant access"
          );
        }

        if (cancelled) return;

        setRole(accessData.role);

        const boardsResponse = await fetch(
          `${API_URL}/api/boards?tenantId=${encodeURIComponent(tenantId)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const boardsData = await boardsResponse.json();

        if (!boardsResponse.ok) {
          throw new Error(
            boardsData.message || "Failed to load boards"
          );
        }

        if (!cancelled) {
          setBoards(boardsData.boards || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadPage();

    return () => {
      cancelled = true;
    };
  }, [navigate, token, tenantId]);

  const selectBoard = (boardId) => {
    sessionStorage.setItem("boardId", boardId);
    navigate("/kanban");
  };

  const createBoard = async (event) => {
    event.preventDefault();

    if (!canManageBoards) return;

    setCreating(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API_URL}/api/boards`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId,
          name: boardName.trim(),
          description: boardDescription.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to create board"
        );
      }

      setBoardName("");
      setBoardDescription("");

      await fetchBoards();
      setSuccess("Board created successfully!");
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const startEditing = (board) => {
    if (!canManageBoards) return;

    setEditingBoardId(board.id);
    setEditName(board.name);
    setEditDescription(board.description || "");
    setError("");
    setSuccess("");
  };

  const cancelEditing = () => {
    setEditingBoardId(null);
    setEditName("");
    setEditDescription("");
  };

  const updateBoard = async (event, boardId) => {
    event.preventDefault();

    if (!canManageBoards) return;

    if (editName.trim().length < 2) {
      setError("Board name must contain at least 2 characters");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `${API_URL}/api/boards/${boardId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tenantId,
            name: editName.trim(),
            description: editDescription.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to update board"
        );
      }

      cancelEditing();
      await fetchBoards();
      setSuccess("Board updated successfully!");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteBoard = async (board) => {
    if (!canManageBoards) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${board.name}"?\n\n` +
        "This action cannot be undone. " +
        "Tasks and columns belonging to this board may also be deleted."
    );

    if (!confirmed) return;

    setDeletingBoardId(board.id);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `${API_URL}/api/boards/${board.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tenantId }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to delete board"
        );
      }

      if (sessionStorage.getItem("boardId") === board.id) {
        sessionStorage.removeItem("boardId");
      }

      await fetchBoards();

      setSuccess(
        `Board "${board.name}" deleted successfully!`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingBoardId(null);
    }
  };

  return (
    <main className="boards-page">
      <header className="boards-header">
        <div className="boards-header-content">
          <span className="boards-eyebrow">
            WORKSPACE / BOARDS
          </span>

          <h1>Kanban Boards</h1>

          <p>
            Manage your project boards and keep your team organized.
          </p>

          {!loading && role && (
            <span className="boards-role-badge">
              <span className="boards-role-dot" />
              {role.replaceAll("_", " ")}
            </span>
          )}
        </div>

    

<div className="boards-header-actions">
  <button
    type="button"
    className="boards-back-button"
    onClick={() => navigate("/tenants")}
  >
    ← Back to Tenants
  </button>

  {canManageBoards && (
    <button
      type="button"
      className="boards-manage-members-button"
      onClick={() => navigate("/manage-members")}
    >
      Manage Members
    </button>
  )}

  <ProfilePanel role={role} />
</div>


      </header>

      {!loading && canManageBoards && (
        <section className="boards-create-panel">
          <div className="boards-section-heading">
            <div className="boards-section-icon">
              +
            </div>

            <div>
              <h2>Create New Board</h2>

              <p>
                Set up a new workspace board for your team.
              </p>
            </div>
          </div>

          <form
            className="boards-create-form"
            onSubmit={createBoard}
          >
            <div className="boards-field">
              <label htmlFor="boardName">
                Board Name <span>*</span>
              </label>

              <input
                id="boardName"
                type="text"
                value={boardName}
                onChange={(event) =>
                  setBoardName(event.target.value)
                }
                placeholder="e.g. Development Sprint"
                minLength={2}
                maxLength={100}
                required
              />
            </div>

            <div className="boards-field">
              <label htmlFor="boardDescription">
                Description
              </label>

              <textarea
                id="boardDescription"
                value={boardDescription}
                onChange={(event) =>
                  setBoardDescription(event.target.value)
                }
                placeholder="What will your team work on?"
                maxLength={1000}
                rows={3}
              />
            </div>

            <div className="boards-form-actions">
              <button
                type="submit"
                className="boards-primary-button"
                disabled={creating}
              >
                {creating
                  ? "Creating..."
                  : "+ Create Board"}
              </button>
            </div>
          </form>
        </section>
      )}

      {success && (
        <p className="boards-success" role="status">
          {success}
        </p>
      )}

      {error && (
        <p className="boards-error" role="alert">
          {error}
        </p>
      )}

      {loading && (
        <div className="boards-loading">
          Loading boards...
        </div>
      )}

      {!loading && !error && boards.length === 0 && (
        <div className="boards-empty-state">
          <div className="boards-empty-icon">
            ▦
          </div>

          <h3>No boards yet</h3>

          <p>
            {canManageBoards
              ? "Create your first board to start organizing tasks."
              : "There are no boards available in this workspace yet."}
          </p>
        </div>
      )}

      {!loading && boards.length > 0 && (
        <section className="boards-list-section">
          <div className="boards-list-heading">
            <div>
              <span className="boards-eyebrow">
                YOUR WORKSPACE
              </span>

              <h2>Project Boards</h2>

              <p>
                Select a board to view and manage its tasks.
              </p>
            </div>

            <span className="boards-total-count">
              {boards.length}{" "}
              {boards.length === 1 ? "Board" : "Boards"}
            </span>
          </div>

          <div className="boards-grid">
            {boards.map((board) => (
              <article
                className="boards-card"
                key={board.id}
              >
                {editingBoardId === board.id &&
                canManageBoards ? (
                  <form
                    className="boards-edit-form"
                    onSubmit={(event) =>
                      updateBoard(event, board.id)
                    }
                  >
                    <div className="boards-edit-heading">
                      <span className="boards-eyebrow">
                        BOARD SETTINGS
                      </span>

                      <h3>Edit Board</h3>
                    </div>

                    <div className="boards-field">
                      <label
                        htmlFor={`editName-${board.id}`}
                      >
                        Board Name <span>*</span>
                      </label>

                      <input
                        id={`editName-${board.id}`}
                        type="text"
                        value={editName}
                        onChange={(event) =>
                          setEditName(event.target.value)
                        }
                        minLength={2}
                        maxLength={100}
                        required
                      />
                    </div>

                    <div className="boards-field">
                      <label
                        htmlFor={`editDescription-${board.id}`}
                      >
                        Description
                      </label>

                      <textarea
                        id={`editDescription-${board.id}`}
                        value={editDescription}
                        onChange={(event) =>
                          setEditDescription(event.target.value)
                        }
                        maxLength={1000}
                        rows={3}
                      />
                    </div>

                    <div className="boards-edit-actions">
                      <button
                        type="button"
                        className="boards-secondary-button"
                        onClick={cancelEditing}
                        disabled={saving}
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        className="boards-primary-button"
                        disabled={saving}
                      >
                        {saving
                          ? "Saving..."
                          : "Save Changes"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="boards-card-top">
                      <div className="boards-card-icon">
                        ▦
                      </div>

                      <span className="boards-card-type">
                        PROJECT BOARD
                      </span>
                    </div>

                    <div className="boards-card-body">
                      <h3>{board.name}</h3>

                      <p>
                        {board.description ||
                          "Organize tasks and collaborate with your team."}
                      </p>
                    </div>

                    <div className="boards-card-footer">
                      <button
                        type="button"
                        className="boards-open-button"
                        onClick={() =>
                          selectBoard(board.id)
                        }
                      >
                        Open Board →
                      </button>

                      {canManageBoards && (
                        <div className="boards-card-actions">
                          <button
                            type="button"
                            className="boards-edit-button"
                            onClick={() =>
                              startEditing(board)
                            }
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="boards-delete-button"
                            onClick={() =>
                              deleteBoard(board)
                            }
                            disabled={
                              deletingBoardId !== null
                            }
                          >
                            {deletingBoardId === board.id
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

export default Boards;
