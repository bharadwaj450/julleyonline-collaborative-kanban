
# Collaborative Kanban Board

### Multi-Tenant Real-Time Collaboration Platform

A full-stack, multi-tenant collaborative Kanban application developed for the **JulleyOnline Forward Deployed Engineer Intern Assignment**.

The application enables organizations to manage workspaces, boards, workflow columns, tasks, and workspace memberships while supporting real-time synchronization, role-based access control, tenant isolation, activity tracking, and optimistic concurrency control.

---

## 1. Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React.js, Vite, React Router, JavaScript |
| Drag and Drop | dnd-kit |
| Backend | Node.js, Express.js |
| Real-Time Communication | Socket.IO |
| Database | PostgreSQL |
| ORM | Prisma 6 |
| Authentication | JSON Web Tokens (JWT), bcrypt |
| Validation | Zod |
| API Architecture | REST |
| Version Control | Git and GitHub |

---

## 2. Key Features

### Authentication

- User registration with input validation.
- Email and password login.
- Password hashing using bcrypt.
- JWT-based authentication.
- Protected backend REST endpoints.
- JWT authentication for Socket.IO connections.
- Frontend route guards for authenticated pages.
- Automatic redirection of authenticated users away from login and registration pages.

### User Profile and Logout

- Authenticated users can view their name and email through a profile panel.
- The profile panel is available on the Organizations, Tenants, and Boards pages.
- Tenant-specific user roles are displayed on the Boards page.
- Logout clears the local authentication session.
- Logged-out users are redirected to the login page.

### Multi-Tenant Architecture

The application follows this hierarchy:

**Organization → Tenant → Board → Column → Task**

Each organization can contain multiple independent tenants, representing teams or workspaces.

Features include:

- Organization creation.
- Tenant creation and selection.
- Membership-based workspace access.
- Tenant-scoped database queries.
- Backend authorization for workspace operations.
- Tenant-authorized Socket.IO rooms.
- Workspace-specific user membership management.

### Role-Based Access Control

The application supports three roles:

- **ORG_ADMIN:** Organization-wide administrator.
- **TENANT_ADMIN:** Administrator of an assigned tenant.
- **MEMBER:** Regular workspace participant.

#### Permission Matrix

| Capability | ORG_ADMIN | TENANT_ADMIN | MEMBER |
|---|---|---|---|
| View authorized tenants | Yes | Yes | Yes |
| Create tenants | Yes | No | No |
| View boards | Yes | Yes | Yes |
| Create, edit, delete boards | Yes | Yes | No |
| Create, rename, delete columns | Yes | Yes | No |
| Create tasks | Yes | Yes | Yes |
| Edit tasks | Yes | Yes | Yes |
| Move tasks | Yes | Yes | Yes |
| Delete tasks | Yes | Yes | Yes |
| View activity history | Yes | Yes | Yes |
| View workspace members | Yes | Yes | No |
| Add regular members | Yes | Yes | No |
| Assign tenant administrators | Yes | No | No |
| Change tenant member roles | Yes | No | No |
| Remove regular members | Yes | Yes | No |
| Remove tenant administrators | Yes | No | No |
| Remove organization administrators through tenant management | No | No | No |

Permissions are enforced by backend authorization middleware rather than relying only on frontend controls.

All operations are restricted to the user's authorized organization or tenant.

### Workspace Member Management

The application includes a dedicated **Manage Members** interface for workspace administrators.

Features include:

- View members of the selected workspace.
- Display member names, email addresses, and roles.
- Add an existing registered user to a workspace.
- Assign MEMBER roles.
- Allow organization administrators to assign TENANT_ADMIN roles.
- Promote or demote tenant members.
- Remove members from a workspace.
- Display confirmation before role changes and member removal.
- Automatically refresh membership information after successful changes.
- Display success and error messages.

#### Membership Security Rules

