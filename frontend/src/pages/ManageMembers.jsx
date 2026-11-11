
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ManageMembers.css";

const API_URL = "http://localhost:5000";

function ManageMembers() {
  const navigate = useNavigate();

  const [members, setMembers] = useState([]);
  const [role, setRole] = useState("");
  const [tenantName, setTenantName] = useState("Current Workspace");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("MEMBER");

  const [adding, setAdding] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState(null);
  const [removingMemberId, setRemovingMemberId] = useState(null);

  const token = sessionStorage.getItem("token");
  const tenantId = sessionStorage.getItem("tenantId");
  const organizationId = sessionStorage.getItem("organizationId");

  const canManageMembers =
    role === "ORG_ADMIN" || role === "TENANT_ADMIN";

  const isBusy =
    adding ||
    updatingMemberId !== null ||
    removingMemberId !== null;

  const fetchMembers = useCallback(
    async (signal) => {
      if (!token || !tenantId) return false;

      setLoading(true);
      setError("");

      const headers = {
        Authorization: `Bearer ${token}`,
      };

      try {
        const accessResponse = await fetch(
          `${API_URL}/api/tenants/${tenantId}/access-check`,
          { headers, signal }
        );

        const accessData = await accessResponse.json();

        if (!accessResponse.ok) {
          throw new Error(
            accessData.message || "Access verification failed"
          );
        }

        const currentRole = accessData.role;

        if (
          currentRole !== "ORG_ADMIN" &&
          currentRole !== "TENANT_ADMIN"
        ) {
          setMembers([]);
          setRole("");
          setError(
            "Access denied. Only administrators can manage members."
          );
          return false;
        }

        if (signal?.aborted) return false;

        setRole(currentRole);

        const membersResponse = await fetch(
          `${API_URL}/api/tenants/${tenantId}/members`,
          { headers, signal }
        );

        const membersData = await membersResponse.json();

        if (!membersResponse.ok) {
          throw new Error(
            membersData.message || "Failed to load members"
          );
        }

        if (signal?.aborted) return false;

        setMembers(membersData.members || []);

        if (organizationId) {
          const tenantsResponse = await fetch(
            `${API_URL}/api/tenants?organizationId=${encodeURIComponent(
              organizationId
            )}`,
            { headers, signal }
          );

          if (tenantsResponse.ok) {
            const tenantsData = await tenantsResponse.json();

            const selectedTenant = (
              tenantsData.tenants || []
            ).find((tenant) => tenant.id === tenantId);

            if (!signal?.aborted) {
              setTenantName(
                selectedTenant?.name || "Current Workspace"
              );
            }
          } else if (!signal?.aborted) {
            setTenantName("Current Workspace");
          }
        } else {
          setTenantName("Current Workspace");
        }

        return true;
      } catch (err) {
        if (err.name !== "AbortError" && !signal?.aborted) {
          setError(
            err.message || "Failed to load workspace members"
          );
        }

        return false;
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [token, tenantId, organizationId]
  );

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    if (!tenantId) {
      navigate("/tenants", { replace: true });
      return;
    }

    const controller = new AbortController();

    fetchMembers(controller.signal);

    return () => controller.abort();
  }, [token, tenantId, navigate, fetchMembers]);

  // ADD MEMBER
  const handleAddMember = async (event) => {
    event.preventDefault();

    if (!canManageMembers || isBusy) return;

    const normalizedEmail = memberEmail.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Please enter a registered user's email.");
      return;
    }

    if (
      memberRole === "TENANT_ADMIN" &&
      role !== "ORG_ADMIN"
    ) {
      setError(
        "Only organization administrators can assign tenant admins."
      );
      return;
    }

    setAdding(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `${API_URL}/api/tenants/${tenantId}/members`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: normalizedEmail,
            role: memberRole,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to add workspace member"
        );
      }

      setMemberEmail("");
      setMemberRole("MEMBER");

      const refreshed = await fetchMembers();

      if (refreshed) {
        setSuccess(
          `${data.member?.user?.name || "User"} added successfully!`
        );
      }
    } catch (err) {
      setError(err.message || "Unable to add member");
    } finally {
      setAdding(false);
    }
  };

  // CHANGE MEMBER ROLE
  const handleChangeRole = async (member, newRole) => {
    if (role !== "ORG_ADMIN" || isBusy) return;

    if (member.role === "ORG_ADMIN") return;
    if (member.role === newRole) return;

    const confirmed = window.confirm(
      `Change ${member.user.name}'s role from ` +
        `${member.role.replaceAll("_", " ")} to ` +
        `${newRole.replaceAll("_", " ")}?`
    );

    if (!confirmed) return;

    setUpdatingMemberId(member.id);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `${API_URL}/api/tenants/${tenantId}/members/${member.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            role: newRole,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to update member role"
        );
      }

      const refreshed = await fetchMembers();

      if (refreshed) {
        setSuccess(
          `${member.user.name}'s role updated to ` +
            `${newRole.replaceAll("_", " ")} successfully.`
        );
      }
    } catch (err) {
      setError(err.message || "Unable to update member role");
    } finally {
      setUpdatingMemberId(null);
    }
  };

  // REMOVE MEMBER
  const handleRemoveMember = async (member) => {
    if (!canManageMembers || isBusy) return;

    if (member.role === "ORG_ADMIN") return;

    if (
      role === "TENANT_ADMIN" &&
      member.role !== "MEMBER"
    ) {
      setError(
        "Tenant administrators can only remove regular members."
      );
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to remove ${member.user.name} ` +
        `(${member.user.email}) from ${tenantName}?\n\n` +
        "This removes workspace access but does not delete the user account."
    );

    if (!confirmed) return;

    setRemovingMemberId(member.id);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `${API_URL}/api/tenants/${tenantId}/members/${member.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to remove member"
        );
      }

      const refreshed = await fetchMembers();

      if (refreshed) {
        setSuccess(
          `${member.user.name} removed from the workspace successfully.`
        );
      }
    } catch (err) {
      setError(err.message || "Unable to remove member");
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handleRefresh = () => {
    if (isBusy || loading) return;

    setSuccess("");
    fetchMembers();
  };

  const canRemoveMember = (member) => {
    if (member.role === "ORG_ADMIN") return false;

    if (role === "ORG_ADMIN") return true;

    if (role === "TENANT_ADMIN") {
      return member.role === "MEMBER";
    }

    return false;
  };

  return (
    <main className="members-page">
      <header className="members-header">
        <div>
          <span className="members-eyebrow">
            WORKSPACE / ADMINISTRATION
          </span>

          <h1>Manage Members</h1>

          <p>
            Add workspace members and manage their permissions.
          </p>
        </div>

        <button
          type="button"
          className="members-back-button"
          onClick={() => navigate("/boards")}
        >
          ← Back to Boards
        </button>
      </header>

      {loading && (
        <div className="members-message">
          Loading workspace members...
        </div>
      )}

      {error && (
        <div className="members-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="members-success" role="status">
          {success}
        </div>
      )}

      {!loading && canManageMembers && (
        <>
          {/* ADD MEMBER */}
          <section className="members-add-panel">
            <div className="members-section-heading">
              <div className="members-section-icon">+</div>

              <div>
                <h2>Add Workspace Member</h2>

                <p>
                  Add an existing registered user to this workspace.
                </p>
              </div>
            </div>

            <form
              className="members-add-form"
              onSubmit={handleAddMember}
            >
              <div className="members-form-grid">
                <div className="members-field">
                  <label htmlFor="member-email">
                    Email Address
                  </label>

                  <input
                    id="member-email"
                    type="email"
                    placeholder="employee@example.com"
                    value={memberEmail}
                    onChange={(event) =>
                      setMemberEmail(event.target.value)
                    }
                    disabled={isBusy}
                    required
                  />
                </div>

                <div className="members-field">
                  <label htmlFor="member-role">
                    Workspace Role
                  </label>

                  <select
                    id="member-role"
                    value={memberRole}
                    onChange={(event) =>
                      setMemberRole(event.target.value)
                    }
                    disabled={isBusy}
                  >
                    <option value="MEMBER">
                      Member
                    </option>

                    {role === "ORG_ADMIN" && (
                      <option value="TENANT_ADMIN">
                        Tenant Admin
                      </option>
                    )}
                  </select>
                </div>
              </div>

              <div className="members-form-footer">
                <p>
                  The user must be registered before being added.
                </p>

                <button
                  type="submit"
                  className="members-primary-button"
                  disabled={isBusy}
                >
                  {adding
                    ? "Adding Member..."
                    : "+ Add Member"}
                </button>
              </div>
            </form>
          </section>

          {/* WORKSPACE MEMBERS TABLE */}
          <section className="members-panel">
            <div className="members-panel-header">
              <div>
                <h2>Workspace Members</h2>
                <p>{tenantName}</p>
              </div>

              <div className="members-header-actions">
                <span className="members-count">
                  {members.length}{" "}
                  {members.length === 1
                    ? "Member"
                    : "Members"}
                </span>

                <button
                  type="button"
                  className="members-back-button"
                  onClick={handleRefresh}
                  disabled={loading || isBusy}
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="members-table-wrapper">
              <table className="members-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td>{member.user.name}</td>

                      <td>{member.user.email}</td>

                      {/* ROLE COLUMN */}
                      <td>
                        {role === "ORG_ADMIN" &&
                        member.role !== "ORG_ADMIN" ? (
                          <select
                            className="members-role-select"
                            value={member.role}
                            disabled={isBusy}
                            onChange={(event) =>
                              handleChangeRole(
                                member,
                                event.target.value
                              )
                            }
                            aria-label={`Change role for ${member.user.name}`}
                          >
                            <option value="MEMBER">
                              Member
                            </option>

                            <option value="TENANT_ADMIN">
                              Tenant Admin
                            </option>
                          </select>
                        ) : (
                          <span className="members-role">
                            {member.role.replaceAll("_", " ")}
                          </span>
                        )}
                      </td>

                      {/* ACTIONS COLUMN */}
                      <td>
                        {canRemoveMember(member) ? (
                          <button
                            type="button"
                            className="members-remove-button"
                            disabled={isBusy}
                            onClick={() =>
                              handleRemoveMember(member)
                            }
                          >
                            {removingMemberId === member.id
                              ? "Removing..."
                              : "Remove"}
                          </button>
                        ) : (
                          <span className="members-no-action">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {members.length === 0 && (
                <p className="members-empty">
                  No workspace members found.
                </p>
              )}
            </div>

            <div className="members-current-role">
              Your role: {role.replaceAll("_", " ")}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export default ManageMembers;
