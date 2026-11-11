
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProfilePanel from "../components/ProfilePanel";
import "./Tenants.css";

function Tenants() {
  const navigate = useNavigate();

  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchTenants = async () => {
      try {
        const token = sessionStorage.getItem("token");
        const organizationId = sessionStorage.getItem("organizationId");

        if (!token) {
          navigate("/login", { replace: true });
          return;
        }

        if (!organizationId) {
          navigate("/organizations", { replace: true });
          return;
        }

        const response = await fetch(
          `http://localhost:5000/api/tenants?organizationId=${encodeURIComponent(organizationId)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to fetch tenants");
        }

        setTenants(data.tenants || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTenants();
  }, [navigate]);

  const selectTenant = (tenantId) => {
    sessionStorage.setItem("tenantId", tenantId);
    navigate("/boards");
  };

  return (
    <main className="tenants-page">
      <header className="tenants-header">
        <div className="tenants-header-content">
          <span className="tenants-eyebrow">
            WORKSPACE / TEAMS
          </span>

          <h1>Select Your Workspace</h1>

          <p>
            Choose a team workspace to access its boards,
            manage tasks, and collaborate with your team.
          </p>
        </div>

<div className="tenants-header-actions">
  <button
    type="button"
    className="tenants-back-button"
    onClick={() => navigate("/organizations")}
  >
    ← Back to Organizations
  </button>

  <ProfilePanel />
</div>
      </header>

      <section className="tenants-content">
        <div className="tenants-section-heading">
          <div>
            <span className="tenants-eyebrow">
              YOUR ORGANIZATION
            </span>

            <h2>Available Workspaces</h2>

            <p>
              Select the workspace you want to work in.
            </p>
          </div>

          {!loading && !error && (
            <span className="tenants-count">
              {tenants.length}{" "}
              {tenants.length === 1
                ? "Workspace"
                : "Workspaces"}
            </span>
          )}
        </div>

        {loading && (
          <div className="tenants-loading">
            <div className="tenants-loading-icon">
              ◌
            </div>

            <p>Loading your workspaces...</p>
          </div>
        )}

        {error && (
          <p className="tenants-error" role="alert">
            {error}
          </p>
        )}

        {!loading && !error && tenants.length === 0 && (
          <div className="tenants-empty">
            <div className="tenants-empty-icon">
              ▦
            </div>

            <h3>No Workspaces Available</h3>

            <p>
              There are currently no team workspaces
              available in this organization.
            </p>
          </div>
        )}

        {!loading && !error && tenants.length > 0 && (
          <div className="tenants-grid">
            {tenants.map((tenant) => (
              <article
                key={tenant.id}
                className="tenants-card"
              >
                <div className="tenants-card-top">
                  <div className="tenants-card-icon">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect
                        x="3"
                        y="3"
                        width="18"
                        height="18"
                        rx="3"
                      />
                      <path d="M3 9h18" />
                      <path d="M9 9v12" />
                    </svg>
                  </div>

                  <span className="tenants-card-label">
                    TEAM WORKSPACE
                  </span>
                </div>

                <div className="tenants-card-body">
                  <h3>{tenant.name}</h3>

                  <p>
                    Access project boards, organize tasks,
                    and collaborate with your team.
                  </p>
                </div>

                <div className="tenants-card-footer">
                  <span className="tenants-active-status">
                    <span className="tenants-status-dot" />
                    Available
                  </span>

                  <button
                    type="button"
                    className="tenants-select-button"
                    onClick={() =>
                      selectTenant(tenant.id)
                    }
                  >
                    Open Workspace →
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default Tenants;
