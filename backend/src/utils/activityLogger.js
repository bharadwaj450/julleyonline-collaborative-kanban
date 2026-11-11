
const prisma = require("../lib/prisma");

/**
 * Record an activity in PostgreSQL.
 *
 * Pass a Prisma transaction client when the log
 * must be saved together with a database change.
 */
async function logActivity({
  tenantId,
  userId,
  entityType,
  entityId,
  action,
  details = null,
  tx
}) {
  const db = tx || prisma;

  return db.activityLog.create({
    data: {
      tenantId,
      userId,
      entityType,
      entityId,
      action,
      ...(details !== null ? { details } : {})
    }
  });
}

module.exports = logActivity;
