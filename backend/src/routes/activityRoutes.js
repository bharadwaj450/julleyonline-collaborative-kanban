
const express = require("express");
const { z } = require("zod");

const prisma = require("../lib/prisma");
const authenticate = require("../middleware/authMiddleware");
const tenantAccess = require("../middleware/tenantAccess");

const router = express.Router();

// GET /api/tenants/:tenantId/activities
router.get(
  "/:tenantId/activities",
  authenticate,
  tenantAccess(),
  async (req, res) => {
    try {
      const querySchema = z.object({
        limit: z.coerce.number().int().min(1).max(100).default(50)
      });

      const parsed = querySchema.safeParse(req.query);

      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid activity query parameters"
        });
      }

      const { limit } = parsed.data;

      // Only retrieve activities from the authorized tenant.
      const activities = await prisma.activityLog.findMany({
        where: {
          tenantId: req.tenant.id
        },
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" }
        ],
        take: limit,
        include: {
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
        activities,
        count: activities.length
      });

    } catch (error) {
      console.error("Get activities error:", error);

      return res.status(500).json({
        message: "Internal server error"
      });
    }
  }
);

module.exports = router;
