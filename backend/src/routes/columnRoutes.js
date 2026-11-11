
const express = require("express");
const { z } = require("zod");

const prisma = require("../lib/prisma");
const authenticate = require("../middleware/authMiddleware");
const tenantAccess = require("../middleware/tenantAccess");

const router = express.Router();

const createColumnSchema = z.object({
  name: z.string().trim().min(1).max(100)
});

const updateColumnSchema = z.object({
  name: z.string().trim().min(1).max(100)
});

// Verify the board belongs to the authorized tenant.
async function findTenantBoard(boardId, tenantId) {
  return prisma.board.findFirst({
    where: {
      id: boardId,
      tenantId
    }
  });
}

// POST /api/tenants/:tenantId/boards/:boardId/columns
router.post(
  "/:tenantId/boards/:boardId/columns",
  authenticate,
  tenantAccess(["ORG_ADMIN", "TENANT_ADMIN"]),
  async (req, res) => {
    try {
      const parsed = createColumnSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid column name"
        });
      }

      const board = await findTenantBoard(
        req.params.boardId,
        req.tenant.id
      );

      if (!board) {
        return res.status(404).json({
          message: "Board not found in this tenant"
        });
      }

      const column = await prisma.$transaction(async (tx) => {
        const lastColumn = await tx.boardColumn.findFirst({
          where: {
            boardId: board.id,
            tenantId: req.tenant.id
          },
          orderBy: {
            position: "desc"
          }
        });

        return tx.boardColumn.create({
          data: {
            boardId: board.id,
            tenantId: req.tenant.id,
            name: parsed.data.name,
            position: lastColumn ? lastColumn.position + 1 : 0
          }
        });
      });

      return res.status(201).json({
        message: "Column created successfully",
        column
      });
    } catch (error) {
      console.error("Create column error:", error);
      return res.status(500).json({
        message: "Internal server error"
      });
    }
  }
);

// GET /api/tenants/:tenantId/boards/:boardId/columns
router.get(
  "/:tenantId/boards/:boardId/columns",
  authenticate,
  tenantAccess(),
  async (req, res) => {
    try {
      const board = await findTenantBoard(
        req.params.boardId,
        req.tenant.id
      );

      if (!board) {
        return res.status(404).json({
          message: "Board not found in this tenant"
        });
      }

      const columns = await prisma.boardColumn.findMany({
        where: {
          boardId: board.id,
          tenantId: req.tenant.id
        },
        orderBy: {
          position: "asc"
        }
      });

      return res.status(200).json({ columns });
    } catch (error) {
      console.error("List columns error:", error);
      return res.status(500).json({
        message: "Internal server error"
      });
    }
  }
);

// PATCH /api/tenants/:tenantId/boards/:boardId/columns/:columnId
router.patch(
  "/:tenantId/boards/:boardId/columns/:columnId",
  authenticate,
  tenantAccess(["ORG_ADMIN", "TENANT_ADMIN"]),
  async (req, res) => {
    try {
      const parsed = updateColumnSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid column name"
        });
      }

      const column = await prisma.boardColumn.findFirst({
        where: {
          id: req.params.columnId,
          boardId: req.params.boardId,
          tenantId: req.tenant.id
        }
      });

      if (!column) {
        return res.status(404).json({
          message: "Column not found"
        });
      }

      const updated = await prisma.boardColumn.update({
        where: {
          id: column.id
        },
        data: {
          name: parsed.data.name
        }
      });

      return res.status(200).json({
        message: "Column updated successfully",
        column: updated
      });
    } catch (error) {
      console.error("Update column error:", error);
      return res.status(500).json({
        message: "Internal server error"
      });
    }
  }
);

// DELETE /api/tenants/:tenantId/boards/:boardId/columns/:columnId
router.delete(
  "/:tenantId/boards/:boardId/columns/:columnId",
  authenticate,
  tenantAccess(["ORG_ADMIN", "TENANT_ADMIN"]),
  async (req, res) => {
    try {
      const column = await prisma.boardColumn.findFirst({
        where: {
          id: req.params.columnId,
          boardId: req.params.boardId,
          tenantId: req.tenant.id
        }
      });

      if (!column) {
        return res.status(404).json({
          message: "Column not found"
        });
      }

      const taskCount = await prisma.task.count({
        where: {
          columnId: column.id,
          tenantId: req.tenant.id
        }
      });

      if (taskCount > 0) {
        return res.status(409).json({
          message: "Move or delete tasks before deleting this column"
        });
      }

      await prisma.boardColumn.delete({
        where: {
          id: column.id
        }
      });

      return res.status(200).json({
        message: "Column deleted successfully"
      });
    } catch (error) {
      console.error("Delete column error:", error);
      return res.status(500).json({
        message: "Internal server error"
      });
    }
  }
);

module.exports = router;
