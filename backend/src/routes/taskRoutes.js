
const express = require("express");
const { z } = require("zod");

const prisma = require("../lib/prisma");
const authenticate = require("../middleware/authMiddleware");
const tenantAccess = require("../middleware/tenantAccess");
const logActivity = require("../utils/activityLogger");

const router = express.Router();

// ======================================
// VALIDATION SCHEMAS
// ======================================

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  columnId: z.uuid(),
  assignedToId: z.uuid().nullable().optional()
});

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  assignedToId: z.uuid().nullable().optional(),
  version: z.number().int().positive()
});

// ======================================
// HELPER FUNCTIONS
// ======================================

async function findBoard(boardId, tenantId) {
  return prisma.board.findFirst({
    where: {
      id: boardId,
      tenantId
    }
  });
}

async function findColumn(columnId, boardId, tenantId) {
  return prisma.boardColumn.findFirst({
    where: {
      id: columnId,
      boardId,
      tenantId
    }
  });
}

async function validAssignee(userId, tenantId, organizationId) {
  if (userId === null || userId === undefined) {
    return true;
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      organizationId,
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
    }
  });

  return Boolean(membership);
}

// ======================================
// CREATE TASK + ACTIVITY LOG + SOCKET.IO
// POST /api/tenants/:tenantId/boards/:boardId/tasks
// ======================================

router.post(
  "/:tenantId/boards/:boardId/tasks",
  authenticate,
  tenantAccess(),
  async (req, res) => {
    try {
      const parsed = createTaskSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid task details"
        });
      }

      const {
        title,
        description,
        columnId,
        assignedToId
      } = parsed.data;

      const board = await findBoard(
        req.params.boardId,
        req.tenant.id
      );

      if (!board) {
        return res.status(404).json({
          message: "Board not found"
        });
      }

      const column = await findColumn(
        columnId,
        board.id,
        req.tenant.id
      );

      if (!column) {
        return res.status(404).json({
          message: "Column not found in this board"
        });
      }

      const assigneeIsValid = await validAssignee(
        assignedToId,
        req.tenant.id,
        req.tenant.organizationId
      );

      if (!assigneeIsValid) {
        return res.status(400).json({
          message: "Assignee does not belong to this tenant"
        });
      }

      // Save the task and activity log atomically.
      const task = await prisma.$transaction(async (tx) => {
        const lastTask = await tx.task.findFirst({
          where: {
            tenantId: req.tenant.id,
            boardId: board.id,
            columnId
          },
          orderBy: {
            position: "desc"
          }
        });

        const newTask = await tx.task.create({
          data: {
            tenantId: req.tenant.id,
            boardId: board.id,
            columnId,
            title,
            description,
            assignedToId: assignedToId ?? null,
            position: lastTask
              ? lastTask.position + 1
              : 0
          }
        });

        await logActivity({
          tenantId: req.tenant.id,
          userId: req.user.id,
          entityType: "TASK",
          entityId: newTask.id,
          action: "CREATED",
          details: {
            title: newTask.title,
            boardId: newTask.boardId,
            columnId: newTask.columnId
          },
          tx
        });

        return newTask;
      });

      // ======================================
      // SOCKET.IO: TASK CREATED
      // ======================================
      // Emit only after the transaction commits.

      const io = req.app.get("io");

      io.to(`tenant:${req.tenant.id}`).emit("task:created", {
        tenantId: req.tenant.id,
        boardId: board.id,
        task
      });

      return res.status(201).json({
        message: "Task created successfully",
        task
      });

    } catch (error) {
      console.error("Create task error:", error);

      return res.status(500).json({
        message: "Internal server error"
      });
    }
  }
);

// ======================================
// GET ALL TASKS
// GET /api/tenants/:tenantId/boards/:boardId/tasks
// ======================================

router.get(
  "/:tenantId/boards/:boardId/tasks",
  authenticate,
  tenantAccess(),
  async (req, res) => {
    try {
      const board = await findBoard(
        req.params.boardId,
        req.tenant.id
      );

      if (!board) {
        return res.status(404).json({
          message: "Board not found"
        });
      }

      const tasks = await prisma.task.findMany({
        where: {
          tenantId: req.tenant.id,
          boardId: board.id
        },
        orderBy: [
          {
            position: "asc"
          },
          {
            createdAt: "asc"
          }
        ]
      });

      return res.status(200).json({
        tasks
      });

    } catch (error) {
      console.error("List tasks error:", error);

      return res.status(500).json({
        message: "Internal server error"
      });
    }
  }
);

