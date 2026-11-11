
# JulleyOnline — REST API Documentation

## 1. Overview

JulleyOnline provides a REST API for a multi-tenant collaborative Kanban application.

The backend uses Node.js, Express, PostgreSQL, Prisma ORM, JWT authentication, and Socket.IO.

**Local Base URL:** `http://localhost:5000`

All API requests and responses use JSON unless otherwise specified.

The API supports:

- Authentication and user profiles
- Organization and tenant selection
- Board and workflow-column management
- Task creation, editing, deletion, and movement
- Activity history
- Workspace member administration
- Role-based access control
- Real-time collaboration notifications

---

## 2. Authentication and Authorization

Protected endpoints require a JSON Web Token (JWT).

Include the following header:

```http
Authorization: Bearer <JWT_TOKEN>
```

JWTs are issued after successful login and expire after **1 hour**.

### User Roles

| Role | Permissions |
|---|---|
| ORG_ADMIN | Manage resources and memberships across authorized organization tenants |
| TENANT_ADMIN | Manage boards, columns, tasks, and regular members within assigned tenants |
| MEMBER | View boards and columns and manage tasks within assigned tenants |

Backend middleware enforces permissions.

Organization administrators have organization-wide membership records with `tenantId = null`.

Tenant administrators and regular members have tenant-specific memberships.

### Authentication Errors

| Status | Meaning |
|---|---|
| 401 | Missing, invalid, or expired JWT |
| 403 | Insufficient role or unauthorized tenant |
| 404 | Requested resource not found |

---

## 3. Authentication APIs

### 3.1 Register User

**POST** `/api/auth/register`

Authentication: Not required.

Request:

```json
{
  "name": "Example User",
  "email": "user@example.com",
  "password": "example-password"
}
```

Validation:

- Name: 2–100 characters
- Email: Valid email address
- Password: 8–72 characters

Success: **201 Created**

```json
{
  "message": "User registered successfully",
  "user": {
    "id": "<USER_UUID>",
    "name": "Example User",
    "email": "user@example.com",
    "createdAt": "<TIMESTAMP>"
  }
}
```

Errors:

- 400 — Invalid registration details
- 409 — Email already registered
- 500 — Internal server error

### 3.2 Login User

**POST** `/api/auth/login`

Authentication: Not required.

Request:

```json
{
  "email": "user@example.com",
  "password": "example-password"
}
```

Success: **200 OK**

```json
{
  "message": "Login successful",
  "token": "<JWT_TOKEN>",
  "user": {
    "id": "<USER_UUID>",
    "name": "Example User",
    "email": "user@example.com"
  }
}
```

Errors:

- 400 — Invalid login details
- 401 — Invalid email or password
- 500 — Internal server error

### 3.3 Get Current User

**GET** `/api/auth/me`

Authentication: Required.

Success: **200 OK**

```json
{
  "user": {
    "id": "<USER_UUID>",
    "name": "Example User",
    "email": "user@example.com"
  }
}
```

The exact user fields are supplied by the authentication middleware.

---

## 4. Organization APIs

### 4.1 Create Organization

**POST** `/api/organizations`

Authentication: Required.

Request:

```json
{
  "name": "Julley Tech Solutions"
}
```

Success: **201 Created**

Returns the created organization.

The creator automatically receives an organization-level **ORG_ADMIN** membership.

Organization creation and membership creation occur within one Prisma transaction.

### 4.2 List Accessible Organizations

**GET** `/api/organizations`

Authentication: Required.

Success: **200 OK**

```json
{
  "organizations": [
    {
      "id": "<ORGANIZATION_UUID>",
      "name": "Julley Tech Solutions",
      "createdAt": "<TIMESTAMP>"
    }
  ]
}
```

Only organizations associated with the authenticated user's memberships are returned.

Duplicate organizations are removed from the response.

---

## 5. Tenant APIs

### 5.1 Create Tenant

**POST** `/api/tenants`

Allowed role: **ORG_ADMIN**

Request:

