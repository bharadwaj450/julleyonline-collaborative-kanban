

-- =========================================
-- PREVENT DUPLICATE WORKSPACE MEMBERSHIPS
-- =========================================

-- A user can belong to a specific tenant
-- only once within an organization.

CREATE UNIQUE INDEX "membership_unique_tenant_user"
ON "memberships" (
  "user_id",
  "organization_id",
  "tenant_id"
)
WHERE "tenant_id" IS NOT NULL;


-- =========================================
-- PREVENT DUPLICATE ORGANIZATION MEMBERSHIPS
-- =========================================

-- A user can have only one organization-wide
-- membership (tenant_id IS NULL).

CREATE UNIQUE INDEX "membership_unique_org_user"
ON "memberships" (
  "user_id",
  "organization_id"
)
WHERE "tenant_id" IS NULL;
