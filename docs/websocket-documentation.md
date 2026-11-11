
# JulleyOnline — WebSocket and Real-Time Collaboration Documentation

## 1. Overview

JulleyOnline uses **Socket.IO** to provide real-time collaboration within tenant-specific Kanban workspaces.

Socket.IO enables connected users to receive task updates, online-presence information, and workspace-access revocation notifications without manually refreshing their browsers.

The application combines:

- **REST APIs** for task creation, editing, movement, deletion, and retrieval.
- **Socket.IO** for real-time notifications.
- **PostgreSQL** for persistent application data.
- **JWT authentication** for authenticated socket connections.
- **Tenant membership checks** for real-time authorization.
- **Active socket revocation** when workspace memberships are removed.

The Socket.IO server runs alongside Express on the same HTTP server.

**Backend URL:** `http://localhost:5000`

**Frontend URL:** `http://localhost:5173`

---

## 2. Real-Time Architecture

The application uses the following communication flow:

```text
                React Frontend
                 localhost:5173
                       |
            +----------+----------+
            |                     |
         REST API              Socket.IO
            |                     |
            +----------+----------+
                       |
                 Express Server
                 localhost:5000
                       |
                    Prisma
                       |
                  PostgreSQL
                       |
         Users / Tenants / Memberships
         Boards / Columns / Tasks
```

### Data Synchronization Flow

1. A user authenticates through the REST API and receives a JWT.
2. The frontend establishes a Socket.IO connection using the JWT.
3. The backend authenticates the socket and loads the user.
4. The frontend requests access to a specific tenant room.
5. The backend checks the user's membership.
6. The socket joins the authorized room.
7. The backend performs another membership check after joining.
8. REST APIs persist task changes in PostgreSQL.
9. Socket.IO broadcasts notifications to authorized tenant-room connections.
10. Connected frontend clients fetch the latest task data.

**PostgreSQL is the authoritative source of task state.** Socket.IO is used to notify clients that data has changed.

---

## 3. Client Connection

The frontend Socket.IO service is located at:

`frontend/src/services/socket.js`

The client connects using JWT authentication.

Representative configuration:

```javascript
socket = io("http://localhost:5000", {
  auth: {
    token
  },
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000
});
```

The client reuses its Socket.IO instance where possible.

If the stored authentication token changes, the socket service can disconnect the previous connection and establish another authenticated connection.

---

## 4. Socket.IO Authentication

Every Socket.IO connection passes through backend authentication middleware.

The frontend provides the JWT during the Socket.IO handshake:

```javascript
auth: {
  token: sessionStorage.getItem("token")
}
```

### Backend Authentication Process

1. Read the JWT from `socket.handshake.auth.token`.
2. Verify the token using `JWT_SECRET`.
3. Restrict JWT verification to the `HS256` algorithm.
4. Extract the authenticated user's ID.
5. Retrieve the user from PostgreSQL.
6. Attach the user record to the socket.
7. Allow the connection only after successful authentication.

Example:

```javascript
const decoded = jwt.verify(
  token,
  process.env.JWT_SECRET,
  {
    algorithms: ["HS256"]
  }
);
```

### Authentication Errors

Possible errors include:

- `Authentication token required`
- `Invalid authentication token`
- `Invalid or expired authentication token`
- `User not found`

The client receives connection authentication failures through:

`connect_error`

A successful JWT handshake does not automatically grant access to every tenant. Tenant authorization is performed separately.

---

## 5. Tenant-Specific Rooms

Each tenant has a Socket.IO room using the naming convention:

`tenant:<TENANT_UUID>`

Example:

```text
tenant:b1941adf-7262-4fe6-9bea-7439ae3b5cd4
```

Tenant-specific rooms ensure task notifications are delivered only to connected sockets that have joined the corresponding workspace.

### Tenant Authorization

The backend checks whether the connected user has either:

1. An `ORG_ADMIN` membership in the tenant's organization, with `tenantId = null`.
2. A `TENANT_ADMIN` or `MEMBER` membership for the requested tenant.

