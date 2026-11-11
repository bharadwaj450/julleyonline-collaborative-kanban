
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  DndContext,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable
} from "@dnd-kit/core";

import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";

import CreateTask from "../components/CreateTask";
import DraggableTask from "../components/DraggableTask";
import { connectSocket } from "../services/socket";

import "./Kanban.css";

const API_URL = "http://localhost:5000";

const getBaseUrl = () => {
  const tenantId = sessionStorage.getItem("tenantId");
  const boardId = sessionStorage.getItem("boardId");

  return `${API_URL}/api/tenants/${tenantId}/boards/${boardId}`;
};

const getHeaders = () => ({
  Authorization: `Bearer ${sessionStorage.getItem("token")}`
});

// ======================================
// KANBAN COLUMN COMPONENT
// ======================================

function KanbanColumn({
  column,
  columnTasks,
  children,
  canManageColumns,
  editingColumnId,
  editColumnName,
  setEditColumnName,
  savingColumn,
  startEditingColumn,
  cancelEditingColumn,
  renameColumn,
  deleteColumn,
  deletingColumnId
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${column.id}`
  });

  return (
    <section
      ref={setNodeRef}
      className={`kanban-column ${isOver ? "is-over" : ""}`}
    >
      {editingColumnId === column.id && canManageColumns ? (
        <form
          className="kanban-column-edit-form"
          onSubmit={(event) => renameColumn(event, column.id)}
        >
          <input
            type="text"
            className="kanban-column-edit-input"
            value={editColumnName}
            onChange={(event) =>
              setEditColumnName(event.target.value)
            }
            maxLength={100}
            required
            aria-label="Column name"
          />

          <div className="kanban-column-edit-actions">
            <button type="submit" disabled={savingColumn}>
              {savingColumn ? "Saving..." : "Save"}
            </button>

            <button
              type="button"
              onClick={cancelEditingColumn}
              disabled={savingColumn}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="kanban-column-header">
          <div className="kanban-column-title">
            <span className="kanban-column-indicator" />

            <h2>{column.name}</h2>

            <span className="kanban-task-count">
              {columnTasks.length}
            </span>
          </div>

          {canManageColumns && (
            <div className="kanban-column-actions">
              <button
                type="button"
                className="kanban-column-edit"
                onClick={() => startEditingColumn(column)}
                title="Rename column"
                aria-label={`Rename ${column.name} column`}
              >
                <span aria-hidden="true">✎</span> Edit
              </button>

              <button
                type="button"
                className="kanban-column-delete"
                onClick={() => deleteColumn(column)}
                disabled={deletingColumnId !== null}
                title="Delete column"
                aria-label={`Delete ${column.name} column`}
              >
                <span aria-hidden="true">×</span>
                {deletingColumnId === column.id
                  ? "Deleting..."
                  : "Delete"}
              </button>
            </div>
          )}
        </div>
      )}

      <SortableContext
        items={columnTasks.map((task) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        {children}
      </SortableContext>
    </section>
  );
}

// ======================================
// MAIN KANBAN COMPONENT
// ======================================

function Kanban() {
  const navigate = useNavigate();

  const [columns, setColumns] = useState([]);
  const [newColumnName, setNewColumnName] = useState("");

  const [creatingColumn, setCreatingColumn] = useState(false);
  const [editingColumnId, setEditingColumnId] = useState(null);
  const [editColumnName, setEditColumnName] = useState("");
  const [savingColumn, setSavingColumn] = useState(false);
  const [deletingColumnId, setDeletingColumnId] = useState(null);

  const [userRole, setUserRole] = useState(null);

  const canManageColumns =
    userRole === "ORG_ADMIN" ||
    userRole === "TENANT_ADMIN";

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editingTaskId, setEditingTaskId] = useState(null);
  const [deletingTaskId, setDeletingTaskId] = useState(null);
  const [movingTaskId, setMovingTaskId] = useState(null);

  const [socketConnected, setSocketConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);

  const movingRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const refreshRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5
      }
    }),

    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  // ======================================
  // LOAD BOARD DATA
  // ======================================


  // ======================================
  // LOAD BOARD DATA
  // ======================================

  useEffect(() => {
    let cancelled = false;

    const loadBoard = async () => {
      const token = sessionStorage.getItem("token");
      const tenantId = sessionStorage.getItem("tenantId");
      const boardId = sessionStorage.getItem("boardId");

      if (!token) {
        navigate("/login", { replace: true });
        return;
      }

      if (!tenantId || !boardId) {
        navigate("/boards", { replace: true });
        return;
      }

      try {
        const baseUrl = getBaseUrl();
        const headers = getHeaders();

        // Fetch columns, tasks, and permissions.
        const [
          columnsResponse,
          tasksResponse,
          accessResponse
        ] = await Promise.all([
          fetch(`${baseUrl}/columns`, {
            headers
          }),

          fetch(`${baseUrl}/tasks`, {
            headers
          }),

          fetch(
            `${API_URL}/api/tenants/${tenantId}/access-check`,
            {
              headers
            }
          )
        ]);

        const [
          columnsData,
          tasksData,
          accessData
        ] = await Promise.all([
          columnsResponse.json(),
          tasksResponse.json(),
          accessResponse.json()
        ]);

        // Verify tenant access.
        if (!accessResponse.ok) {
          throw new Error(
            accessData.message ||
              "Failed to verify user permissions"
          );
        }

        // Verify columns response.
        if (!columnsResponse.ok) {
          throw new Error(
            columnsData.message ||
              "Failed to load columns"
          );
        }

        // Verify tasks response.
        if (!tasksResponse.ok) {
          throw new Error(
            tasksData.message ||
              "Failed to load tasks"
          );
        }

        // Prevent state updates after unmounting.
        if (cancelled) {
          return;
        }

        // Store the user's workspace role.
        setUserRole(accessData.role);

        // Sort columns by their position.
        setColumns(
          [...(columnsData.columns || [])].sort(
            (a, b) => a.position - b.position
          )
        );

        // Load board tasks.
        setTasks(tasksData.tasks || []);

        setError("");
      } catch (err) {
        console.error("LOAD BOARD ERROR:", err);

        if (!cancelled) {
          setError(
            err.message || "Unable to load Kanban board"
          );
        }
      } finally {
        // Stop loading after requests complete.
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadBoard();

    return () => {
      cancelled = true;
    };
  }, [navigate]);


  // ======================================
  // REFRESH TASKS
  // ======================================

  const refreshTasks = async () => {
    const response = await fetch(
      `${getBaseUrl()}/tasks`,
      {
        headers: getHeaders()
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || "Failed to refresh tasks"
      );
    }

    setTasks(data.tasks || []);

    return data.tasks || [];
  };

  refreshRef.current = refreshTasks;

  // ======================================
  // SOCKET.IO REAL-TIME COLLABORATION
  // ======================================

  useEffect(() => {
    const tenantId = sessionStorage.getItem("tenantId");
    const token = sessionStorage.getItem("token");

    if (!tenantId || !token) return;

    const socket = connectSocket();

    let revoked = false;
    let active = true;

    const refreshFromSocket = async () => {
      if (!active || revoked) return;

      if (movingRef.current) {
        pendingRefreshRef.current = true;
        return;
      }

      try {
        await refreshRef.current();
      } catch (err) {
        if (active && !revoked) {
          setError(err.message);
        }
      }
    };

    // Handle membership removal.
    const handleAccessRevoked = (data) => {
      if (!active || revoked) return;
      if (data?.tenantId !== tenantId) return;

      revoked = true;

      setSocketConnected(false);
      setOnlineUsers([]);

      sessionStorage.removeItem("tenantId");
      sessionStorage.removeItem("boardId");

      window.alert(
        data.message ||
          "Your access to this workspace has been removed."
      );

      navigate("/tenants", {
        replace: true
      });
    };

    const joinTenant = () => {
      if (!active || revoked) return;

      socket.emit(
        "tenant:join",
        { tenantId },
        (response) => {
          if (!active || revoked) return;

          if (response?.success) {
            setSocketConnected(true);
            refreshFromSocket();
          } else {
            setSocketConnected(false);

            if (
              response?.message ===
              "Access denied to this tenant"
            ) {
              handleAccessRevoked({
                tenantId,
                message:
                  "You no longer have access to this workspace."
              });
            } else {
              setError(
                response?.message ||
                  "Unable to join the workspace."
              );
            }
          }
        }
      );
    };

    const handleDisconnect = () => {
      if (!active) return;

      setSocketConnected(false);
      setOnlineUsers([]);
    };

    const handleConnectError = (err) => {
      if (!active || revoked) return;

      setSocketConnected(false);
      setOnlineUsers([]);

      console.error(
        "Socket.IO connection error:",
        err.message
      );
    };

    const handleTaskChange = (event) => {
      if (!active || revoked) return;

      if (
        event?.tenantId &&
        event.tenantId !== tenantId
      ) {
        return;
      }

      refreshFromSocket();
    };

    const handlePresenceUpdate = (data) => {
      if (!active || revoked) return;

      if (data?.tenantId !== tenantId) return;

      setOnlineUsers(data.users || []);
    };

    socket.on("connect", joinTenant);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    socket.on("task:created", handleTaskChange);
    socket.on("task:updated", handleTaskChange);
    socket.on("task:deleted", handleTaskChange);
    socket.on("task:moved", handleTaskChange);

    socket.on(
      "presence:updated",
      handlePresenceUpdate
    );

    socket.on(
      "tenant:access-revoked",
      handleAccessRevoked
    );

    if (socket.connected) {
      joinTenant();
    }

    return () => {
      active = false;

      socket.off("connect", joinTenant);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);

      socket.off("task:created", handleTaskChange);
      socket.off("task:updated", handleTaskChange);
      socket.off("task:deleted", handleTaskChange);
      socket.off("task:moved", handleTaskChange);

      socket.off(
        "presence:updated",
        handlePresenceUpdate
      );

      socket.off(
        "tenant:access-revoked",
        handleAccessRevoked
      );

      if (socket.connected) {
        socket.emit("tenant:leave", {
          tenantId
        });
      }
    };
  }, [navigate]);

  // ======================================
  // CREATE COLUMN
  // ======================================

  const createColumn = async (event) => {
    event.preventDefault();

    if (!canManageColumns || creatingColumn) return;

    const name = newColumnName.trim();

    if (!name) {
      setError("Please enter a column name");
      return;
    }

    setCreatingColumn(true);
    setError("");

    try {
      const response = await fetch(
        `${getBaseUrl()}/columns`,
        {
          method: "POST",
          headers: {
            ...getHeaders(),
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ name })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to create column"
        );
      }

      setColumns((previous) =>
        [...previous, data.column].sort(
          (a, b) => a.position - b.position
        )
      );

      setNewColumnName("");
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingColumn(false);
    }
  };

  // ======================================
  // EDIT COLUMN
  // ======================================

  const startEditingColumn = (column) => {
    if (!canManageColumns) return;

    setEditingColumnId(column.id);
    setEditColumnName(column.name);
    setError("");
  };

  const cancelEditingColumn = () => {
    setEditingColumnId(null);
    setEditColumnName("");
  };

  const renameColumn = async (event, columnId) => {
    event.preventDefault();

    if (!canManageColumns || savingColumn) return;

    const name = editColumnName.trim();

    if (!name) {
      setError("Column name cannot be empty");
      return;
    }

    setSavingColumn(true);
    setError("");

    try {
      const response = await fetch(
        `${getBaseUrl()}/columns/${columnId}`,
        {
          method: "PATCH",
          headers: {
            ...getHeaders(),
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ name })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to rename column"
        );
      }

      setColumns((previous) =>
        previous.map((column) =>
          column.id === columnId
            ? {
                ...column,
                name: data.column.name
              }
            : column
        )
      );

      cancelEditingColumn();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingColumn(false);
    }
  };

  // ======================================
  // DELETE COLUMN
  // ======================================

  const deleteColumn = async (column) => {
    if (
      !canManageColumns ||
      deletingColumnId !== null
    ) {
      return;
    }

    const columnTasks = tasks.filter(
      (task) => task.columnId === column.id
    );

    if (columnTasks.length > 0) {
      setError(
        "Move or delete tasks before deleting this column"
      );
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete "${column.name}"?`
    );

    if (!confirmed) return;

    setDeletingColumnId(column.id);
    setError("");

    try {
      const response = await fetch(
        `${getBaseUrl()}/columns/${column.id}`,
        {
          method: "DELETE",
          headers: getHeaders()
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to delete column"
        );
      }

      setColumns((previous) =>
        previous.filter(
          (item) => item.id !== column.id
        )
      );

      if (editingColumnId === column.id) {
        cancelEditingColumn();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingColumnId(null);
    }
  };

  // ======================================
  // DELETE TASK
  // ======================================

  const deleteTask = async (task) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${task.title}"?`
    );

    if (!confirmed) return;

    setDeletingTaskId(task.id);
    setError("");

    try {
      const response = await fetch(
        `${getBaseUrl()}/tasks/${task.id}`,
        {
          method: "DELETE",
          headers: getHeaders()
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to delete task"
        );
      }

      setTasks((previous) =>
        previous.filter(
          (item) => item.id !== task.id
        )
      );

      if (editingTaskId === task.id) {
        setEditingTaskId(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingTaskId(null);
    }
  };

  // ======================================
  // DRAG AND DROP
  // ======================================

  const handleDragEnd = async ({ active, over }) => {
    if (!over || movingRef.current) return;

    const draggedTask = tasks.find(
      (task) => task.id === active.id
    );

    if (!draggedTask) return;

    const overId = String(over.id);
    let targetColumnId;

    if (overId.startsWith("column:")) {
      targetColumnId = overId.slice(
        "column:".length
      );
    } else {
      const targetTask = tasks.find(
        (task) => task.id === overId
      );

      if (!targetTask) return;

      targetColumnId = targetTask.columnId;
    }

    const destinationTasks = tasks
      .filter(
        (task) =>
          task.columnId === targetColumnId &&
          task.id !== draggedTask.id
      )
      .sort(
        (a, b) => a.position - b.position
      );

    let targetPosition;

    if (overId.startsWith("column:")) {
      targetPosition = destinationTasks.length;
    } else {
      targetPosition = destinationTasks.findIndex(
        (task) => task.id === overId
      );

      if (targetPosition === -1) return;
    }

    const currentColumnTasks = tasks
      .filter(
        (task) =>
          task.columnId === draggedTask.columnId
      )
      .sort(
        (a, b) => a.position - b.position
      );

    const currentIndex =
      currentColumnTasks.findIndex(
        (task) => task.id === draggedTask.id
      );

    if (
      draggedTask.columnId === targetColumnId &&
      currentIndex === targetPosition
    ) {
      return;
    }

    const previousTasks = tasks;

    const optimisticTasks = tasks
      .filter(
        (task) => task.id !== draggedTask.id
      )
      .map((task) => ({ ...task }));

    const movedTask = {
      ...draggedTask,
      columnId: targetColumnId
    };

    const sourceTasks = optimisticTasks
      .filter(
        (task) =>
          task.columnId === draggedTask.columnId
      )
      .sort(
        (a, b) => a.position - b.position
      );

    const targetTasks =
      draggedTask.columnId === targetColumnId
        ? sourceTasks
        : optimisticTasks
            .filter(
              (task) =>
                task.columnId === targetColumnId
            )
            .sort(
              (a, b) => a.position - b.position
            );

    targetTasks.splice(
      targetPosition,
      0,
      movedTask
    );

    sourceTasks.forEach((task, index) => {
      task.position = index;
    });

    if (sourceTasks !== targetTasks) {
      targetTasks.forEach((task, index) => {
        task.position = index;
      });
    }

    movingRef.current = true;

    setTasks([
      ...optimisticTasks,
      movedTask
    ]);

    setMovingTaskId(draggedTask.id);
    setError("");

    try {
      const response = await fetch(
        `${getBaseUrl()}/tasks/${draggedTask.id}/move`,
        {
          method: "PATCH",
          headers: {
            ...getHeaders(),
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            targetColumnId,
            targetPosition,
            version: draggedTask.version
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          response.status === 409
            ? "Task changed on the server. The board will reload."
            : data.message || "Failed to move task"
        );
      }

      await refreshTasks();
    } catch (err) {
      setTasks(previousTasks);
      setError(err.message);

      try {
        await refreshTasks();
      } catch {
        // Keep the original error visible.
      }
    } finally {
      movingRef.current = false;
      setMovingTaskId(null);

      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false;

        try {
          await refreshTasks();
        } catch (err) {
          setError(err.message);
        }
      }
    }
  };

  // ======================================
  // PAGE
  // ======================================

  return (
    <main className="kanban-page">
      <header className="kanban-dashboard-header">
        <div className="kanban-dashboard-heading">
          <span className="kanban-eyebrow">
            WORKSPACE / BOARD
          </span>

          <h1>Collaborative Kanban Board</h1>

          <p>
            Organize tasks, track progress, and collaborate in real time.
          </p>

          <span
            className={`kanban-status ${
              socketConnected ? "" : "is-offline"
            }`}
          >
            <span aria-hidden="true">
              {socketConnected ? "●" : "○"}
            </span>

            {socketConnected
              ? "Live collaboration active"
              : "Connecting..."}
          </span>
        </div>

        <nav
          className="kanban-header-actions"
          aria-label="Board navigation"
        >
          <button
            type="button"
            onClick={() =>
              navigate("/boards")
            }
          >
            ← Back to Boards
          </button>

          <button
            type="button"
            className="kanban-primary-button"
            onClick={() =>
              navigate("/activity-history")
            }
          >
            View Activity History
          </button>
        </nav>
      </header>

      <section className="kanban-presence-panel">
        <div className="kanban-presence-heading">
          <div>
            <h2>Team collaboration</h2>

            <p>
              People currently connected to this workspace
            </p>
          </div>

          <span className="kanban-online-count">
            <span className="kanban-online-dot" />
            {onlineUsers.length} online
          </span>
        </div>

        <div className="kanban-presence-users">
          {onlineUsers.length === 0 ? (
            <p className="kanban-empty-presence">
              No users currently online
            </p>
          ) : (
            onlineUsers.map((user) => (
              <div
                className="kanban-presence-user"
                key={user.id}
              >
                <span className="kanban-user-avatar">
                  {(user.name || "U")
                    .charAt(0)
                    .toUpperCase()}
                </span>

                <span className="kanban-user-name">
                  {user.name}
                </span>

                <span className="kanban-user-active-dot" />
              </div>
            ))
          )}
        </div>
      </section>

      {!loading && canManageColumns && (
        <section className="kanban-create-column">
          <div className="kanban-create-column-info">
            <h2>Manage board columns</h2>

            <p>
              Create a new workflow stage for your team
            </p>
          </div>

          <form
            className="kanban-create-column-form"
            onSubmit={createColumn}
          >
            <input
              type="text"
              value={newColumnName}
              onChange={(event) =>
                setNewColumnName(event.target.value)
              }
              placeholder="New column name"
              maxLength={100}
              required
              aria-label="New column name"
            />

            <button
              type="submit"
              className="kanban-primary-button"
              disabled={creatingColumn}
            >
              {creatingColumn
                ? "Creating..."
                : "+ Add Column"}
            </button>
          </form>
        </section>
      )}

      {loading && (
        <p className="kanban-loading">
          Loading Kanban board...
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="kanban-error"
        >
          {error}
        </p>
      )}

      {!loading && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={handleDragEnd}
        >
          <div className="kanban-columns">
            {columns.map((column) => {
              const columnTasks = tasks
                .filter(
                  (task) =>
                    task.columnId === column.id
                )
                .sort(
                  (a, b) =>
                    a.position - b.position
                );

              return (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  columnTasks={columnTasks}
                  canManageColumns={canManageColumns}
                  editingColumnId={editingColumnId}
                  editColumnName={editColumnName}
                  setEditColumnName={setEditColumnName}
                  savingColumn={savingColumn}
                  startEditingColumn={startEditingColumn}
                  cancelEditingColumn={cancelEditingColumn}
                  renameColumn={renameColumn}
                  deleteColumn={deleteColumn}
                  deletingColumnId={deletingColumnId}
                >
                  {columnTasks.map((task) => (
                    <DraggableTask
                      key={task.id}
                      task={task}
                      editingTaskId={editingTaskId}
                      setEditingTaskId={setEditingTaskId}
                      refreshTasks={refreshTasks}
                      deleteTask={deleteTask}
                      deletingTaskId={deletingTaskId}
                    />
                  ))}

                  <div className="kanban-add-task">
                    <CreateTask
                      columnId={column.id}
                      onTaskCreated={refreshTasks}
                    />
                  </div>
                </KanbanColumn>
              );
            })}
          </div>
        </DndContext>
      )}
    </main>
  );
}

export default Kanban;
