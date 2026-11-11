
import { useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import EditTask from "./EditTask";
import "./DraggableTask.css";

function DraggableTask({
  task,
  editingTaskId,
  setEditingTaskId,
  refreshTasks,
  deleteTask,
  deletingTaskId
}) {
  const cardRef = useRef(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: task.id
  });

  // dnd-kit requires these values to change during dragging.
  // All static visual styling remains in DraggableTask.css.
  useEffect(() => {
    const element = cardRef.current;
    if (!element) return;

    element.style.transform = CSS.Transform.toString(transform) || "";
    element.style.transition = transition || "";

    return () => {
      element.style.transform = "";
      element.style.transition = "";
    };
  }, [transform, transition]);

  const attachRefs = (node) => {
    cardRef.current = node;
    setNodeRef(node);
  };

  const isEditing = editingTaskId === task.id;
  const isDeleting = deletingTaskId === task.id;

  return (
    <article
      ref={attachRefs}
      className={`kanban-task-card${isDragging ? " is-dragging" : ""}`}
    >
      {isEditing ? (
        <EditTask
          task={task}
          onTaskUpdated={refreshTasks}
          onCancel={() => setEditingTaskId(null)}
        />
      ) : (
        <>
          <div className="task-card-top">
            <span className="task-card-type">TASK</span>

            <button
              type="button"
              className="task-drag-handle"
              {...attributes}
              {...listeners}
              aria-label={`Drag task ${task.title}`}
              title="Drag to move"
            >
              <span aria-hidden="true">⠿</span>
            </button>
          </div>

          <h3 className="task-card-title">{task.title}</h3>

          {task.description && (
            <p className="task-card-description">
              {task.description}
            </p>
          )}

          <div className="task-card-footer">
            <span className="task-card-label">
              Board task
            </span>

            <div className="task-card-actions">
              <button
                type="button"
                className="task-action-edit"
                onClick={() => setEditingTaskId(task.id)}
                disabled={isDeleting}
              >
                Edit
              </button>

              <button
                type="button"
                className="task-action-delete"
                onClick={() => deleteTask(task)}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </>
      )}
    </article>
  );
}

export default DraggableTask;