If neither membership exists, the server rejects the join request.

Knowing a tenant UUID alone is insufficient to join its room.

### Additional Membership Verification

The backend performs another membership query after the socket joins the room.

If the user's membership has been removed:

- The server removes the socket from the room.
- The online presence list is updated.
- The join acknowledgement reports an authorization failure.

This additional check reduces the risk of an unauthorized room join when membership changes during the initial authorization process.

**Limitation:** Two separate authorization checks do not provide an atomic guarantee against all concurrent joins and membership removals.

---

## 6. Client-to-Server Events

### 6.1 `tenant:join`

**Direction:** Client → Server

**Purpose:** Request access to a tenant's Socket.IO room.

Payload:

```json
{
  "tenantId": "<TENANT_UUID>"
}
```

The server validates the tenant identifier, checks that the tenant exists, and verifies organization or tenant membership.

Successful acknowledgement:

```json
{
  "success": true,
  "message": "Joined tenant room successfully",
  "tenantId": "<TENANT_UUID>"
}
```

Unauthorized acknowledgement:

```json
{
  "success": false,
  "message": "Access denied to this tenant"
}
```

Other possible failures include:

- `Valid tenant ID is required`
- `Tenant not found`
- `Unable to join tenant room`

The frontend uses an acknowledgement callback:

```javascript
socket.emit(
  "tenant:join",
  { tenantId },
  (response) => {
    if (response?.success) {
      setSocketConnected(true);
    } else {
      setSocketConnected(false);
    }
  }
);
```

The Kanban interface displays **Live collaboration active** after a successful tenant-join acknowledgement.

### 6.2 `tenant:leave`

**Direction:** Client → Server

**Purpose:** Leave a tenant room.

Payload:

```json
{
  "tenantId": "<TENANT_UUID>"
}
```

Successful acknowledgement:

```json
{
  "success": true,
  "message": "Left tenant room successfully"
}
```

The backend calls:

```javascript
await socket.leave(`tenant:${tenantId}`);
```

**Current limitation:** Explicit tenant-room departure does not immediately trigger a presence broadcast in the current handler. Presence is refreshed following other supported events, such as joins and disconnects.

---

## 7. Server-to-Client Task Events

Task events are broadcast to:

`tenant:<TENANT_UUID>`

Events notify connected users that task data has changed.

### 7.1 `task:created`

**Direction:** Server → Client

**Triggered by:** Successful task creation.

Example payload:

```json
{
  "tenantId": "<TENANT_UUID>",
  "boardId": "<BOARD_UUID>",
  "task": {
    "id": "<TASK_UUID>",
    "title": "Implement login page",
    "columnId": "<COLUMN_UUID>",
    "position": 0,
    "version": 1
  }
}
```

The actual `task` object may contain additional fields from the database record.

### 7.2 `task:updated`

**Direction:** Server → Client

**Triggered by:** Successful task editing.

Example payload:

```json
{
  "tenantId": "<TENANT_UUID>",
  "boardId": "<BOARD_UUID>",
  "task": {
    "id": "<TASK_UUID>",
    "title": "Implement JWT login",
    "version": 2
  }
}
```

Rejected updates involving stale task versions do not generate successful update notifications.

### 7.3 `task:moved`

**Direction:** Server → Client

**Triggered by:** Successful task movement or reordering.

Example payload:

```json
{
  "tenantId": "<TENANT_UUID>",
  "boardId": "<BOARD_UUID>",
  "task": {
    "id": "<TASK_UUID>",
    "columnId": "<DESTINATION_COLUMN_UUID>",
    "position": 1,
    "version": 3
  }
}
```

Task movement can affect the positions and versions of multiple tasks.

Therefore, connected clients refresh their task lists rather than relying only on the moved-task payload.

### 7.4 `task:deleted`

**Direction:** Server → Client

**Triggered by:** Successful task deletion.

Example payload:

```json
{
  "tenantId": "<TENANT_UUID>",
  "boardId": "<BOARD_UUID>",
  "taskId": "<TASK_UUID>"
}
```