- A user must register before being added to a workspace.
- Organization administrators already possess organization-wide access.
- Only ORG_ADMIN may assign or change TENANT_ADMIN roles.
- TENANT_ADMIN may remove regular members but not other administrators.
- Administrators cannot remove their own memberships through the member-removal API.
- Organization-wide administrator memberships cannot be deleted through tenant member-management endpoints.
- Removing a membership does not delete the registered user account.

#### Member Management API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/tenants/:tenantId/members` | List workspace members |
| POST | `/api/tenants/:tenantId/members` | Add a registered user |
| PATCH | `/api/tenants/:tenantId/members/:membershipId` | Update member role |
| DELETE | `/api/tenants/:tenantId/members/:membershipId` | Remove workspace membership |

All endpoints require JWT authentication and appropriate workspace authorization.

### Kanban Board Management

- Create and manage boards.
- View boards within authorized tenants.
- Create workflow columns.
- Rename columns.
- Delete empty columns.
- Prevent deletion of columns containing tasks.

### Task Management

- Create tasks with titles and descriptions.
- Edit existing tasks.
- Delete tasks.
- Optionally assign tasks to authorized users through the API.
- Move tasks between columns.
- Reorder tasks using drag-and-drop.
- Persist task positions in PostgreSQL.
- Track task versions for concurrency control.

### Real-Time Collaboration

Socket.IO synchronizes task changes between connected users.

Supported events include:

- `task:created`
- `task:updated`
- `task:moved`
- `task:deleted`
- `presence:updated`
- `tenant:access-revoked`

Task events are restricted to authorized tenant rooms.

### Real-Time Workspace Access Revocation

When an administrator removes a member from a workspace:

1. The backend deletes the tenant membership from PostgreSQL.
2. The member-removal API invokes the Socket.IO revocation helper.
3. Matching active sockets are removed from the affected tenant room.
4. The backend emits `tenant:access-revoked` to those sockets.
5. The frontend displays an access-revoked notification.
6. The frontend clears the selected tenant and board.
7. The removed member is redirected to the Tenants page.

The user remains authenticated to the application but loses access to the removed workspace.

The implementation also performs a second membership check after Socket.IO room joining to reduce authorization race conditions.

This mechanism has been manually tested in a single-server environment. It is not a complete guarantee against every concurrent join/removal race.

### Online Presence

- Display currently connected workspace users.
- Count each user once even when multiple browser tabs are open.
- Update presence when users join and disconnect.
- Restore presence after reconnection.
- Update presence after workspace membership revocation.

### Concurrency Handling

The application uses optimistic concurrency control to reduce conflicting task updates.

Each task contains a `version` field.

When a user edits or moves a task, the frontend submits the version it originally retrieved.

If that version is outdated, the backend rejects the operation with **HTTP 409 Conflict**.

Task movement additionally uses PostgreSQL transactions, board-level row locking, and Serializable transaction isolation to coordinate task reordering.

The frontend refreshes task data after movement conflicts.

### Activity History

The application records task operations, including:

- Task creation.
- Task editing.
- Task movement.
- Task deletion.

Activity records contain the performing user, action type, relevant details, and timestamp.

Activity history is scoped to the authorized tenant.

---

## 3. System Architecture

The application follows a client-server architecture.

```text
                    React Frontend
                    localhost:5173
                          |
             +------------+------------+
             |                         |
         REST API                  Socket.IO
             |                         |
             +------------+------------+
                          |
                    Express Backend
                    localhost:5000
                          |
                      Prisma ORM
                          |
                      PostgreSQL
                          |
             Organizations / Tenants
             Users / Memberships
                 Boards / Columns
                  Tasks / Logs
```

### Data Flow

1. The frontend authenticates a user using the REST API.
2. The backend validates credentials and returns a JWT.
3. The user selects an authorized organization and tenant.
4. REST requests pass authentication and tenant-access middleware.
5. Prisma reads or updates PostgreSQL records.
6. Successful task mutations trigger Socket.IO notifications.
7. Connected clients refresh their task data.
8. PostgreSQL remains the authoritative source of task state.

### Member Removal Flow