```json
{
  "organizationId": "<ORGANIZATION_UUID>",
  "name": "Development Team"
}
```

Success: **201 Created**

```json
{
  "message": "Tenant created successfully",
  "tenant": {
    "id": "<TENANT_UUID>",
    "organizationId": "<ORGANIZATION_UUID>",
    "name": "Development Team",
    "createdAt": "<TIMESTAMP>"
  }
}
```

Only organization administrators can create tenants.

Errors:

- 400 — Invalid tenant details
- 403 — Insufficient permissions
- 500 — Internal server error

### 5.2 List Accessible Tenants

**GET** `/api/tenants?organizationId=<ORGANIZATION_UUID>`

Authentication: Required.

Success: **200 OK**

```json
{
  "tenants": [
    {
      "id": "<TENANT_UUID>",
      "organizationId": "<ORGANIZATION_UUID>",
      "name": "Development Team",
      "createdAt": "<TIMESTAMP>"
    }
  ]
}
```

ORG_ADMIN users can list all tenants in their organization.

TENANT_ADMIN and MEMBER users can list tenants associated with their memberships.

### 5.3 Check Tenant Access

**GET** `/api/tenants/:tenantId/access-check`

Authentication: Required.

Success: **200 OK**

```json
{
  "message": "Tenant access granted",
  "tenant": {
    "id": "<TENANT_UUID>",
    "organizationId": "<ORGANIZATION_UUID>"
  },
  "role": "MEMBER"
}
```

Unauthorized tenant access is rejected with HTTP 403.

---

## 6. Board APIs

### 6.1 Create Board

**POST** `/api/boards`

Allowed roles: ORG_ADMIN, TENANT_ADMIN.

Request:

```json
{
  "tenantId": "<TENANT_UUID>",
  "name": "Development Sprint Board",
  "description": "Sprint task management"
}
```

Success: **201 Created**

```json
{
  "message": "Board created successfully",
  "board": {
    "id": "<BOARD_UUID>",
    "tenantId": "<TENANT_UUID>",
    "name": "Development Sprint Board",
    "description": "Sprint task management",
    "createdById": "<USER_UUID>",
    "createdAt": "<TIMESTAMP>"
  }
}
```

### 6.2 List Boards

**GET** `/api/boards?tenantId=<TENANT_UUID>`

Allowed roles: All authorized tenant members.

Success: **200 OK**

```json
{
  "boards": [
    {
      "id": "<BOARD_UUID>",
      "tenantId": "<TENANT_UUID>",
      "name": "Development Sprint Board",
      "description": "Sprint task management",
      "createdById": "<USER_UUID>",
      "createdAt": "<TIMESTAMP>"
    }
  ]
}
```

Boards are filtered by the authorized tenant and ordered by creation date.

### 6.3 Update Board

**PATCH** `/api/boards/:boardId`

Allowed roles: ORG_ADMIN, TENANT_ADMIN.

Request:

```json
{
  "tenantId": "<TENANT_UUID>",
  "name": "Updated Sprint Board",
  "description": "Updated description"
}
```

Success: **200 OK**

Returns the updated board.

The `tenantId` identifies the tenant for authorization. Only `name` and `description` are editable board fields.

At least one editable field must be provided.

### 6.4 Delete Board

**DELETE** `/api/boards/:boardId`

Allowed roles: ORG_ADMIN, TENANT_ADMIN.

Request:

```json
{
  "tenantId": "<TENANT_UUID>"
}
```

Success: **200 OK**

```json
{
  "message": "Board deleted successfully"
}
```

The backend verifies that the board belongs to the authorized tenant before deletion.

---

## 7. Column APIs

All column routes use:

`/api/tenants/:tenantId/boards/:boardId/columns`

### 7.1 Create Column

**POST** `/api/tenants/:tenantId/boards/:boardId/columns`

Allowed roles: ORG_ADMIN, TENANT_ADMIN.

Request:

```json
{
  "name": "To Do"
}
```

Success: **201 Created**

