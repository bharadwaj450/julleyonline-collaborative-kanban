
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProfilePanel from "../components/ProfilePanel";
import "./Organizations.css";

function Organizations() {
  const navigate = useNavigate();

  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        const token = sessionStorage.getItem("token");

        if (!token) {
          navigate("/login", { replace: true });
          return;
        }

        const response = await fetch(
          "http://localhost:5000/api/organizations",
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || "Failed to fetch organizations"
          );
        }

        setOrganizations(data.organizations || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchOrganizations();
  }, [navigate]);

  const selectOrganization = (organizationId) => {
    sessionStorage.setItem(
      "organizationId",
      organizationId
    );

    navigate("/tenants");
  };

  return (
    <main className="organizations-page">
      <header className="organizations-header">
        <div className="organizations-header-content">
          <span className="organizations-eyebrow">
            WORKSPACE / ORGANIZATIONS
          </span>

          <h1>Your Organizations</h1>

          <p>
            Select an organization to access your teams,
            project boards, and collaborative workspace.
          </p>
        </div>
        <ProfilePanel />
      </header>

      <section className="organizations-content">
        <div className="organizations-section-heading">
          <div>
            <span className="organizations-eyebrow">
              YOUR ACCOUNT
            </span>

            <h2>Available Organizations</h2>

            <p>
              Choose the organization you want to work with.
            </p>
          </div>

          {!loading && !error && (
            <span className="organizations-count">
              {organizations.length}{" "}
              {organizations.length === 1
                ? "Organization"
                : "Organizations"}
            </span>
          )}
        </div>

        {loading && (
          <div className="organizations-loading">
            <div className="organizations-loading-icon">
              ◌
            </div>

            <p>Loading your organizations...</p>
          </div>
        )}

        {error && (
          <p
            className="organizations-error"
            role="alert"
          >
            {error}
          </p>
        )}

        {!loading &&
          !error &&
          organizations.length === 0 && (
            <div className="organizations-empty">
              <div className="organizations-empty-icon">
                ▦
              </div>

              <h3>No Organizations Available</h3>

              <p>
                You don't belong to any organizations yet.
                Contact your administrator to get access.
              </p>
            </div>
          )}

        {!loading &&
          !error &&
          organizations.length > 0 && (
            <div className="organizations-grid">
              {organizations.map((organization) => (
                <article
                  key={organization.id}
                  className="organizations-card"
                >
                  <div className="organizations-card-top">
                    <div className="organizations-card-icon">
                      <svg
                        width="25"
                        height="25"
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
                        <path d="M8 21V7" />
                        <path d="M13 7h4" />
                        <path d="M13 11h4" />
                        <path d="M13 15h4" />
                      </svg>
                    </div>

                    <span className="organizations-card-label">
                      ORGANIZATION
                    </span>
                  </div>

                  <div className="organizations-card-body">
                    <h3>{organization.name}</h3>

                    <p>
                      Access your team workspaces,
                      manage project boards, and collaborate
                      across your organization.
                    </p>
                  </div>

                  <div className="organizations-card-footer">
                    <span className="organizations-status">
                      <span className="organizations-status-dot" />
                      Available
                    </span>

                    <button
                      type="button"
                      className="organizations-select-button"
                      onClick={() =>
                        selectOrganization(
                          organization.id
                        )
                      }
                    >
                      Open Organization →
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

export default Organizations;