```text
Organization or Tenant Administrator
                 |
                 v
         Manage Members UI
                 |
                 v
        DELETE Membership API
                 |
                 v
      Authorization Middleware
                 |
                 v
       PostgreSQL Membership
              Deleted
                 |
                 v
      Socket.IO Revocation Helper
                 |
                 v
       Remove User from Room
                 |
                 v
      tenant:access-revoked
                 |
                 v
       Frontend Clears Tenant
          and Board Selection
                 |
                 v
      Redirect to Tenants Page
```

---

## 4. Database Design

The application uses a shared-schema, multi-tenant PostgreSQL database.

### Database Tables

| Table | Responsibility |
|---|---|
| `organizations` | Organization details |
| `tenants` | Tenant workspaces |
| `users` | Registered users |
| `memberships` | User roles and access |
| `boards` | Kanban boards |
| `columns` | Workflow columns |
| `tasks` | Task data, position, and version |
| `activity_logs` | Task activity history |

### Data Integrity

The database uses:

- UUID primary keys.
- Foreign-key relationships.
- Composite foreign keys for board and tenant consistency.
- Membership lookup indexes.
- Ordered task indexes.
- Prisma transactions for relevant multi-step operations.
- PostgreSQL partial unique indexes for membership uniqueness.

### Membership Uniqueness

Two PostgreSQL partial unique indexes prevent duplicate memberships.

#### Tenant Membership Uniqueness

A registered user can have only one membership in a specific tenant.

```sql
CREATE UNIQUE INDEX "membership_unique_tenant_user"
ON "memberships" (
  "user_id",
  "organization_id",
  "tenant_id"
)
WHERE "tenant_id" IS NOT NULL;
```

#### Organization Membership Uniqueness

A registered user can have only one organization-wide membership per organization.

```sql
CREATE UNIQUE INDEX "membership_unique_org_user"
ON "memberships" (
  "user_id",
  "organization_id"
)
WHERE "tenant_id" IS NULL;
```

These indexes protect against duplicate records even when concurrent requests attempt to create the same membership.

The indexes are maintained through a Prisma SQL migration.

See [Database Architecture](docs/database-architecture.md) for details.

The ER diagram is available in [Database ER Diagram](docs/database-erd.md).

---

## 5. Project Structure

```text
collaborative-kanban/
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── lib/
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── utils/
│   ├── server.js
│   └── package.json
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Organizations.jsx
│   │   │   ├── Tenants.jsx
│   │   │   ├── Boards.jsx
│   │   │   ├── Kanban.jsx
│   │   │   ├── ActivityHistory.jsx
│   │   │   └── ManageMembers.jsx
│   │   └── services/
│   ├── package.json
│   └── vite.config.js
│
├── docs/
│   ├── database-erd.md
│   ├── database-architecture.md
│   ├── api-documentation.md
│   └── websocket-documentation.md
│
├── screenshots/
├── .gitignore
└── README.md
```

---

## 6. Local Development Setup

### Prerequisites

Install:

- Node.js and npm.
- PostgreSQL.
- Git.

### Step 1 — Configure PostgreSQL

Create a local PostgreSQL database.

The development database is named:

`julleyonline`

Ensure PostgreSQL is running and your database user has the required permissions.

### Step 2 — Configure the Backend

From the project root:

```bash
cd backend
npm install
```

Create a `.env` file inside `backend/`.

Configure:

```env
DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/julleyonline?schema=public"
JWT_SECRET="REPLACE_WITH_A_LONG_RANDOM_SECRET"
PORT=5000
```

Replace the placeholders with your own values.

**Security:** Never commit actual environment files, database passwords, or JWT secrets to GitHub.

### Step 3 — Initialize the Database

From the `backend` directory:

```bash
npx prisma generate
```

Apply committed database migrations:

```bash
npx prisma migrate deploy
```

For local schema development, use Prisma's development migration workflow.

Do not reset an existing database containing project data.

### Step 4 — Start the Backend

From the `backend` directory:

```bash
node server.js
```

Backend URL:

`http://localhost:5000`