```json
{
  "message": "Column created successfully",
  "column": {
    "id": "<COLUMN_UUID>",
    "boardId": "<BOARD_UUID>",
    "tenantId": "<TENANT_UUID>",
    "name": "To Do",
    "position": 0
  }
}
```

New columns are assigned positions after the last existing column.

### 7.2 List Columns

**GET** `/api/tenants/:tenantId/boards/:boardId/columns`

Allowed roles: All authorized tenant members.

Success: **200 OK**

```json
{
  "columns": [
    {
      "id": "<COLUMN_UUID>",
      "boardId": "<BOARD_UUID>",
      "tenantId": "<TENANT_UUID>",
      "name": "To Do",
      "position": 0
    }
  ]
}
```

Columns are ordered by ascending position.

### 7.3 Update Column

**PATCH** `/api/tenants/:tenantId/boards/:boardId/columns/:columnId`

Allowed roles: ORG_ADMIN, TENANT_ADMIN.

Request:

```json
{
  "name": "In Review"
}
```

Success: **200 OK**

Returns the updated column.

### 7.4 Delete Column

**DELETE** `/api/tenants/:tenantId/boards/:boardId/columns/:columnId`

Allowed roles: ORG_ADMIN, TENANT_ADMIN.

Success: **200 OK**

```json
{
  "message": "Column deleted successfully"
}
```

Columns containing tasks cannot be deleted.

Conflict: **409**

```json
{
  "message": "Move or delete tasks before deleting this column"
}
```

---

## 8. Task APIs

All task routes use:

`/api/tenants/:tenantId/boards/:boardId/tasks`

All three roles can manage tasks within authorized tenants.

### 8.1 Create Task

**POST** `/api/tenants/:tenantId/boards/:boardId/tasks`

Request:

```json
{
  "title": "Implement login page",
  "description": "Build authentication UI",
  "columnId": "<COLUMN_UUID>",
  "assignedToId": null
}
```

Validation:

- Title: 1–200 characters
- Description: Up to 2,000 characters
- Column ID: Valid UUID belonging to the board and tenant
- Assignee: Optional user authorized within the tenant or its organization administrator

Success: **201 Created**

```json
{
  "message": "Task created successfully",
  "task": {
    "id": "<TASK_UUID>",
    "boardId": "<BOARD_UUID>",
    "columnId": "<COLUMN_UUID>",
    "tenantId": "<TENANT_UUID>",
    "title": "Implement login page",
    "description": "Build authentication UI",
    "assignedToId": null,
    "position": 0,
    "version": 1,
    "createdAt": "<TIMESTAMP>",
    "updatedAt": "<TIMESTAMP>"
  }
}
```

New tasks are appended to their columns.

Task creation and activity logging occur within a Prisma transaction.

After success, Socket.IO emits `task:created`.

### 8.2 List Tasks

**GET** `/api/tenants/:tenantId/boards/:boardId/tasks`

Success: **200 OK**

```json
{
  "tasks": [
    {
      "id": "<TASK_UUID>",
      "boardId": "<BOARD_UUID>",
      "columnId": "<COLUMN_UUID>",
      "tenantId": "<TENANT_UUID>",
      "title": "Implement login page",
      "description": "Build authentication UI",
      "assignedToId": null,
      "position": 0,
      "version": 1,
      "createdAt": "<TIMESTAMP>",
      "updatedAt": "<TIMESTAMP>"
    }
  ]
}
```

Tasks are filtered by board and tenant, then sorted by position and creation date.

### 8.3 Update Task

**PATCH** `/api/tenants/:tenantId/boards/:boardId/tasks/:taskId`

Request:

```json
{
  "title": "Implement JWT authentication",
  "description": "Add validation",
  "version": 1
}
```

The request must include the current task version and at least one editable field.

Editable fields:

- `title`
- `description`
- `assignedToId`

Success: **200 OK**