// ======================================
// UPDATE TASK + ACTIVITY LOG + SOCKET.IO
// PATCH /api/tenants/:tenantId/boards/:boardId/tasks/:taskId
// ======================================

router.patch(
  "/:tenantId/boards/:boardId/tasks/:taskId",
  authenticate,
  tenantAccess(),
  async (req, res) => {
    try {
      const parsed = updateTaskSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid task update details"
        });
      }

      const { version, ...changes } = parsed.data;

      if (Object.keys(changes).length === 0) {
        return res.status(400).json({
          message: "No task changes provided"
        });
      }

      const task = await prisma.task.findFirst({
        where: {
          id: req.params.taskId,
          boardId: req.params.boardId,
          tenantId: req.tenant.id
        }
      });

      if (!task) {
        return res.status(404).json({
          message: "Task not found"
        });
      }

      // Validate the assignee if it is being changed.
      if ("assignedToId" in changes) {
        const assigneeIsValid = await validAssignee(
          changes.assignedToId,
          req.tenant.id,
          req.tenant.organizationId
        );

        if (!assigneeIsValid) {
          return res.status(400).json({
            message: "Assignee does not belong to this tenant"
          });
        }
      }

      // Update task and activity log atomically.
      const updatedTask = await prisma.$transaction(
        async (tx) => {
          const result = await tx.task.updateMany({
            where: {
              id: task.id,
              boardId: req.params.boardId,
              tenantId: req.tenant.id,
              version
            },
            data: {
              ...changes,
              version: {
                increment: 1
              }
            }
          });

          // A different user may have updated this task.
          if (result.count === 0) {
            return null;
          }

          const updated = await tx.task.findFirst({
            where: {
              id: task.id,
              boardId: req.params.boardId,
              tenantId: req.tenant.id
            }
          });

          await logActivity({
            tenantId: req.tenant.id,
            userId: req.user.id,
            entityType: "TASK",
            entityId: task.id,
            action: "UPDATED",
            details: {
              previousVersion: version,
              newVersion: updated.version,
              changes
            },
            tx
          });

          return updated;
        }
      );

      if (!updatedTask) {
        return res.status(409).json({
          message:
            "Task was modified by another user. Refresh and retry."
        });
      }

      // ======================================
      // SOCKET.IO: TASK UPDATED
      // ======================================
      // Broadcast only after a successful transaction.
      // No broadcast occurs for a 409 version conflict.

      const io = req.app.get("io");

      io.to(`tenant:${req.tenant.id}`).emit("task:updated", {
        tenantId: req.tenant.id,
        boardId: req.params.boardId,
        task: updatedTask
      });

      return res.status(200).json({
        message: "Task updated successfully",
        task: updatedTask
      });

    } catch (error) {
      console.error("Update task error:", error);

      return res.status(500).json({
        message: "Internal server error"
      });
    }
  }
);

// ======================================
// DELETE TASK + ACTIVITY LOG
// DELETE /api/tenants/:tenantId/boards/:boardId/tasks/:taskId
// ======================================

router.delete(
  "/:tenantId/boards/:boardId/tasks/:taskId",
  authenticate,
  tenantAccess(),
  async (req, res) => {
    try {
      const deletedTask = await prisma.$transaction(async (tx) => {
        const task = await tx.task.findFirst({
          where: {
            id: req.params.taskId,
            boardId: req.params.boardId,
            tenantId: req.tenant.id
          }
        });

        if (!task) {
          return null;
        }

        const result = await tx.task.deleteMany({
          where: {
            id: task.id,
            boardId: req.params.boardId,
            tenantId: req.tenant.id
          }
        });

        if (result.count === 0) {
          return null;
        }

        await logActivity({
          tenantId: req.tenant.id,
          userId: req.user.id,
          entityType: "TASK",
          entityId: task.id,
          action: "DELETED",
          details: {
            title: task.title,
            boardId: task.boardId,
            columnId: task.columnId
          },
          tx
        });

        return task;
      });

      if (!deletedTask) {
        return res.status(404).json({
          message: "Task not found"
        });
      }

    // Broadcast only after the deletion transaction succeeds.
const io = req.app.get("io");

io.to(`tenant:${req.tenant.id}`).emit("task:deleted", {
  tenantId: req.tenant.id,
  boardId: req.params.boardId,
  taskId: deletedTask.id
});

return res.status(200).json({
  message: "Task deleted successfully"
});

    } catch (error) {
      console.error("Delete task error:", error);

      return res.status(500).json({
        message: "Internal server error"
      });
    }
  }
);

module.exports = router;
