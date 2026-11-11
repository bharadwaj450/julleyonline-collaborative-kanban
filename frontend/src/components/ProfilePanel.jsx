
import { useEffect, useRef, useState } from "react";
import "./ProfilePanel.css";

const API_URL = "http://localhost:5000";

function ProfilePanel({ role }) {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [userError, setUserError] = useState("");
  const panelRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
if (user || userError) return;
    const controller = new AbortController();

    const fetchUser = async () => {
      const token = sessionStorage.getItem("token");

      if (!token) {
        setUserError("Please log in again.");
        return;
      }

      try {
        setLoadingUser(true);

        const response = await fetch(`${API_URL}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Unable to load account details");
        }

        const data = await response.json();

        if (!data.user) {
          throw new Error("Account information unavailable");
        }

        setUser(data.user);
      } catch (error) {
        if (error.name !== "AbortError") {
          setUserError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingUser(false);
        }
      }
    };

    fetchUser();

    return () => controller.abort();
}, [user, userError]);
  const displayName = user?.name || "My Account";
  const displayEmail = user?.email || "";
  const displayRole = role?.replaceAll("_", " ") || "";

  const initials = user?.name
    ? user.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0))
        .join("")
        .toUpperCase()
    : "";

  const handleLogout = () => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("organizationId");
    sessionStorage.removeItem("tenantId");
    sessionStorage.removeItem("boardId");

    // Full navigation also closes active Socket.IO connections.
    window.location.replace("/login");
  };

  return (
    <div className="profile-wrapper" ref={panelRef}>
      <button
        type="button"
        className={`profile-avatar-button ${
          isOpen ? "profile-avatar-active" : ""
        }`}
        onClick={() => setIsOpen((previous) => !previous)}
        aria-label="Open profile"
        aria-expanded={isOpen}
        aria-controls="julley-profile-panel"
      >
        {initials}
      </button>

      {isOpen && (
        <div
          id="julley-profile-panel"
          className="profile-popup"
        >
          <div className="profile-popup-header">
            <span className="profile-popup-label">
              YOUR ACCOUNT
            </span>

            <button
              type="button"
              className="profile-close-button"
              onClick={() => setIsOpen(false)}
              aria-label="Close profile"
            >
              ×
            </button>
          </div>

          <div className="profile-account">
            <div className="profile-account-avatar">
              {initials}
            </div>

            <div className="profile-account-details">
              <strong>{displayName}</strong>

              {displayEmail && (
                <span className="profile-email">
                  {displayEmail}
                </span>
              )}

              {displayRole && (
                <span className="profile-role">
                  {displayRole}
                </span>
              )}
            </div>
          </div>

          {loadingUser && (
            <p className="profile-info-message">
              Loading account details...
            </p>
          )}

          {userError && (
            <p className="profile-info-message">
              {userError}
            </p>
          )}

          <div className="profile-popup-divider" />

          <button
            type="button"
            className="profile-logout"
            onClick={handleLogout}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5" />
              <path d="M21 12H9" />
            </svg>

            <span>Log out</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default ProfilePanel;