```json
{
  "message": "Task updated successfully",
  "task": {
    "id": "<TASK_UUID>",
    "boardId": "<BOARD_UUID>",
    "columnId": "<COLUMN_UUID>",
    "tenantId": "<TENANT_UUID>",
    "title": "Implement JWT authentication",
    "description": "Add validation",
    "assignedToId": null,
    "position": 0,
    "version": 2,
    "createdAt": "<TIMESTAMP>",
    "updatedAt": "<TIMESTAMP>"
  }
}
```

The task version increments following a successful update.

If the supplied version is outdated, the API returns **409 Conflict**:

```json
{
  "message": "Task was modified by another user. Refresh and retry."
}
```

After a successful update, Socket.IO emits `task:updated`.

### 8.4 Delete Task

**DELETE** `/api/tenants/:tenantId/boards/:boardId/tasks/:taskId`

Success: **200 OK**

```json
{
  "message": "Task deleted successfully"
}
```

Deletion and activity logging occur within a Prisma transaction.

After successful deletion, Socket.IO emits `task:deleted`.

Task deletion does not currently require a version field.

---

## 9. Task Movement API

### 9.1 Move Task

**PATCH** `/api/tenants/:tenantId/boards/:boardId/tasks/:taskId/move`

Allowed roles: All authorized tenant members.

Request:

```json
{
  "targetColumnId": "<TARGET_COLUMN_UUID>",
  "targetPosition": 0,
  "version": 3
}
```

Fields:

| Field | Description |
|---|---|
| targetColumnId | Destination column UUID |
| targetPosition | Zero-based destination index |
| version | Current version of the selected task |

Success: **200 OK**

```json
{
  "message": "Task moved successfully",
  "task": {
    "id": "<TASK_UUID>",
    "boardId": "<BOARD_UUID>",
    "columnId": "<TARGET_COLUMN_UUID>",
    "tenantId": "<TENANT_UUID>",
    "title": "Implement login page",
    "description": "",
    "assignedToId": null,
    "position": 0,
    "version": 4,
    "createdAt": "<TIMESTAMP>",
    "updatedAt": "<TIMESTAMP>"
  }
}
```

### Movement Behavior

The endpoint supports:

- Reordering tasks within the same column.
- Moving tasks between columns.
- Updating affected task positions.
- Incrementing versions for tasks whose positions change.
- Writing activity history within the transaction.
- Broadcasting `task:moved` after the transaction commits.

### Concurrency Handling

The endpoint uses PostgreSQL board-row locking (`SELECT ... FOR UPDATE`) and Prisma transactions with Serializable isolation.

Outdated task versions return **409 Conflict**:

```json
{
  "message": "Task was modified. Refresh and retry."
}
```

A detected Prisma transaction conflict (`P2034`) returns:

```json
{
  "message": "Concurrent movement detected. Refresh and retry."
}
```

The frontend refreshes task data to reconcile the current board state after a failed movement.

---

## 10. Activity History API

### 10.1 Get Tenant Activities

**GET** `/api/tenants/:tenantId/activities`

Allowed roles: All authorized tenant members.

Optional query parameter:

`limit=50`

The default limit is 50 records. Accepted values are integers from 1 to 100.

Example:

```http
GET /api/tenants/<TENANT_UUID>/activities?limit=20
Authorization: Bearer <JWT_TOKEN>
```

Success: **200 OK**

```json
{
  "activities": [
    {
      "id": "<ACTIVITY_UUID>",
      "tenantId": "<TENANT_UUID>",
      "userId": "<USER_UUID>",
      "entityType": "TASK",
      "entityId": "<TASK_UUID>",
      "action": "MOVED",
      "details": {
        "boardId": "<BOARD_UUID>",
        "title": "Implement login page",
        "fromColumnId": "<SOURCE_COLUMN_UUID>",
        "toColumnId": "<DESTINATION_COLUMN_UUID>",
        "fromPosition": 0,
        "toPosition": 1,
        "previousVersion": 2,
        "newVersion": 3
      },
      "createdAt": "<TIMESTAMP>",
      "user": {
        "id": "<USER_UUID>",
        "name": "Example User",
        "email": "user@example.com"
      }
    }
  ],
  "count": 1
}
```

