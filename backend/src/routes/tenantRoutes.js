
const express = require("express");
const { z } = require("zod");

const prisma = require("../lib/prisma");
const authenticate = require("../middleware/authMiddleware");
const tenantAccess = require("../middleware/tenantAccess");

const router = express.Router();

const createTenantSchema = z.object({
  organizationId: z.uuid(),
  name: z.string().trim().min(2).max(100)
});

// Create tenant — organization admin only
router.post("/", authenticate, async (req, res) => {
  try {
    const result = createTenantSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "Invalid tenant details"
      });
    }

    const { organizationId, name } = result.data;

    const adminMembership = await prisma.membership.findFirst({
      where: {
        userId: req.user.id,
        organizationId,
        tenantId: null,
        role: "ORG_ADMIN"
      }
    });

    if (!adminMembership) {
      return res.status(403).json({
        message: "You do not have permission to create tenants"
      });
    }

    const tenant = await prisma.tenant.create({
      data: { organizationId, name },
      select: {
        id: true,
        organizationId: true,
        name: true,
        createdAt: true
      }
    });

    return res.status(201).json({
      message: "Tenant created successfully",
      tenant
    });
  } catch (error) {
    console.error("Tenant creation error:", error);

    return res.status(500).json({
      message: "Internal server error"
    });
  }
});

// List tenants accessible to the user
router.get("/", authenticate, async (req, res) => {
  try {
    const parsedId = z.uuid().safeParse(req.query.organizationId);

    if (!parsedId.success) {
      return res.status(400).json({
        message: "Valid organizationId is required"
      });
    }

    const organizationId = parsedId.data;

    const memberships = await prisma.membership.findMany({
      where: {
        userId: req.user.id,
        organizationId
      },
      select: {
        tenantId: true,
        role: true
      }
    });

    const isOrgAdmin = memberships.some(
      (membership) =>
        membership.role === "ORG_ADMIN" &&
        membership.tenantId === null
    );

    const tenantIds = memberships
      .map((membership) => membership.tenantId)
      .filter(Boolean);

    const tenants = await prisma.tenant.findMany({
      where: {
        organizationId,
        ...(isOrgAdmin ? {} : { id: { in: tenantIds } })
      },
      select: {
        id: true,
        organizationId: true,
        name: true,
        createdAt: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return res.status(200).json({ tenants });
  } catch (error) {
    console.error("Tenant listing error:", error);

    return res.status(500).json({
      message: "Internal server error"
    });
  }
});

// Check tenant access and role
router.get(
  "/:tenantId/access-check",
  authenticate,
  tenantAccess(),
  (req, res) => {
    return res.status(200).json({
      message: "Tenant access granted",
      tenant: req.tenant,
      role: req.role
    });
  }
);

module.exports = router;
