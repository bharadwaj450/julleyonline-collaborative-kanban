
const prisma = require("../lib/prisma");

// Verify tenant membership and role permissions
const tenantAccess = (allowedRoles = []) => {
  return async (req, res, next) => {
    try {
      const tenantId =
        req.params.tenantId || req.body?.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          message: "Tenant ID is required"
        });
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          organizationId: true
        }
      });

      if (!tenant) {
        return res.status(404).json({
          message: "Tenant not found"
        });
      }

      const orgAdmin = await prisma.membership.findFirst({
        where: {
          userId: req.user.id,
          organizationId: tenant.organizationId,
          tenantId: null,
          role: "ORG_ADMIN"
        }
      });

      const tenantMembership = await prisma.membership.findFirst({
        where: {
          userId: req.user.id,
          organizationId: tenant.organizationId,
          tenantId,
          role: {
            in: ["TENANT_ADMIN", "MEMBER"]
          }
        }
      });

      if (!orgAdmin && !tenantMembership) {
        return res.status(403).json({
          message: "Access denied to this tenant"
        });
      }

      const effectiveRole = orgAdmin
        ? "ORG_ADMIN"
        : tenantMembership.role;

      if (
        allowedRoles.length > 0 &&
        !allowedRoles.includes(effectiveRole)
      ) {
        return res.status(403).json({
          message: "Insufficient permissions"
        });
      }

      req.tenant = tenant;
      req.membership = orgAdmin || tenantMembership;
      req.role = effectiveRole;

      next();
    } catch (error) {
      console.error("Tenant authorization error:", error);

      return res.status(500).json({
        message: "Internal server error"
      });
    }
  };
};

module.exports = tenantAccess;