The API returns activity records for the authorized tenant only.

Activities are ordered by descending creation time, using ID as a secondary ordering field.

Invalid query parameters return **400 Bad Request**.

---

## 11. Workspace Member Management APIs

Workspace administrators can add, view, update, and remove tenant memberships.

All endpoints require JWT authentication.

The tenant identifier is supplied through the URL:

`/api/tenants/:tenantId/members`

### 11.1 List Workspace Members

**GET** `/api/tenants/:tenantId/members`

Allowed roles: **ORG_ADMIN, TENANT_ADMIN**

Success: **200 OK**

Example response:

```json
{
  "tenantId": "<TENANT_UUID>",
  "count": 2,
  "members": [
    {
      "id": "<ORG_MEMBERSHIP_UUID>",
      "userId": "<ORG_ADMIN_USER_UUID>",
      "tenantId": null,
      "role": "ORG_ADMIN",
      "createdAt": "<TIMESTAMP>",
      "user": {
        "id": "<ORG_ADMIN_USER_UUID>",
        "name": "Organization Administrator",
        "email": "orgadmin@example.com"
      }
    },
    {
      "id": "<MEMBERSHIP_UUID>",
      "userId": "<USER_UUID>",
      "tenantId": "<TENANT_UUID>",
      "role": "MEMBER",
      "createdAt": "<TIMESTAMP>",
      "user": {
        "id": "<USER_UUID>",
        "name": "Example Member",
        "email": "member@example.com"
      }
    }
  ]
}
```

The response includes:

- Tenant-specific MEMBER memberships.
- Tenant-specific TENANT_ADMIN memberships.
- Organization-level ORG_ADMIN memberships.

Organization administrators are included because they have access to the organization's tenants.

Members are ordered by membership creation time.

Errors:

- 401 — Missing or invalid authentication
- 403 — Insufficient permissions or unauthorized tenant
- 500 — Failed to fetch workspace members

### 11.2 Add Workspace Member

**POST** `/api/tenants/:tenantId/members`

Allowed roles: **ORG_ADMIN, TENANT_ADMIN**

Request:

```json
{
  "email": "member@example.com",
  "role": "MEMBER"
}
```

Request fields:

| Field | Type | Required | Description |
|---|---|---|---|
| email | String | Yes | Email of an existing registered user |
| role | String | No | MEMBER or TENANT_ADMIN; defaults to MEMBER |

The email is trimmed and converted to lowercase before lookup.

#### Role Restrictions

- ORG_ADMIN can assign MEMBER or TENANT_ADMIN.
- TENANT_ADMIN can assign MEMBER only.
- The endpoint cannot assign ORG_ADMIN.
- The target user must already be registered.
- An organization administrator cannot be added as a duplicate tenant member.
- A user cannot be added twice to the same tenant.

Success: **201 Created**

```json
{
  "message": "Member added successfully",
  "member": {
    "id": "<MEMBERSHIP_UUID>",
    "userId": "<USER_UUID>",
    "tenantId": "<TENANT_UUID>",
    "role": "MEMBER",
    "createdAt": "<TIMESTAMP>",
    "user": {
      "id": "<USER_UUID>",
      "name": "Example Member",
      "email": "member@example.com"
    }
  }
}
```

#### Error Responses

**400 Bad Request — Invalid email**

```json
{
  "message": "A valid user email is required"
}
```

**400 Bad Request — Invalid role**

```json
{
  "message": "Invalid workspace role"
}
```

**403 Forbidden — Unauthorized role assignment**

```json
{
  "message": "Only organization administrators can assign tenant admins"
}
```

**404 Not Found — User is not registered**

```json
{
  "message": "User not found. Ask the user to register first."
}
```

**409 Conflict — User already belongs to tenant**

```json
{
  "message": "This user already belongs to this workspace."
}
```

**409 Conflict — Target user is an organization administrator**

```json
{
  "message": "This user is already an organization administrator."
}
```

Other possible errors:

- 401 — Invalid authentication
- 403 — Unauthorized tenant
- 500 — Failed to add workspace member

