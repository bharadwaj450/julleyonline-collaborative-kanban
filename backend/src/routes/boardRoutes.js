
const express = require("express");
const { z } = require("zod");

const prisma = require("../lib/prisma");
const authenticate = require("../middleware/authMiddleware");
const tenantAccess = require("../middleware/tenantAccess");

const router = express.Router();

const createBoardSchema = z.object({
  tenantId: z.uuid(),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).optional()
});

const updateBoardSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(1000).nullable().optional()
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field is required" }
);

// Create a board — admins only
router.post(
  "/",
  authenticate,
  tenantAccess(["ORG_ADMIN", "TENANT_ADMIN"]),
  async (req, res) => {
    try {
      const result = createBoardSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          message: "Invalid board details"
        });
      }

      const board = await prisma.board.create({
        data: {
          tenantId: req.tenant.id,
          name: result.data.name,
          description: result.data.description,
          createdById: req.user.id
        }
      });

      return res.status(201).json({
        message: "Board created successfully",
        board
      });
    } catch (error) {
      console.error("Board creation error:", error);

      return res.status(500).json({
        message: "Internal server error"
      });
    }
  }
);

// List boards belonging to an authorized tenant
router.get(
  "/",
  authenticate,
  (req, res, next) => {
    req.params.tenantId = req.query.tenantId;
    next();
  },
  tenantAccess(),
  async (req, res) => {
    try {
      const boards = await prisma.board.findMany({
        where: {
          tenantId: req.tenant.id
        },
        orderBy: {
          createdAt: "asc"
        }
      });

      return res.status(200).json({ boards });
    } catch (error) {
      console.error("Board listing error:", error);

      return res.status(500).json({
        message: "Internal server error"
      });
    }
  }
);

// Update a board — admins only
router.patch(
  "/:boardId",
  authenticate,
  tenantAccess(["ORG_ADMIN", "TENANT_ADMIN"]),
  async (req, res) => {
    try {
      const result = updateBoardSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          message: "Invalid board details"
        });
      }

      const existingBoard = await prisma.board.findFirst({
        where: {
          id: req.params.boardId,
          tenantId: req.tenant.id
        }
      });

      if (!existingBoard) {
        return res.status(404).json({
          message: "Board not found"
        });
      }

      const board = await prisma.board.update({
        where: {
          id: existingBoard.id,
          tenantId: req.tenant.id
        },
        data: result.data
      });

      return res.status(200).json({
        message: "Board updated successfully",
        board
      });
    } catch (error) {
      console.error("Board update error:", error);

      return res.status(500).json({
        message: "Internal server error"
      });
    }
  }
);

// Delete a board — admins only
router.delete(
  "/:boardId",
  authenticate,
  tenantAccess(["ORG_ADMIN", "TENANT_ADMIN"]),
  async (req, res) => {
    try {
      const existingBoard = await prisma.board.findFirst({
        where: {
          id: req.params.boardId,
          tenantId: req.tenant.id
        }
      });

      if (!existingBoard) {
        return res.status(404).json({
          message: "Board not found"
        });
      }

      await prisma.board.delete({
        where: {
          id: existingBoard.id,
          tenantId: req.tenant.id
        }
      });

      return res.status(200).json({
        message: "Board deleted successfully"
      });
    } catch (error) {
      console.error("Board deletion error:", error);

      return res.status(500).json({
        message: "Internal server error"
      });
    }
  }
);

module.exports = router;
