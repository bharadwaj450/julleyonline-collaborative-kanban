
# JulleyOnline — Database Architecture

## 1. Overview

JulleyOnline is a multi-tenant collaborative Kanban application built using React, Node.js, Express, Socket.IO, PostgreSQL, and Prisma ORM.

PostgreSQL stores organizations, tenants, users, memberships, boards, columns, tasks, and activity logs.

The application uses a **shared-schema multi-tenant architecture**. Multiple organizations and tenants share the same database, while application authorization and tenant-scoped queries restrict access to the appropriate workspace data.

The database also implements membership uniqueness constraints, transactional operations, and optimistic concurrency control.

---

## 2. Database Technology

| Component | Technology |
|---|---|
| Database | PostgreSQL |
| ORM | Prisma 6 |
| Backend | Node.js and Express |
| Authentication | JWT |
| Real-time communication | Socket.IO |
| Primary key strategy | UUID |
| Schema management | Prisma migrations |
| Membership uniqueness | PostgreSQL partial unique indexes |
| Concurrency control | Task versions and database transactions |

---

## 3. Database Tables

The application contains eight primary tables.

| Table | Purpose |
|---|---|
| `organizations` | Stores organization information |
| `tenants` | Represents workspaces belonging to organizations |
| `users` | Stores registered users and password hashes |
| `memberships` | Associates users with organizations or tenants and assigns roles |
| `boards` | Stores Kanban boards within tenants |
| `columns` | Stores workflow columns and their order |
| `tasks` | Stores tasks, assignments, positions, and versions |
| `activity_logs` | Records task operations and activity history |

### Database Model Hierarchy

```text
Organization
    |
    +-- Tenants
    |     |
    |     +-- Boards
    |     |     |
    |     |     +-- Columns
    |     |     |      |
    |     |     |      +-- Tasks
    |     |     |
    |     |     +-- Tasks
    |     |
    |     +-- Memberships
    |     |
    |     +-- Activity Logs
    |
    +-- Organization Memberships

User
    |
    +-- Memberships
    +-- Created Boards
    +-- Assigned Tasks
    +-- Activity Logs
```

---

## 4. Multi-Tenant Architecture

The application follows this hierarchy:

**Organization → Tenant → Board → Column → Task**

An organization can contain multiple tenants. Each tenant represents an independent workspace.

For example:

- Organization: Julley Tech Solutions
- Tenant 1: Development Team
- Tenant 2: Marketing Team

Each tenant can manage its own boards, columns, and tasks.

Tenant-owned tables contain a `tenant_id` foreign key, allowing backend queries to filter data by the authorized tenant.

### Tenant Isolation

Tenant isolation is implemented using several controls:

1. JWT authentication identifies the requesting user.
2. Membership records determine accessible organizations and tenants.
3. Express middleware verifies tenant access.
4. Database queries include tenant-scoping conditions.
5. Composite foreign keys help maintain tenant consistency.
6. Socket.IO validates membership before tenant-room joining.
7. Active tenant-room access is revoked when membership is removed.

### Composite Foreign Keys

The database uses composite relationships to prevent certain cross-tenant references.

For example, a task references its column using:

- `column_id`
- `board_id`
- `tenant_id`

This ensures that a task cannot reference a column belonging to another board or tenant.

Similarly, tenant relationships maintain organization consistency.

This provides logical tenant isolation within the shared PostgreSQL database.

---

## 5. Role-Based Access Control

JulleyOnline supports three roles:

| Role | Access |
|---|---|
| ORG_ADMIN | Organization-wide administration and access to its tenants |
| TENANT_ADMIN | Board, column, task, and regular-member management within assigned tenants |
| MEMBER | Task collaboration within assigned tenants |

The `memberships` table determines organization and tenant access.

### Membership Fields

The Prisma `Membership` model contains:

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Membership primary key |
| `user_id` | UUID | Reference to registered user |
| `organization_id` | UUID | Reference to organization |
| `tenant_id` | UUID, nullable | Reference to tenant |
| `role` | Enum | ORG_ADMIN, TENANT_ADMIN, MEMBER |
| `created_at` | Timestamp | Membership creation time |

### Organization Administrator Membership

An organization administrator has:

```text
user_id         = USER_UUID
organization_id = ORGANIZATION_UUID
tenant_id       = NULL
role            = ORG_ADMIN
```

This grants organization-wide access through the application's authorization middleware.

### Tenant Membership

A regular member or tenant administrator has:

```text
user_id         = USER_UUID
organization_id = ORGANIZATION_UUID
tenant_id       = TENANT_UUID
role            = MEMBER or TENANT_ADMIN
```

Backend middleware checks the applicable membership before allowing protected operations.

Frontend role-based controls improve usability but are not the security boundary.

---

## 6. Workspace Membership Management

JulleyOnline includes a Manage Members interface backed by PostgreSQL membership records.

Administrators can:

- View workspace members.
- Add existing registered users.
- Assign tenant-level roles.
- Promote or demote members.
- Remove users from a workspace.

