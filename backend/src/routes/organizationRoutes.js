
const express = require("express");
const { z } = require("zod");

const prisma = require("../lib/prisma");
const authenticate = require("../middleware/authMiddleware");

const router = express.Router();

const organizationSchema = z.object({
  name: z.string().trim().min(2).max(100)
});

// POST /api/organizations
// Create an organization and make its creator ORG_ADMIN

router.post("/", authenticate, async (req, res) => {
  try {
    const result = organizationSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "Invalid organization details"
      });
    }

    const organization = await prisma.$transaction(async (tx) => {
      const newOrganization = await tx.organization.create({
        data: {
          name: result.data.name
        }
      });

      await tx.membership.create({
        data: {
          userId: req.user.id,
          organizationId: newOrganization.id,
          tenantId: null,
          role: "ORG_ADMIN"
        }
      });

      return newOrganization;
    });

    return res.status(201).json({
      message: "Organization created successfully",
      organization
    });

  } catch (error) {
    console.error("Organization creation error:", error);

    return res.status(500).json({
      message: "Internal server error"
    });
  }
});

// GET /api/organizations
// List organizations accessible to the logged-in user

router.get("/", authenticate, async (req, res) => {
  try {
    const memberships = await prisma.membership.findMany({
      where: {
        userId: req.user.id
      },
      select: {
        organization: {
          select: {
            id: true,
            name: true,
            createdAt: true
          }
        }
      }
    });

    const organizations = [
      ...new Map(
        memberships.map(({ organization }) => [
          organization.id,
          organization
        ])
      ).values()
    ];

    return res.status(200).json({
      organizations
    });

  } catch (error) {
    console.error("Organization listing error:", error);

    return res.status(500).json({
      message: "Internal server error"
    });
  }
});

module.exports = router;