Health check:

`http://localhost:5000/api/health`

Database health check:

`http://localhost:5000/api/health/db`

### Step 5 — Start the Frontend

Open another terminal from the project root:

```bash
cd frontend
npm install
npm run dev
```

Frontend URL:

`http://localhost:5173`

### Step 6 — Use the Application

1. Open the frontend in your browser.
2. Register or sign in.
3. Create or select an organization.
4. Create or select an authorized tenant.
5. Create or open a Kanban board.
6. Manage columns and tasks according to your role.
7. Use Manage Members if you are an administrator.
8. Open separate authenticated browser sessions to test collaboration.

New users must be granted the appropriate memberships through the application's supported administrative flows.

---

## 7. REST API

The backend provides REST endpoints for:

- Authentication.
- Organizations.
- Tenants.
- Boards.
- Columns.
- Tasks.
- Task movement.
- Activity history.
- Workspace member management.
- Backend and database health checks.

### Membership APIs

| Method | Endpoint | Allowed Roles |
|---|---|---|
| GET | `/api/tenants/:tenantId/members` | ORG_ADMIN, TENANT_ADMIN |
| POST | `/api/tenants/:tenantId/members` | ORG_ADMIN, TENANT_ADMIN |
| PATCH | `/api/tenants/:tenantId/members/:membershipId` | ORG_ADMIN |
| DELETE | `/api/tenants/:tenantId/members/:membershipId` | ORG_ADMIN, TENANT_ADMIN |

Additional restrictions apply to which roles an administrator may assign, update, or remove.

All protected endpoints require a valid JWT.

For detailed requests, responses, and error codes, see:

[REST API Documentation](docs/api-documentation.md)

---

## 8. WebSocket Communication

Socket.IO uses JWT-authenticated connections and tenant-specific rooms.

Each tenant room follows this naming convention:

`tenant:<tenantId>`

### Connection and Authorization

1. The client establishes an authenticated Socket.IO connection.
2. The backend verifies the JWT.
3. The client requests to join a tenant room using `tenant:join`.
4. The backend verifies organization or tenant membership.
5. The socket joins the authorized room.
6. The backend performs an additional membership check.
7. Task synchronization and presence updates are delivered through the room.

### Supported Events

| Event | Purpose |
|---|---|
| `tenant:join` | Request access to a tenant room |
| `tenant:leave` | Leave a tenant room |
| `task:created` | Notify clients about task creation |
| `task:updated` | Notify clients about task updates |
| `task:moved` | Notify clients about task movement |
| `task:deleted` | Notify clients about task deletion |
| `presence:updated` | Update online-user information |
| `tenant:access-revoked` | Notify a user of removed workspace access |

### Membership Revocation

When a workspace membership is removed, the backend revokes matching active room memberships and notifies the affected client.

The frontend responds by clearing the selected tenant and board, displaying an alert, and redirecting to the Tenants page.

For more information:

[WebSocket Documentation](docs/websocket-documentation.md)

---

## 9. Security

### Authentication

- JWT verification for protected REST endpoints.
- JWT authentication for Socket.IO connections.
- Password hashing with bcrypt.
- Frontend guest and protected route handling.

### Authorization

- ORG_ADMIN, TENANT_ADMIN, and MEMBER roles.
- Server-side tenant membership validation.
- Role-based restrictions on member-management operations.
- Protection against administrative self-removal through the member API.

### Tenant Isolation

- Tenant-scoped database queries.
- Composite foreign keys for relevant tenant and board relationships.
- Membership verification before Socket.IO room joining.
- Additional membership verification after room joining.
- Active socket-room revocation following membership removal.

### Database Integrity

- PostgreSQL foreign-key constraints.
- Composite relational constraints.
- Membership uniqueness enforced with partial unique indexes.
- Transactions and concurrency control for task movement.

### Input Validation

Zod validates the application's existing authentication and core resource request payloads.

Member-management requests also validate email addresses and requested roles.

### Password Security

Passwords are hashed using bcrypt with a cost factor of 12.