Clients fetch the latest board data to reflect the deletion.

---

## 8. Online Presence Tracking

### 8.1 `presence:updated`

**Direction:** Server → Client

**Purpose:** Notify workspace users about currently connected participants.

Example payload:

```json
{
  "tenantId": "<TENANT_UUID>",
  "users": [
    {
      "id": "<USER_UUID_1>",
      "name": "Example User"
    },
    {
      "id": "<USER_UUID_2>",
      "name": "Another User"
    }
  ],
  "count": 2
}
```

### Presence Calculation

The backend:

1. Retrieves sockets connected to the tenant room.
2. Reads authenticated user information.
3. Deduplicates users using their IDs.
4. Broadcasts the updated online-user list.

A user with multiple browser tabs is counted only once in the online presence list.

Presence information is derived from Socket.IO connections rather than stored in PostgreSQL.

### Presence After Disconnection

The backend registers a `disconnecting` handler.

It captures the tenant rooms before Socket.IO removes the socket, then recalculates presence after the disconnection.

The frontend clears its displayed online-user list when the socket disconnects.

### Presence After Membership Removal

After a workspace membership is deleted, the revocation helper removes matching active sockets from the affected tenant room.

The backend then broadcasts an updated presence list.

This prevents the removed user's connections from continuing to appear as active participants in that room under the tested removal flow.

---

## 9. Real-Time Workspace Access Revocation

### 9.1 Overview

JulleyOnline supports revoking active Socket.IO workspace access when an administrator removes a user's tenant membership.

Previously, membership validation occurred during room joining, so an already-connected user could remain in the tenant room after their membership was deleted.

The current implementation addresses the normal removal flow by revoking active room membership.

### 9.2 Revocation Trigger

The revocation process begins when an administrator uses:

**DELETE** `/api/tenants/:tenantId/members/:membershipId`

The API:

1. Authenticates the administrator.
2. Checks their tenant-specific permissions.
3. Validates the membership being removed.
4. Deletes the membership from PostgreSQL.
5. Calls the registered Socket.IO revocation helper.

The helper is registered through the Express application:

```javascript
app.set(
  "revokeTenantMemberSockets",
  revokeTenantMemberSockets
);
```

The member-management route retrieves it using:

```javascript
const revokeTenantMemberSockets = req.app.get(
  "revokeTenantMemberSockets"
);
```

### 9.3 Socket Revocation Process

For the affected user and tenant, the helper:

1. Identifies active matching Socket.IO connections on the current server.
2. Checks whether those sockets belong to the tenant room.
3. Removes matching sockets from that room.
4. Emits `tenant:access-revoked` to the matching sockets.
5. Updates the tenant's online presence list.

The helper revokes access only to the specified tenant room.

Other tenant memberships and the user's overall authenticated session are not automatically removed.

### 9.4 `tenant:access-revoked`

**Direction:** Server → Client

**Triggered by:** Successful workspace membership removal followed by the socket-revocation helper.

Example payload:

```json
{
  "tenantId": "<TENANT_UUID>",
  "message": "Your access to this workspace has been removed."
}
```

### 9.5 Frontend Handling

The Kanban page listens for the event:

```javascript
socket.on(
  "tenant:access-revoked",
  handleAccessRevoked
);
```

When the event matches the currently selected tenant, the frontend:

1. Marks the current workspace connection as revoked.
2. Clears the displayed online-user list.
3. Removes `tenantId` from session storage.
4. Removes `boardId` from session storage.
5. Displays an access-revoked alert.
6. Redirects the user to `/tenants`.

Example:

```javascript
const handleAccessRevoked = (data) => {
  if (data?.tenantId !== tenantId) return;

  sessionStorage.removeItem("tenantId");
  sessionStorage.removeItem("boardId");

  window.alert(
    data.message ||
      "Your access to this workspace has been removed."
  );

  navigate("/tenants", { replace: true });
};
```

The production component also maintains effect-lifecycle and revocation guards to avoid handling events after cleanup or processing the same revocation repeatedly.

### 9.6 End-to-End Revocation Flow