Database-level partial unique indexes prevent duplicate tenant and organization-wide membership records. A concurrent insert conflict may still surface as an internal error unless separately handled in the route.

### 11.3 Update Workspace Member Role

**PATCH** `/api/tenants/:tenantId/members/:membershipId`

Allowed role: **ORG_ADMIN only**

Request:

```json
{
  "role": "TENANT_ADMIN"
}
```

Allowed role values:

- `MEMBER`
- `TENANT_ADMIN`

Example: Promote an existing MEMBER to TENANT_ADMIN.

Success: **200 OK**

```json
{
  "message": "Member role updated successfully",
  "member": {
    "id": "<MEMBERSHIP_UUID>",
    "userId": "<USER_UUID>",
    "tenantId": "<TENANT_UUID>",
    "role": "TENANT_ADMIN",
    "user": {
      "id": "<USER_UUID>",
      "name": "Example Member",
      "email": "member@example.com"
    }
  }
}
```

#### Security Rules

- Only ORG_ADMIN can change tenant member roles.
- The membership must belong to the requested tenant and organization.
- Organization-wide administrator memberships cannot be modified through this endpoint.
- A user cannot change their own role through this endpoint.

Errors:

**400 Bad Request — Invalid role**

```json
{
  "message": "Role must be MEMBER or TENANT_ADMIN"
}
```

**403 Forbidden — Self-role modification**

```json
{
  "message": "You cannot change your own role"
}
```

**404 Not Found — Membership not found**

```json
{
  "message": "Workspace membership not found"
}
```

Additional errors:

- 401 — Missing or invalid authentication
- 403 — Insufficient permissions or unauthorized tenant
- 500 — Failed to update member role

### 11.4 Remove Workspace Member

**DELETE** `/api/tenants/:tenantId/members/:membershipId`

Allowed roles: **ORG_ADMIN, TENANT_ADMIN**

Request body: Not required.

Success: **200 OK**

```json
{
  "message": "Member removed successfully",
  "socketsRevoked": 1
}
```

`socketsRevoked` is the number of active socket connections removed from the affected tenant room by the current server. It can be zero if the user is not currently connected.

#### Security Rules

- ORG_ADMIN can remove MEMBER and TENANT_ADMIN memberships.
- TENANT_ADMIN can remove MEMBER memberships only.
- Organization-wide administrator memberships cannot be removed through this endpoint.
- Administrators cannot remove their own tenant membership.
- Removing membership does not delete the registered user account.

#### Real-Time Revocation

After successfully deleting the membership from PostgreSQL, the endpoint calls the socket-revocation helper registered in `server.js`.

The helper:

1. Finds connected sockets belonging to the removed user.
2. Removes those sockets from the affected tenant room.
3. Emits `tenant:access-revoked` to the affected sockets.
4. Updates the online presence list.

The Kanban frontend responds by clearing the selected workspace and board and redirecting the user to the Tenants page.

#### Error Responses

**403 Forbidden — Self-removal**

```json
{
  "message": "You cannot remove your own membership"
}
```

**403 Forbidden — Tenant Admin removing another administrator**

```json
{
  "message": "Only organization administrators can remove tenant admins"
}
```

**404 Not Found — Membership not found**

```json
{
  "message": "Workspace membership not found"
}
```

Additional errors:

- 401 — Missing or invalid authentication
- 403 — Unauthorized tenant
- 500 — Failed to remove workspace member

**Implementation note:** Membership deletion and socket revocation are separate operations. The existing route logs socket-revocation failures while preserving a successful membership deletion response.

### 11.5 Member Management Permission Matrix

| Operation | ORG_ADMIN | TENANT_ADMIN | MEMBER |
|---|---|---|---|
| List workspace members | Allowed | Allowed | Denied |
| Add MEMBER | Allowed | Allowed | Denied |
| Add TENANT_ADMIN | Allowed | Denied | Denied |
| Update MEMBER role | Allowed | Denied | Denied |
| Update TENANT_ADMIN role | Allowed | Denied | Denied |
| Remove MEMBER | Allowed | Allowed | Denied |
| Remove TENANT_ADMIN | Allowed | Denied | Denied |
| Remove ORG_ADMIN | Denied | Denied | Denied |

