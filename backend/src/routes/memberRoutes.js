
const express = require("express");

const prisma = require("../lib/prisma");
const authenticate = require("../middleware/authMiddleware");
const tenantAccess = require("../middleware/tenantAccess");

const router = express.Router();

// ======================================
// GET WORKSPACE MEMBERS
// GET /api/tenants/:tenantId/members
// ======================================

router.get(
  "/:tenantId/members",
  authenticate,
  tenantAccess(["ORG_ADMIN", "TENANT_ADMIN"]),
  async (req, res) => {
    try {
      const { tenantId } = req.params;

      // Get tenant members and organization administrators.
      const memberships = await prisma.membership.findMany({
        where: {
          organizationId: req.tenant.organizationId,
          OR: [
            {
              tenantId,
              role: {
                in: ["TENANT_ADMIN", "MEMBER"]
              }
            },
            {
              tenantId: null,
              role: "ORG_ADMIN"
            }
          ]
        },
        select: {
          id: true,
          userId: true,
          tenantId: true,
          role: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      });

      return res.status(200).json({
        tenantId,
        count: memberships.length,
        members: memberships
      });

    } catch (error) {
      console.error("Fetch members error:", error);

      return res.status(500).json({
        message: "Failed to fetch workspace members"
      });
    }
  }
);

/* ======================================
   ADD WORKSPACE MEMBER
   POST /api/tenants/:tenantId/members
====================================== */

router.post(
  "/:tenantId/members",
  authenticate,
  tenantAccess(["ORG_ADMIN", "TENANT_ADMIN"]),
  async (req, res) => {
    try {
      const { tenantId } = req.params;
      const { email, role = "MEMBER" } = req.body || {};

      // Validate email.
      if (
        typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ) {
        return res.status(400).json({
          message: "A valid user email is required"
        });
      }

      // Validate the requested tenant-level role.
      if (
        role !== "MEMBER" &&
        role !== "TENANT_ADMIN"
      ) {
        return res.status(400).json({
          message: "Invalid workspace role"
        });
      }

      // Only organization administrators can assign
      // the TENANT_ADMIN role.
      if (
        role === "TENANT_ADMIN" &&
        req.role !== "ORG_ADMIN"
      ) {
        return res.status(403).json({
          message:
            "Only organization administrators can assign tenant admins"
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Only existing registered users may be added.
      const user = await prisma.user.findUnique({
        where: {
          email: normalizedEmail
        },
        select: {
          id: true,
          name: true,
          email: true
        }
      });

      if (!user) {
        return res.status(404).json({
          message:
            "User not found. Ask the user to register first."
        });
      }

      const organizationId = req.tenant.organizationId;

      // Organization administrators already have
      // access to every tenant in their organization.
      const existingOrgAdmin = await prisma.membership.findFirst({
        where: {
          userId: user.id,
          organizationId,
          tenantId: null,
          role: "ORG_ADMIN"
        }
      });

      if (existingOrgAdmin) {
        return res.status(409).json({
          message:
            "This user is already an organization administrator."
        });
      }

      // Do not create a second membership
      // for the same user in the same workspace.
      const existingMembership = await prisma.membership.findFirst({
        where: {
          userId: user.id,
          organizationId,
          tenantId
        }
      });

      if (existingMembership) {
        return res.status(409).json({
          message:
            "This user already belongs to this workspace."
        });
      }

      // Create the tenant membership.
      const membership = await prisma.membership.create({
        data: {
          userId: user.id,
          organizationId,
          tenantId,
          role
        },
        select: {
          id: true,
          userId: true,
          tenantId: true,
          role: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      return res.status(201).json({
        message: "Member added successfully",
        member: membership
      });

    } catch (error) {
      console.error("Add member error:", error);

      return res.status(500).json({
        message: "Failed to add workspace member"
      });
    }
  }
);

/* ======================================
   UPDATE WORKSPACE MEMBER ROLE
   PATCH /api/tenants/:tenantId/members/:membershipId
====================================== */

router.patch(
  "/:tenantId/members/:membershipId",
  authenticate,
  tenantAccess(["ORG_ADMIN"]),
  async (req, res) => {
    try {
      const { tenantId, membershipId } = req.params;
      const { role } = req.body || {};

      if (!["MEMBER", "TENANT_ADMIN"].includes(role)) {
        return res.status(400).json({
          message: "Role must be MEMBER or TENANT_ADMIN"
        });
      }

      const membership = await prisma.membership.findFirst({
        where: {
          id: membershipId,
          tenantId,
          organizationId: req.tenant.organizationId,
          role: {
            in: ["MEMBER", "TENANT_ADMIN"]
          }
        }
      });

      if (!membership) {
        return res.status(404).json({
          message: "Workspace membership not found"
        });
      }

      if (membership.userId === req.user.id) {
        return res.status(403).json({
          message: "You cannot change your own role"
        });
      }

      const updatedMembership = await prisma.membership.update({
        where: {
          id: membership.id
        },
        data: {
          role
        },
        select: {
          id: true,
          userId: true,
          tenantId: true,
          role: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      return res.status(200).json({
        message: "Member role updated successfully",
        member: updatedMembership
      });
    } catch (error) {
      console.error("Update member role error:", error);

      return res.status(500).json({
        message: "Failed to update member role"
      });
    }
  }
);

/* ======================================
   REMOVE WORKSPACE MEMBER
   DELETE /api/tenants/:tenantId/members/:membershipId
====================================== */

router.delete(
  "/:tenantId/members/:membershipId",
  authenticate,
  tenantAccess(["ORG_ADMIN", "TENANT_ADMIN"]),
  async (req, res) => {
    try {
      const { tenantId, membershipId } = req.params;

      // Only find memberships belonging to this tenant.
      // Organization-wide administrator memberships
      // cannot be removed through this endpoint.
      const membership = await prisma.membership.findFirst({
        where: {
          id: membershipId,
          tenantId,
          organizationId: req.tenant.organizationId,
          role: {
            in: ["MEMBER", "TENANT_ADMIN"]
          }
        },
        select: {
          id: true,
          userId: true,
          role: true
        }
      });

      if (!membership) {
        return res.status(404).json({
          message: "Workspace membership not found"
        });
      }

      // Prevent administrators from removing themselves.
      if (membership.userId === req.user.id) {
        return res.status(403).json({
          message: "You cannot remove your own membership"
        });
      }

      // Tenant admins can remove members only.
      // Only org admins can remove tenant admins.
      if (
        membership.role === "TENANT_ADMIN" &&
        req.role !== "ORG_ADMIN"
      ) {
        return res.status(403).json({
          message:
            "Only organization administrators can remove tenant admins"
        });
      }


      // Remove the user's workspace membership.
      await prisma.membership.delete({
        where: {
          id: membership.id
        }
      });

      // Revoke this user's existing real-time workspace access.
      // The helper is registered in server.js.
      const revokeTenantMemberSockets = req.app.get(
        "revokeTenantMemberSockets"
      );

      let socketsRevoked = 0;

      if (typeof revokeTenantMemberSockets === "function") {
        try {
          socketsRevoked = await revokeTenantMemberSockets(
            tenantId,
            membership.userId
          );
        } catch (socketError) {
          console.error(
            "Socket access revocation failed:",
            socketError
          );
        }
      } else {
        console.error(
          "Socket revocation helper is not registered"
        );
      }

      return res.status(200).json({
        message: "Member removed successfully",
        socketsRevoked
      });


    } catch (error) {
      console.error("Remove member error:", error);

      return res.status(500).json({
        message: "Failed to remove workspace member"
      });
    }
  }
);

module.exports = router;