### Concurrency Protection

- Task version checks.
- HTTP 409 responses for stale task updates.
- Transactional task movement.
- Database-level membership uniqueness.

### Environment Protection

The root `.gitignore` excludes environment files, dependencies, build output, logs, and local database files.

Real credentials and secrets must never be committed to the repository.

---

## 10. Testing

The application has undergone manual functional, authorization, database, and collaboration testing.

### Functional Testing

| Scenario | Result |
|---|---|
| User login | Passed |
| Logged-in user redirected away from Login | Passed |
| Logout and return to Login | Passed |
| Organization and tenant selection | Passed |
| Board creation, editing, and deletion | Passed |
| Column creation, renaming, and deletion | Passed |
| Task creation, editing, and deletion | Passed |
| Drag-and-drop movement | Passed |
| Task persistence after refresh | Passed |
| Activity history | Passed |

### Member Management Testing

| Scenario | Result |
|---|---|
| View workspace members | Passed |
| Reject unregistered user addition | Passed |
| Add registered member | Passed |
| Reject duplicate member addition | Passed |
| Promote MEMBER to TENANT_ADMIN | Passed |
| Remove workspace membership | Passed |
| Preserve registered user after removal | Passed |

### Role-Based Permission Testing

| Scenario | Result |
|---|---|
| ORG_ADMIN member management | Passed |
| TENANT_ADMIN management controls | Passed |
| TENANT_ADMIN cannot assign another TENANT_ADMIN | Passed |
| TENANT_ADMIN cannot change member roles | Passed |
| TENANT_ADMIN cannot remove administrators | Passed |
| MEMBER cannot access Manage Members | Passed |
| Direct Manage Members URL denied to MEMBER | Passed |

### Real-Time Collaboration Testing

| Scenario | Result |
|---|---|
| Real-time task creation | Passed |
| Real-time task editing | Passed |
| Real-time task movement | Passed |
| Real-time task deletion | Passed |
| Online presence across sessions | Passed |
| Presence removal after disconnect | Passed |
| Presence restoration after reconnect | Passed |
| Connected member removed by administrator | Passed |
| Removed member redirected without refresh | Passed |
| Removed member loses workspace listing access | Passed |

### Concurrency Testing

| Scenario | Result |
|---|---|
| Task version increases after editing | Passed |
| Outdated task edit rejected | Passed |
| Outdated movement rejected with HTTP 409 | Passed |
| Latest task changes preserved after conflict | Passed |

### Security Testing

| Scenario | Result |
|---|---|
| Unauthorized board creation rejected | Passed |
| Unauthorized REST tenant access rejected | Passed |
| Unauthorized Socket.IO room join rejected | Passed |
| JWT-protected endpoints | Exercised during testing |
| Membership uniqueness migration | Applied |
| Concurrent socket join/removal race | Not exhaustively tested |

### Network Recovery Testing

| Scenario | Result |
|---|---|
| Server disconnection detected | Passed |
| Connection indicator displayed | Passed |
| Automatic reconnection after restart | Passed |
| Real-time synchronization resumes | Passed |

These results describe specific manual test scenarios. They do not constitute comprehensive automated, penetration, load, or concurrency testing.

---

## 11. Architectural Decisions and Trade-offs

### Shared-Schema Multi-Tenancy

All tenants share one PostgreSQL database.

Tenant identifiers, membership checks, and scoped queries provide logical separation.

This keeps the architecture straightforward but requires careful enforcement of tenant boundaries.

### REST APIs with Socket.IO Notifications

REST APIs handle persistent state changes.

Socket.IO broadcasts notifications to connected clients.

Clients re-fetch task data after relevant events rather than treating Socket.IO events as the authoritative task state.

### Optimistic Concurrency Control

Version fields prevent stale task updates from silently overwriting newer changes.

Conflicting edits require users to refresh and retry.

### Transactional Task Movement

PostgreSQL transactions and locking help maintain task ordering.

The movement API uses HTTP 409 to report detected conflicts.