```text
        ORG_ADMIN / TENANT_ADMIN
                  |
                  v
          Manage Members Page
                  |
                  v
          Remove Member Action
                  |
                  v
       DELETE /api/tenants/.../members/...
                  |
                  v
          Membership Deleted
             PostgreSQL
                  |
                  v
       Socket Revocation Helper
                  |
                  v
       Remove User From Tenant Room
                  |
                  v
        tenant:access-revoked
                  |
                  v
        Member's Kanban Browser
                  |
                  v
          Show Access Alert
                  |
                  v
       Clear Tenant and Board IDs
                  |
                  v
         Redirect to /tenants
```

### 9.7 Important Limitations

- Revocation currently targets sockets connected to the local Socket.IO server.
- Multi-server deployments require distributed socket coordination.
- Membership deletion and socket revocation are separate operations.
- A revocation-helper failure is logged but does not undo a committed membership deletion.
- The frontend revocation listener is currently implemented in the Kanban page.
- Additional authorization checks reduce but do not eliminate every concurrent room-join and membership-removal race.
- Active socket JWT expiration is not independently rechecked on every event.

These limitations should be considered before production deployment.

---

## 10. Frontend Event Handling

The Kanban page registers Socket.IO event listeners in a React `useEffect`.

Relevant handlers include:

```javascript
socket.on("connect", joinTenant);
socket.on("disconnect", handleDisconnect);
socket.on("connect_error", handleConnectError);

socket.on("task:created", handleTaskChange);
socket.on("task:updated", handleTaskChange);
socket.on("task:moved", handleTaskChange);
socket.on("task:deleted", handleTaskChange);

socket.on("presence:updated", handlePresenceUpdate);

socket.on(
  "tenant:access-revoked",
  handleAccessRevoked
);
```

### Task Synchronization

When a task event is received, the client requests the latest task list through the REST API.

This reduces the risk of maintaining incomplete or outdated board state after concurrent changes.

### Tenant Join Acknowledgement

The frontend checks the acknowledgement from `tenant:join`.

If authorization succeeds, the frontend enables the live-collaboration status.

If access is denied because membership no longer exists, the Kanban page handles the loss of workspace access.

### Listener Cleanup

When the Kanban component unmounts, the relevant listeners are removed using `socket.off()`.

The component also sends `tenant:leave` when the socket remains connected.

This prevents the page's old listeners from continuing to update React state after navigation.

---

## 11. Disconnection and Reconnection

The client enables automatic reconnection.

| Setting | Value |
|---|---|
| `reconnection` | `true` |
| `reconnectionAttempts` | `Infinity` |
| `reconnectionDelay` | `1000` milliseconds |

### When the Server Disconnects

1. Socket.IO detects the disconnected transport.
2. The frontend sets its connection status to disconnected.
3. Online presence is cleared.
4. The UI displays **Connecting...**
5. Socket.IO attempts to reconnect.

### When the Server Reconnects

1. The `connect` event fires.
2. The client sends `tenant:join`.
3. The backend checks current membership.
4. If permitted, the socket joins the room.
5. The frontend refreshes task data.
6. Presence information is refreshed.
7. Real-time collaboration resumes.

### Reconnection After Membership Removal

If a user loses their tenant membership while disconnected, a subsequent room-join request should fail authorization.

The Kanban frontend handles the tenant-access denial by clearing its workspace selection and redirecting the user.

---

## 12. Conflict Handling

Socket.IO broadcasts task-change notifications, while REST APIs control task mutations.

Task updates and movements use version numbers to prevent stale operations.

If a client submits an outdated version, the REST API returns:

**HTTP 409 Conflict**

The frontend can then refresh the latest task data.

For task editing, the form retains the version associated with the user's unsaved changes, preventing incoming real-time notifications from silently changing the version being edited.

Task movement also uses PostgreSQL transactions and locking to coordinate reordering.

Socket.IO task notifications are emitted after successful database mutations.

---

## 13. Tenant Isolation and Security

Real-time tenant isolation relies on:

- JWT authentication for Socket.IO connections.
- PostgreSQL user lookups.
- Organization and tenant membership checks.
- Tenant-specific room identifiers.
- Task notifications broadcast to the corresponding tenant room.
- An additional membership check after room joining.
- Active tenant-room revocation following membership deletion.

### Unauthorized Join Example

A MEMBER attempting to join a tenant without an authorized membership receives:

```json
{
  "success": false,
  "message": "Access denied to this tenant"
}
```

The frontend cannot grant itself access to another tenant merely by sending a different tenant ID.

The backend is responsible for enforcing authorization.

### Scope of Security Guarantees

The current design provides tenant-scoped access controls and supports immediate removal of active room memberships in the tested single-server workflow.

It does not claim atomic, race-free revocation under every concurrent request interleaving or distributed deployment configuration.

---

## 14. Verified Test Scenarios

The following scenarios were manually tested during development.

| Scenario | Result |
|---|---|
| Task creation propagates to another client | Passed |
| Task editing propagates to another client | Passed |
| Task movement propagates to another client | Passed |
| Task deletion propagates to another client | Passed |
| Two connected users appear in presence list | Passed |
| Disconnected user disappears from presence list | Passed |
| Reconnected user reappears | Passed |
| Backend disconnection updates connection indicator | Passed |
| Automatic connection recovery after backend restart | Passed |
| Real-time synchronization resumes after reconnection | Passed |
| Unauthorized tenant room join is rejected | Passed |
| Temporary test connection disconnects successfully | Passed |
| Connected member removed by administrator | Passed |
| Removed member redirected without manual refresh | Passed |
| Removed workspace no longer appears in accessible tenant list | Passed |
| Kanban still loads after additional room-join check | Passed |

### Membership Revocation Test

The real-time revocation test used two separate authenticated browser sessions.

**Administrator session:**

- Opened Development Team.
- Navigated to Manage Members.
- Removed the registered test member.

**Member session:**

- Had the Development Sprint Board open.
- Was connected to live collaboration.
- Received the workspace-access revocation flow.
- Navigated to the Tenants page without manual refresh.
- Could no longer see the removed workspace in the authorized tenant list.

This confirmed that the basic single-server membership-revocation flow worked in the tested scenario.

These are manual development tests, not an exhaustive concurrency, security, or load-testing assessment.

---

## 15. Limitations and Future Improvements

### Presence Accuracy

Explicit `tenant:leave` operations do not currently broadcast updated presence immediately.

### Concurrent Tenant Joining

A second membership check reduces the possibility that a removed user retains room access during concurrent authorization changes.

A strict guarantee would require stronger coordination between room joins and membership deletion.

### Frontend Revocation Coverage

The Kanban page handles `tenant:access-revoked`.

Other frontend pages do not yet have a centralized listener for immediate membership-change notifications.

### Socket Authentication Lifetime

JWT authentication is verified when the Socket.IO connection is established.

Automatic JWT refresh and continuous token-expiration enforcement are not implemented.

### Multi-Server Scaling

The application currently uses a single Socket.IO server and in-memory presence information.

Horizontal scaling requires a shared adapter and coordinated socket revocation.

### Missed Events

Socket.IO events are not persisted as an event stream.

After reconnection, the client fetches current task data from PostgreSQL.

### Database and Socket Consistency

Membership deletion and socket revocation are separate steps.

If socket revocation fails, the deletion remains committed, but existing connections might require reconnection or additional enforcement to lose access.

### Ordering Concurrency

Further stress testing is needed for simultaneous task movements and high-concurrency workloads.

---

## 16. Conclusion

JulleyOnline uses JWT-authenticated Socket.IO connections, tenant-authorized rooms, real-time task notifications, and online presence tracking to support collaborative Kanban workflows.

The current implementation also supports immediate workspace-room revocation when an administrator removes a member and provides frontend handling for lost workspace access.

REST APIs remain responsible for persistent changes, while PostgreSQL serves as the authoritative source of task and membership state.

The design demonstrates multi-tenant real-time collaboration while documenting the limitations of its current single-server implementation.