This matrix applies to the workspace membership-management endpoints, not to every operation in the application.

---

## 12. Health Check APIs

### 12.1 Backend Health

**GET** `/api/health`

Success: **200 OK**

```json
{
  "status": "success",
  "message": "JulleyOnline Backend is running"
}
```

### 12.2 Database Health

**GET** `/api/health/db`

Success: **200 OK**

```json
{
  "status": "success",
  "message": "PostgreSQL connected successfully"
}
```

If the database check fails, the API returns **503 Service Unavailable**:

```json
{
  "status": "error",
  "message": "Database connection failed"
}
```

---

## 13. Common HTTP Status Codes

| Status | Meaning |
|---|---|
| 200 | Request successful |
| 201 | Resource created |
| 400 | Invalid request or validation failure |
| 401 | Missing, invalid, or expired authentication |
| 403 | Insufficient permissions or unauthorized tenant |
| 404 | Requested resource not found |
| 409 | Duplicate record, invalid state, or concurrency conflict |
| 500 | Internal server error |
| 503 | Database health check failed |

Not every status is returned by every endpoint.

---

## 14. API Security

The application includes several security mechanisms.

### Authentication

Protected REST endpoints use JWT verification.

### Authorization

Role-based middleware controls administrative operations and workspace memberships.

### Tenant Isolation

Tenant access middleware checks memberships.

Database queries are scoped to authorized tenant IDs.

### Validation

Zod validates existing authentication and core resource payloads.

Member management also validates email addresses and requested role values.

### Password Storage

Passwords are hashed using bcrypt with a cost factor of 12.

### Concurrency

Task edits and movements use version checks to reject outdated requests.

PostgreSQL transactions coordinate task movement.

### Membership Uniqueness

PostgreSQL partial unique indexes prevent duplicate membership records for the same tenant or organization-wide scope.

### Real-Time Authorization

Socket.IO verifies JWT authentication and tenant membership before admitting a connection to a tenant room.

An additional membership check runs after room joining.

When an administrator removes a tenant membership, the deletion endpoint requests removal of the user's active sockets from that tenant room.

---

## 15. Implementation Notes and Limitations

- JWT sessions currently expire after one hour; refresh-token support is not implemented.
- Creating a tenant does not automatically create TENANT_ADMIN or MEMBER memberships.
- Workspace member administration is implemented through dedicated REST endpoints and a Manage Members frontend.
- Database uniqueness is enforced through PostgreSQL partial unique indexes.
- The member-addition route does not currently provide specialized handling for every Prisma uniqueness-conflict error.
- Task deletion does not perform optimistic version validation.
- Task movement transaction conflicts return HTTP 409 rather than automatically retrying.
- Concurrent column creation could assign matching positions because the current position-allocation logic does not guarantee unique positions.
- Socket access revocation is implemented for the current single-server deployment model.
- An additional membership check reduces, but does not fully eliminate, concurrent tenant-join and membership-removal races.
- The active Kanban page handles `tenant:access-revoked`; centralized revocation handling across every frontend page is not yet implemented.
- Membership deletion is committed before socket revocation. A socket notification failure does not roll back the deletion.
- Multi-server Socket.IO adapters and distributed socket revocation are not yet implemented.
- Automated integration, security, and load testing remain future improvements.

Socket.IO protocols and events are documented separately in:

[WebSocket Documentation](websocket-documentation.md)

---

## 16. Conclusion

JulleyOnline's REST API provides authentication, organization and tenant management, role-based board and column operations, task collaboration, activity history, version-controlled task movements, and workspace membership administration.

The implementation combines PostgreSQL transactions, Prisma ORM, JWT security, tenant-scoped authorization, database membership constraints, and Socket.IO events to support a collaborative multi-tenant Kanban application.
