
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ActivityHistory.css";

const API_URL = "http://localhost:5000";

export default function ActivityHistory() {
  const navigate = useNavigate();

  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadActivities() {
      const token = sessionStorage.getItem("token");
      const tenantId = sessionStorage.getItem("tenantId");

      if (!token) {
        navigate("/login");
        return;
      }

      if (!tenantId) {
        navigate("/tenants");
        return;
      }

      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${API_URL}/api/tenants/${tenantId}/activities`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || "Failed to load activity history"
          );
        }

        const records = Array.isArray(data)
          ? data
          : data.activities || data.logs || [];

        setActivities(
          Array.isArray(records) ? records : []
        );
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadActivities();

    return () => controller.abort();
  }, [navigate]);

  function formatDate(date) {
    if (!date) return "Unknown date";

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return "Unknown date";
    }

    return parsed.toLocaleString();
  }

  function parseDetails(details) {
    if (!details) return {};

    if (typeof details === "string") {
      try {
        const parsed = JSON.parse(details);

        return parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
          ? parsed
          : {};
      } catch {
        return {};
      }
    }

    if (
      typeof details === "object" &&
      !Array.isArray(details)
    ) {
      return details;
    }

    return {};
  }

  function getTitleFromDetails(activity) {
    const details = parseDetails(activity.details);

    if (
      typeof details.title === "string" &&
      details.title.trim()
    ) {
      return details.title.trim();
    }

    if (
      typeof details.taskTitle === "string" &&
      details.taskTitle.trim()
    ) {
      return details.taskTitle.trim();
    }

    const changes = details.changes;

    if (changes && typeof changes === "object") {
      if (
        typeof changes.title === "string" &&
        changes.title.trim()
      ) {
        return changes.title.trim();
      }

      if (
        changes.title &&
        typeof changes.title === "object"
      ) {
        const newTitle =
          changes.title.new ??
          changes.title.to ??
          changes.title.after;

        if (
          typeof newTitle === "string" &&
          newTitle.trim()
        ) {
          return newTitle.trim();
        }
      }
    }

    return null;
  }

  // Build a title lookup from all available activity logs.
  // This helps when an update changes only the description.
  const taskTitleLookup = new Map();

  const chronologicalActivities = [...activities].sort(
    (a, b) =>
      new Date(a.createdAt || 0).getTime() -
      new Date(b.createdAt || 0).getTime()
  );

  chronologicalActivities.forEach((activity) => {
    if (!activity.entityId) return;

    const title = getTitleFromDetails(activity);

    if (title) {
      taskTitleLookup.set(activity.entityId, title);
    }
  });

  function getTaskName(activity) {
    const directTitle = getTitleFromDetails(activity);

    if (directTitle) {
      return directTitle;
    }

    if (
      activity.entityId &&
      taskTitleLookup.has(activity.entityId)
    ) {
      return taskTitleLookup.get(activity.entityId);
    }

    return activity.entityId || "Unknown task";
  }

  function getActionType(action) {
    const value = String(action || "").toLowerCase();

    if (
      value.includes("creat") ||
      value.includes("add")
    ) {
      return "created";
    }

    if (
      value.includes("delet") ||
      value.includes("remov")
    ) {
      return "deleted";
    }

    if (
      value.includes("mov") ||
      value.includes("reorder")
    ) {
      return "moved";
    }

    if (
      value.includes("updat") ||
      value.includes("edit")
    ) {
      return "updated";
    }

    return "default";
  }

  function getActionLabel(action) {
    if (!action) return "Activity recorded";

    return String(action)
      .replace(/_/g, " ")
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (letter) =>
        letter.toUpperCase()
      );
  }

  function getActionIcon(type) {
    switch (type) {
      case "created":
        return "+";

      case "updated":
        return "✎";

      case "deleted":
        return "×";

      case "moved":
        return "↗";

      default:
        return "•";
    }
  }

  function getUserName(activity) {
    return (
      activity.user?.name ||
      activity.userId ||
      "Unknown user"
    );
  }

  return (
    <main className="activity-page">
      <header className="activity-header">
        <div className="activity-header-content">
          <span className="activity-eyebrow">
            WORKSPACE / ACTIVITY
          </span>

          <h1>Activity History</h1>

          <p>
            Track task creation, updates, deletions,
            and movements across your current workspace.
          </p>
        </div>

        <button
          type="button"
          className="activity-back-button"
          onClick={() => navigate("/kanban")}
        >
          ← Back to Kanban Board
        </button>
      </header>

      <section className="activity-content">
        <div className="activity-section-heading">
          <div>
            <span className="activity-eyebrow">
              AUDIT TRAIL
            </span>

            <h2>Recent Activity</h2>

            <p>
              A history of changes made within
              your workspace.
            </p>
          </div>

          {!loading && !error && (
            <span className="activity-count">
              {activities.length}{" "}
              {activities.length === 1
                ? "Activity"
                : "Activities"}
            </span>
          )}
        </div>

        {loading && (
          <div className="activity-state">
            <div className="activity-loading-spinner" />

            <p>Loading activity history...</p>
          </div>
        )}

        {error && (
          <div
            className="activity-error"
            role="alert"
          >
            <strong>
              Unable to load activity history
            </strong>

            <p>{error}</p>
          </div>
        )}

        {!loading &&
          !error &&
          activities.length === 0 && (
            <div className="activity-empty">
              <div className="activity-empty-icon">
                ◷
              </div>

              <h3>No Activity Yet</h3>

              <p>
                Task changes will appear here
                as your team collaborates
                on the Kanban board.
              </p>

              <button
                type="button"
                className="activity-empty-button"
                onClick={() => navigate("/kanban")}
              >
                Go to Kanban Board →
              </button>
            </div>
          )}

        {!loading &&
          !error &&
          activities.length > 0 && (
            <div className="activity-timeline">
              {activities.map((activity) => {
                const actionType = getActionType(
                  activity.action
                );

                return (
                  <article
                    key={activity.id}
                    className="activity-item"
                  >
                    <div className="activity-timeline-marker">
                      <div
                        className={`activity-marker-icon activity-marker-${actionType}`}
                      >
                        {getActionIcon(actionType)}
                      </div>
                    </div>

                    <div className="activity-item-card">
                      <div className="activity-item-top">
                        <span
                          className={`activity-action-badge activity-action-${actionType}`}
                        >
                          {getActionLabel(
                            activity.action
                          )}
                        </span>

                        <time
                          className="activity-timestamp"
                          dateTime={
                            activity.createdAt ||
                            undefined
                          }
                        >
                          {formatDate(
                            activity.createdAt
                          )}
                        </time>
                      </div>

                      <div className="activity-item-body">
                        <h3>
                          {getTaskName(activity)}
                        </h3>

                        <p>
                          Activity recorded in your
                          workspace.
                        </p>
                      </div>

                      <div className="activity-item-footer">
                        <div className="activity-user">
                          <span className="activity-user-avatar">
                            {String(
                              getUserName(activity)
                            )
                              .charAt(0)
                              .toUpperCase()}
                          </span>

                          <div className="activity-user-info">
                            <span className="activity-user-label">
                              PERFORMED BY
                            </span>

                            <span className="activity-user-name">
                              {getUserName(activity)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
      </section>
    </main>
  );
}