### Database-Level Membership Uniqueness

PostgreSQL partial unique indexes prevent duplicate tenant memberships and organization-wide memberships, including under concurrent insertion attempts.

### In-Memory Presence Tracking

Online users are derived from active Socket.IO room connections.

This approach is suitable for the current single-server implementation.

### Socket.IO Membership Revocation

The backend removes active sockets from the affected tenant room following membership deletion.

This provides immediate revocation for the tested single-server workflow.

However, strict race-free authorization and multi-instance revocation require additional coordination.

---

## 12. Known Limitations

The current implementation has several limitations:

- Automatic JWT refresh is not implemented.
- Task deletion does not require a task version.
- Explicit Socket.IO room leave does not immediately broadcast a presence update.
- A second authorization check reduces, but does not fully eliminate, concurrent room-join and membership-removal races.
- Socket revocation is implemented for the current single-server environment.
- Membership deletion and socket revocation are separate operations, so socket revocation can fail after database deletion.
- The frontend's revocation listener is attached to the Kanban page; other pages require additional handling for immediate access notifications.
- Multi-instance Socket.IO adapters and distributed revocation are not implemented.
- Automated integration and end-to-end test suites are not yet included.
- Concurrent board, column, and task operations need additional stress testing.
- Production deployment has not yet been completed.

These limitations are potential areas for future improvements.

---

## 13. Future Improvements

Possible enhancements include:

- Automated unit, integration, and end-to-end tests.
- Improved distributed membership revocation.
- Stronger coordination between tenant joins and membership removal.
- Socket.IO adapters for horizontal scaling.
- Centralized frontend handling of authorization changes.
- Refresh-token authentication.
- Stronger task-position concurrency guarantees.
- Improved loading, error, and conflict-handling states.
- Responsive design improvements.
- Production deployment.
- Monitoring and structured logging.

---

## 14. Documentation

Additional technical documentation is available in the `docs/` directory.

| Document | Description |
|---|---|
| [Database ER Diagram](docs/database-erd.md) | Entity relationships and database fields |
| [Database Architecture](docs/database-architecture.md) | PostgreSQL design, multi-tenancy, and constraints |
| [REST API Documentation](docs/api-documentation.md) | REST endpoints, permissions, requests, and responses |
| [WebSocket Documentation](docs/websocket-documentation.md) | Socket.IO events, rooms, presence, and revocation |

---

## 15. Assignment Information

**Project:** Multi-Tenant Collaborative Kanban Board

**Assignment:** Forward Deployed Engineer Intern

**Organization:** JulleyOnline

**Application Type:** Full-Stack Collaborative Web Application

**Core Technologies:** React, Node.js, Express, PostgreSQL, Prisma, Socket.IO

---

## 16. Conclusion

JulleyOnline Collaborative Kanban demonstrates a multi-tenant application with JWT authentication, role-based authorization, workspace membership management, REST APIs, real-time collaboration, presence tracking, task ordering, transactional operations, and optimistic concurrency control.

The application also implements real-time membership revocation and database-level uniqueness protections.

The project emphasizes tenant-scoped access, collaborative task synchronization, and documented architectural trade-offs.

---

## Application Screenshots

The following screenshots demonstrate the main features of the JulleyOnline Collaborative Kanban application.

| Screenshot | Description |
|---|---|
| [Login](screenshots/Login.png) | User authentication |
| [Organizations](screenshots/Organizations.png) | Organization selection |
| [Workspaces](screenshots/Tenants.png) | Tenant/workspace selection |
| [Project Boards](screenshots/Boards.png) | Board listing and management |
| [Collaborative Kanban Board](screenshots/kanban.png) | Task management and drag-and-drop interface |
| [Real-Time Collaboration](screenshots/realtime-collaboration.png) | Multiple connected users |
| [Activity History](screenshots/activity-history.png) | Recorded task activities |
| [Manage Members](screenshots/manage-members.png) | Workspace membership and role management |

Screenshots are stored in the [`screenshots/`](screenshots/) directory.

