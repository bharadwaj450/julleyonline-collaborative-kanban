
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./Login.css";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await fetch(
        "http://localhost:5000/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email,
            password
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Login failed"
        );
      }

      // Store JWT for authenticated API requests.
      sessionStorage.setItem("token", data.token);

      // Clear any previously selected workspace.
      sessionStorage.removeItem("organizationId");
      sessionStorage.removeItem("tenantId");
      sessionStorage.removeItem("boardId");

      navigate("/organizations");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <div className="login-brand-top">
          <div className="login-brand-logo">
            <span className="login-logo-icon">
              J
            </span>

            <span>JulleyOnline</span>
          </div>
        </div>

        <div className="login-brand-content">
          <span className="login-brand-eyebrow">
            COLLABORATIVE WORK MANAGEMENT
          </span>

          <h1>
            Bring your team
            <br />
            together.
            <br />
            <span>Get more done.</span>
          </h1>

          <p>
            A powerful collaborative workspace
            to organize tasks, manage projects,
            and keep everyone moving forward.
          </p>

          <div className="login-feature-list">
            <div className="login-feature">
              <span className="login-feature-icon">
                ✓
              </span>
              <span>Organize projects with Kanban boards</span>
            </div>

            <div className="login-feature">
              <span className="login-feature-icon">
                ✓
              </span>
              <span>Collaborate with your team in real time</span>
            </div>

            <div className="login-feature">
              <span className="login-feature-icon">
                ✓
              </span>
              <span>Manage workspaces and permissions</span>
            </div>
          </div>
        </div>

        <div className="login-brand-footer">
          © {new Date().getFullYear()} JulleyOnline.
          Built for better teamwork.
        </div>
      </section>

      <section className="login-form-panel">
        <div className="login-mobile-brand">
          <span className="login-logo-icon">
            J
          </span>

          <span>JulleyOnline</span>
        </div>

        <div className="login-card">
          <div className="login-card-header">
            <span className="login-card-eyebrow">
              WELCOME BACK
            </span>

            <h2>Sign in to your account</h2>

            <p>
              Enter your credentials to access
              your workspace.
            </p>
          </div>

          <form
            className="login-form"
            onSubmit={handleSubmit}
          >
            <div className="login-field">
              <label htmlFor="email">
                Email Address
              </label>

              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                placeholder="Enter your email address"
                autoComplete="email"
                required
              />
            </div>

            <div className="login-field">
              <label htmlFor="password">
                Password
              </label>

              <div className="login-password-wrapper">
                <input
                  id="password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />

                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() =>
                    setShowPassword(!showPassword)
                  }
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && (
              <p
                className="login-error"
                role="alert"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              className="login-submit-button"
              disabled={loading}
            >
              {loading
                ? "Signing in..."
                : "Sign In →"}
            </button>
          </form>

          <div className="login-register-section">
            <p>
              Don't have an account?{" "}
              <Link to="/register">
                Create an account
              </Link>
            </p>
          </div>
        </div>

        <p className="login-form-footer">
          Secure access to your collaborative workspace
        </p>
      </section>
    </main>
  );
}

export default Login;
