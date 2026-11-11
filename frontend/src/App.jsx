
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate
} from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Organizations from "./pages/Organizations";
import Tenants from "./pages/Tenants";
import Boards from "./pages/Boards";
import Kanban from "./pages/Kanban";
import ActivityHistory from "./pages/ActivityHistory";
import ManageMembers from "./pages/ManageMembers";

import "./App.css";

// Only logged-out users can access login and register.
function GuestRoute({ children }) {
  const token = sessionStorage.getItem("token");

  if (token) {
    return <Navigate to="/organizations" replace />;
  }

  return children;
}

// Only logged-in users can access protected pages.
function ProtectedRoute({ children }) {
  const token = sessionStorage.getItem("token");

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function HomeRedirect() {
  const token = sessionStorage.getItem("token");

  return (
    <Navigate
      to={token ? "/organizations" : "/login"}
      replace
    />
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<HomeRedirect />}
        />

        <Route
          path="/login"
          element={
            <GuestRoute>
              <Login />
            </GuestRoute>
          }
        />

        <Route
          path="/register"
          element={
            <GuestRoute>
              <Register />
            </GuestRoute>
          }
        />

        <Route
          path="/organizations"
          element={
            <ProtectedRoute>
              <Organizations />
            </ProtectedRoute>
          }
        />

        <Route
          path="/tenants"
          element={
            <ProtectedRoute>
              <Tenants />
            </ProtectedRoute>
          }
        />

        <Route
          path="/boards"
          element={
            <ProtectedRoute>
              <Boards />
            </ProtectedRoute>
          }
        />

        <Route
          path="/kanban"
          element={
            <ProtectedRoute>
              <Kanban />
            </ProtectedRoute>
          }
        />

        <Route
          path="/activity-history"
          element={
            <ProtectedRoute>
              <ActivityHistory />
            </ProtectedRoute>
          }
        />

        <Route
          path="/manage-members"
          element={
            <ProtectedRoute>
              <ManageMembers />
            </ProtectedRoute>
          }
        />

        <Route
          path="*"
          element={<HomeRedirect />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
