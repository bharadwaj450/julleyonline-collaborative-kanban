
const express = require("express");
const { z } = require("zod");

const prisma = require("../lib/prisma");
const authenticate = require("../middleware/authMiddleware");
const tenantAccess = require("../middleware/tenantAccess");
const logActivity = require("../utils/activityLogger");

const router = express.Router();

const moveTaskSchema = z.object({
  targetColumnId: z.uuid(),
  targetPosition: z.number().int().min(0),
  version: z.number().int().positive()
});

// PATCH /api/tenants/:tenantId/boards/:boardId/tasks/:taskId/move

router.patch(
  "/:tenantId/boards/:boardId/tasks/:taskId/move",
  authenticate,
  tenantAccess(),
  async (req, res) => {
    const parsed = moveTaskSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid task movement details"
      });
    }

    const { targetColumnId, targetPosition, version } = parsed.data;
    const { boardId, taskId } = req.params;
    const tenantId = req.tenant.id;

    try {
      const movedTask = await prisma.$transaction(
        async (tx) => {
          // Serialize movements on the same board.
          await tx.$queryRaw`
            SELECT id
            FROM boards
            WHERE id = ${boardId}::uuid
              AND tenant_id = ${tenantId}::uuid
            FOR UPDATE
          `;

          const board = await tx.board.findFirst({
            where: { id: boardId, tenantId }
          });

          if (!board) {
            throw { status: 404, message: "Board not found" };
          }

          const task = await tx.task.findFirst({
            where: { id: taskId, boardId, tenantId }
          });

          if (!task) {
            throw { status: 404, message: "Task not found" };
          }

          if (task.version !== version) {
            throw {
              status: 409,
              message: "Task was modified. Refresh and retry."
            };
          }

          const targetColumn = await tx.boardColumn.findFirst({
            where: {
              id: targetColumnId,
              boardId,
              tenantId
            }
          });

          if (!targetColumn) {
            throw {
              status: 404,
              message: "Target column not found in this board"
            };
          }

          const sourceColumnId = task.columnId;
          const sourcePosition = task.position;
          const sameColumn = sourceColumnId === targetColumnId;

          // Get ordered tasks in the source column.
          const sourceTasks = await tx.task.findMany({
            where: {
              boardId,
              tenantId,
              columnId: sourceColumnId
            },
            orderBy: [
              { position: "asc" },
              { createdAt: "asc" },
              { id: "asc" }
            ]
          });

          const remainingSource = sourceTasks.filter(
            (item) => item.id !== taskId
          );

          let targetTasks;

          if (sameColumn) {
            targetTasks = remainingSource;
          } else {
            targetTasks = await tx.task.findMany({
              where: {
                boardId,
                tenantId,
                columnId: targetColumnId
              },
              orderBy: [
                { position: "asc" },
                { createdAt: "asc" },
                { id: "asc" }
              ]
            });
          }

          if (targetPosition > targetTasks.length) {
            throw {
              status: 400,
              message: "Target position is out of range"
            };
          }

          targetTasks.splice(targetPosition, 0, task);

          // Reorder tasks remaining in the source column.
          if (!sameColumn) {
            for (let i = 0; i < remainingSource.length; i++) {
              const item = remainingSource[i];

              if (item.position !== i) {
                await tx.task.update({
                  where: { id: item.id },
                  data: {
                    position: i,
                    version: { increment: 1 }
                  }
                });
              }
            }
          }

          // Reorder tasks in the destination column.
          for (let i = 0; i < targetTasks.length; i++) {
            const item = targetTasks[i];

            if (item.id === taskId) {
              continue;
            }

            if (item.position !== i) {
              await tx.task.update({
                where: { id: item.id },
                data: {
                  position: i,
                  version: { increment: 1 }
                }
              });
            }
          }

          // Move the selected task.
          const updatedTask = await tx.task.update({
            where: { id: taskId },
            data: {
              columnId: targetColumnId,
              position: targetPosition,
              version: { increment: 1 }
            }
          });

          // Log the movement in the same transaction.
          await logActivity({
            tenantId,
            userId: req.user.id,
            entityType: "TASK",
            entityId: taskId,
            action: "MOVED",
            details: {
              boardId,
              title: task.title,
              fromColumnId: sourceColumnId,
              toColumnId: targetColumnId,
              fromPosition: sourcePosition,
              toPosition: targetPosition,
              previousVersion: version,
              newVersion: updatedTask.version
            },
            tx
          });

          return updatedTask;
        },
        {
          isolationLevel: "Serializable",
          maxWait: 5000,
          timeout: 10000
        }
      );

     // ======================================
// SOCKET.IO: TASK MOVED
// ======================================
// Broadcast only after the transaction commits successfully.

const io = req.app.get("io");

io.to(`tenant:${tenantId}`).emit("task:moved", {
  tenantId,
  boardId,
  task: movedTask
});

return res.status(200).json({
  message: "Task moved successfully",
  task: movedTask
});

    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({
          message: error.message
        });
      }

      if (error.code === "P2034") {
        return res.status(409).json({
          message: "Concurrent movement detected. Refresh and retry."
        });
      }

      console.error("Move task error:", error);

      return res.status(500).json({
        message: "Internal server error"
      });
    }
  }
);

module.exports = router;
