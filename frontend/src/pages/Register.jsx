
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./Register.css";

function Register() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(
        "http://localhost:5000/api/auth/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name,
            email,
            password
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Registration failed"
        );
      }

      // Registration succeeded. User can now sign in.
      navigate("/login");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="register-page">
      <section className="register-brand-panel">
        <div className="register-brand-top">
          <div className="register-brand-logo">
            <span className="register-logo-icon">
              J
            </span>

            <span>JulleyOnline</span>
          </div>
        </div>

        <div className="register-brand-content">
          <span className="register-brand-eyebrow">
            COLLABORATIVE WORK MANAGEMENT
          </span>

          <h1>
            Better teamwork
            <br />
            starts here.
            <br />
            <span>Join JulleyOnline.</span>
          </h1>

          <p>
            Create your account and join a collaborative
            workspace designed to help teams organize
            projects and get work done together.
          </p>

          <div className="register-feature-list">
            <div className="register-feature">
              <span className="register-feature-icon">
                ✓
              </span>
              <span>
                Organize work with intuitive Kanban boards
              </span>
            </div>

            <div className="register-feature">
              <span className="register-feature-icon">
                ✓
              </span>
              <span>
                Collaborate with teammates in real time
              </span>
            </div>

            <div className="register-feature">
              <span className="register-feature-icon">
                ✓
              </span>
              <span>
                Stay aligned across projects and teams
              </span>
            </div>
          </div>
        </div>

        <div className="register-brand-footer">
          © {new Date().getFullYear()} JulleyOnline.
          Built for better teamwork.
        </div>
      </section>

      <section className="register-form-panel">
        <div className="register-mobile-brand">
          <span className="register-logo-icon">
            J
          </span>

          <span>JulleyOnline</span>
        </div>

        <div className="register-card">
          <div className="register-card-header">
            <span className="register-card-eyebrow">
              GET STARTED
            </span>

            <h2>Create your account</h2>

            <p>
              Enter your details to get started with
              JulleyOnline.
            </p>
          </div>

          <form
            className="register-form"
            onSubmit={handleSubmit}
          >
            <div className="register-field">
              <label htmlFor="name">
                Full Name
              </label>

              <input
                id="name"
                type="text"
                value={name}
                onChange={(event) =>
                  setName(event.target.value)
                }
                placeholder="Enter your full name"
                autoComplete="name"
                required
              />
            </div>

            <div className="register-field">
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

            <div className="register-field">
              <label htmlFor="password">
                Password
              </label>

              <div className="register-password-wrapper">
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
                  placeholder="Create a password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />

                <button
                  type="button"
                  className="register-password-toggle"
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

              <span className="register-password-hint">
                Password must contain at least 8 characters.
              </span>
            </div>

            {error && (
              <p
                className="register-error"
                role="alert"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              className="register-submit-button"
              disabled={loading}
            >
              {loading
                ? "Creating account..."
                : "Create Account →"}
            </button>
          </form>

          <div className="register-login-section">
            <p>
              Already have an account?{" "}
              <Link to="/login">
                Sign In
              </Link>
            </p>
          </div>
        </div>

        <p className="register-form-footer">
          Secure registration for your collaborative workspace
        </p>
      </section>
    </main>
  );
}

export default Register;