### Membership Creation

When an administrator adds a member:

1. The backend verifies the administrator's permissions.
2. The email address is validated and normalized.
3. PostgreSQL is queried for the registered user.
4. The backend checks whether the user is already an organization administrator.
5. The backend checks whether the user already belongs to the tenant.
6. A new membership record is created.

The user must already exist in the `users` table.

### Membership Role Updates

When an organization administrator changes a tenant member's role:

1. The backend verifies ORG_ADMIN authorization.
2. The target membership is restricted to the current tenant and organization.
3. The new role is validated.
4. Prisma updates the membership record.

The endpoint supports changes between:

- MEMBER
- TENANT_ADMIN

Organization-wide administrator memberships cannot be modified through this endpoint.

### Membership Removal

When an authorized administrator removes a member:

1. The backend verifies the administrator's permissions.
2. The membership is located within the requested tenant.
3. The backend checks self-removal and role restrictions.
4. Prisma deletes the tenant membership.
5. The backend invokes the Socket.IO revocation helper.
6. Active matching socket connections are removed from the tenant room.

Removing a membership does **not** delete the user account or the user's unrelated memberships.

Membership deletion and socket revocation occur as separate operations.

---

## 7. Membership Uniqueness Constraints

The initial application schema used lookup indexes for membership queries.

However, ordinary indexes do not prevent duplicate memberships.

To protect the database against duplicate membership creation, the application uses **two PostgreSQL partial unique indexes**.

### 7.1 Tenant Membership Uniqueness

A user can have only one membership for a given tenant within an organization.

```sql
CREATE UNIQUE INDEX "membership_unique_tenant_user"
ON "memberships" (
  "user_id",
  "organization_id",
  "tenant_id"
)
WHERE "tenant_id" IS NOT NULL;
```

This prevents multiple membership rows with the same:

- User
- Organization
- Tenant

A user may still belong to different tenants within the same organization.

### 7.2 Organization Membership Uniqueness

A user can have only one organization-wide membership for an organization.

```sql
CREATE UNIQUE INDEX "membership_unique_org_user"
ON "memberships" (
  "user_id",
  "organization_id"
)
WHERE "tenant_id" IS NULL;
```

This protects memberships where `tenant_id` is `NULL`.

### 7.3 Why Partial Unique Indexes?

PostgreSQL normally treats `NULL` values as distinct in conventional unique indexes.

A regular composite uniqueness constraint containing a nullable `tenant_id` would therefore not provide the desired protection for organization-wide memberships.

Partial unique indexes allow us to apply separate uniqueness rules to:

- Tenant-specific memberships.
- Organization-wide memberships.

### 7.4 Concurrent Membership Creation

Consider two administrators attempting to add the same user to the same tenant simultaneously.

Without a database constraint, both requests could pass the application's existing-membership check and create duplicate records.

With the unique index, PostgreSQL prevents the second duplicate insertion.

The application-level membership check remains useful for returning understandable error messages.

A database uniqueness error under concurrent requests may require additional route-level handling to return HTTP 409 consistently.

### 7.5 Migration Management

The uniqueness indexes are maintained through a Prisma SQL migration.

The migration was created using:

```bash
npx prisma migrate dev --create-only --name unique_memberships
```

After adding the SQL indexes to the migration file, it was applied using:

```bash
npx prisma migrate dev
```

Migration status was verified using:

```bash
npx prisma migrate status
```

The reported status was:

```text
Database schema is up to date!
```

For a fresh environment, committed migrations should be applied using:

```bash
npx prisma migrate deploy
```

Existing database records should be preserved when applying migrations.

---

## 8. Database Relationships

Important relationships include:

- One organization has many tenants.
- One organization has many memberships.
- One user can have multiple memberships across organizations and tenants.
- One tenant has many tenant-specific memberships.
- One tenant has many boards.
- One board has many columns.
- One board has many tasks.
- One column contains many tasks.
- One user can create multiple boards.
- One user can be assigned multiple tasks.
- One tenant has many activity log records.

The complete entity relationship diagram is maintained in:

`docs/database-erd.md`

---

## 9. Task Ordering

Each task contains:

- `position` — Integer representing task order.
- `column_id` — Column currently containing the task.

These fields determine where a task appears within the Kanban board.

When a user drags a task to another column or position:

1. The frontend sends the destination column and position.
2. The backend validates the requested movement.
3. A PostgreSQL transaction coordinates updates.
4. Affected task positions are recalculated.
5. Updated data is persisted.
6. Socket.IO notifies connected clients.

The movement route uses board-row locking and Serializable transaction isolation to help maintain ordering consistency.

---

## 10. Optimistic Concurrency Control

Each task has a `version` field initially set to `1`.

When a task is successfully updated or moved, its version increases.

### Task Editing

For editing, the backend uses conditional updates based on the task's current version.

This prevents older edits from silently overwriting newer task changes.

### Task Movement

For movement, the backend validates the supplied version inside the database transaction.

If another user modifies the task first, the outdated request is rejected with:

**HTTP 409 Conflict**

The frontend can then reload the task data and display the latest state.

### Concurrency Limitations

Optimistic concurrency reduces conflicting updates but does not eliminate every possible ordering or transaction contention scenario.

Additional stress testing is needed for high-concurrency workloads.

---

## 11. Transactions and Activity Logging

Task creation, updates, movements, and deletion use Prisma transactions to coordinate database changes with activity logging.

The `activity_logs` table contains:

| Field | Purpose |
|---|---|
| `tenant_id` | Workspace associated with the action |
| `user_id` | User who performed the operation |
| `entity_type` | Type of affected entity |
| `entity_id` | Identifier of affected entity |
| `action` | Operation performed |
| `details` | JSON metadata |
| `created_at` | Timestamp |

For example, a task movement may record:

- Previous column.
- Destination column.
- Previous position.
- Destination position.
- Previous version.
- New version.

Activity logs provide a historical record of task operations.

---

## 12. Real-Time Collaboration and Database Authorization

Socket.IO provides real-time task synchronization and presence tracking.

Users join tenant-specific rooms using:

`tenant:<tenantId>`

The backend:

1. Authenticates the Socket.IO connection.
2. Verifies user membership.
3. Allows authorized tenant-room joining.
4. Performs an additional membership check.
5. Broadcasts task events to authorized tenant rooms.

### Task Events

- `task:created`
- `task:updated`
- `task:moved`
- `task:deleted`

### Presence Events

- `presence:updated`

### Workspace Access Revocation

- `tenant:access-revoked`

When a workspace membership is removed, the backend deletes the membership record and requests revocation of matching active tenant-room socket connections.

The frontend listens for the revocation event on the Kanban page and redirects the affected user to the Tenants page.

The database remains the authoritative source for membership and task information.

---

## 13. Database Indexing

The Prisma schema defines indexes for common lookup patterns.

| Table | Index / Fields | Purpose |
|---|---|---|
| memberships | `user_id`, `tenant_id` | Membership lookup |
| memberships | `organization_id` | Organization membership lookup |
| columns | `board_id`, `position` | Ordered columns |
| tasks | `tenant_id`, `board_id` | Tenant and board task lookup |
| tasks | `column_id`, `position` | Ordered tasks |
| activity_logs | `tenant_id`, `created_at` | Activity history retrieval |

Additional database integrity is supported through:

- Primary keys.
- Foreign keys.
- Composite unique constraints.
- Composite foreign-key relationships.
- Partial unique indexes for membership uniqueness.

### Membership Indexes

| Index | Scope | Purpose |
|---|---|---|
| `membership_unique_tenant_user` | `tenant_id IS NOT NULL` | Prevent duplicate tenant memberships |
| `membership_unique_org_user` | `tenant_id IS NULL` | Prevent duplicate organization-wide memberships |

The partial unique indexes are defined in SQL migrations rather than as ordinary Prisma `@@unique` declarations.

---

## 14. Design Trade-offs

### Shared Database

A shared database simplifies development and administration.

However, application code must consistently enforce tenant-scoped authorization.

### Optimistic Concurrency

Task versions reduce overwritten edits without requiring long-lived locks for normal editing.

Clients must handle conflicts and refresh outdated state.

### Partial Unique Indexes

Database-level uniqueness prevents duplicate membership records, including concurrent inserts.

However, raw SQL indexes require careful migration maintenance.

### Tenant-Specific Socket.IO Rooms

Rooms reduce cross-tenant notifications, but backend authorization must remain enforced.

### Real-Time Membership Revocation

Socket revocation allows users to lose active room access after membership deletion.

The current implementation is designed for a single server and does not guarantee race-free revocation under every concurrent operation.

### Activity Logs

Activity history improves transparency and auditing but increases database writes and storage requirements.

### Single Application Server

A single server is appropriate for the current prototype.

Horizontal scaling would require coordination for Socket.IO connections, presence tracking, and access revocation.

---

## 15. Known Limitations

- Shared-schema tenant isolation requires correct authorization across every backend data-access path.
- Automatic JWT refresh is not implemented.
- Task deletion does not currently use task-version validation.
- Concurrent task movement and column-position allocation require additional stress testing.
- Database uniqueness violations during concurrent member creation are not yet handled with specialized error responses.
- Membership deletion and socket revocation are separate operations.
- Socket.IO room-join rechecks reduce, but do not completely eliminate, authorization race conditions.
- Socket revocation currently targets connections on the local server.
- Production-ready distributed presence and revocation require additional infrastructure.
- Automated integration and load tests are not yet included.

---

## 16. Conclusion

The JulleyOnline database architecture combines PostgreSQL relational integrity, Prisma ORM, shared-schema multi-tenancy, role-based authorization, transactional operations, and optimistic concurrency control.

The updated design includes database-level membership uniqueness through PostgreSQL partial unique indexes and workspace membership management through authenticated REST endpoints.

These mechanisms support collaborative Kanban operations while providing a foundation for further scalability, testing, and security improvements.
