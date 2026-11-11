
require("dotenv").config();

const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const prisma = require("./src/lib/prisma");

const authRoutes = require("./src/routes/authRoutes");
const organizationRoutes = require("./src/routes/organizationRoutes");
const tenantRoutes = require("./src/routes/tenantRoutes");
const boardRoutes = require("./src/routes/boardRoutes");
const columnRoutes = require("./src/routes/columnRoutes");
const taskRoutes = require("./src/routes/taskRoutes");
const taskMoveRoutes = require("./src/routes/taskMoveRoutes");
const activityRoutes = require("./src/routes/activityRoutes");
const memberRoutes = require("./src/routes/memberRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// Create an HTTP server for Express and Socket.IO.
const httpServer = http.createServer(app);

// Configure Socket.IO.
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});
// Allow Express routes to access Socket.IO.
app.set("io", io);

// Express middleware.
app.use(
  cors({
    origin: "http://localhost:5173"
  })
);

app.use(express.json());

// Existing REST API routes.
app.use("/api/auth", authRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/boards", boardRoutes);
app.use("/api/tenants", columnRoutes);
app.use("/api/tenants", taskRoutes);
app.use("/api/tenants", taskMoveRoutes);
app.use("/api/tenants", activityRoutes);
app.use("/api/tenants", memberRoutes);

// Backend health check.
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "JulleyOnline Backend is running"
  });
});

// PostgreSQL health check.
app.get("/api/health/db", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: "success",
      message: "PostgreSQL connected successfully"
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    res.status(503).json({
      status: "error",
      message: "Database connection failed"
    });
  }
});

// Authenticate every Socket.IO connection.
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token || typeof token !== "string") {
      return next(new Error("Authentication token required"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"]
    });

    
if (!decoded || typeof decoded.userId !== "string") {
  return next(new Error("Invalid authentication token"));
}

const user = await prisma.user.findUnique({
  where: {
    id: decoded.userId
  },
  select: {
    id: true,
    name: true,
    email: true
  }
});

    if (!user) {
      return next(new Error("User not found"));
    }

    socket.user = user;

    next();
  } catch (error) {
    next(new Error("Invalid or expired authentication token"));
  }
});

// Handle authenticated Socket.IO connections.

 // ======================================
 // TENANT PRESENCE TRACKING
 // ======================================

 async function broadcastTenantPresence(tenantId) {
   const roomName = `tenant:${tenantId}`;

   // Find sockets currently connected to this tenant room.
   const sockets = await io.in(roomName).fetchSockets();

   // A user may have multiple browser tabs open.
   // Count each user only once.
   const onlineUsers = new Map();

   for (const connectedSocket of sockets) {
     const user = connectedSocket.user;

     if (user && !onlineUsers.has(user.id)) {
       onlineUsers.set(user.id, {
         id: user.id,
         name: user.name
       });
     }
   }

   io.to(roomName).emit("presence:updated", {
     tenantId,
     users: Array.from(onlineUsers.values()),
     count: onlineUsers.size
   });
 }


/*
 * Revoke a user's active Socket.IO access
 * after their workspace membership is removed.
 */
async function revokeTenantMemberSockets(tenantId, userId) {
  const roomName = `tenant:${tenantId}`;

  let removedConnections = 0;

  // Find all locally connected sockets for this user.
  for (const socket of io.sockets.sockets.values()) {
    if (
      socket.user?.id === userId &&
      socket.rooms.has(roomName)
    ) {
      // Remove only this tenant's access.
      await socket.leave(roomName);

      // Tell the frontend that access was revoked.
      socket.emit("tenant:access-revoked", {
        tenantId,
        message:
          "Your access to this workspace has been removed."
      });

      removedConnections++;
    }
  }

  // Update the online-user list.
  await broadcastTenantPresence(tenantId);

  console.log(
    `Revoked tenant ${tenantId} access for user ${userId}. ` +
    `Removed connections: ${removedConnections}`
  );

  return removedConnections;
}

// Make revocation available to Express routes.
app.set("revokeTenantMemberSockets", revokeTenantMemberSockets);

io.on("connection", (socket) => {
  console.log(
    `Socket connected: ${socket.id} | User: ${socket.user.id}`
  );

  // ======================================
  // JOIN TENANT ROOM
  // ======================================

  socket.on("tenant:join", async (data, callback) => {
    const reply = typeof callback === "function"
      ? callback
      : () => {};

    try {
      const tenantId = data?.tenantId;

      if (
        typeof tenantId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)
      ) {
        return reply({
          success: false,
          message: "Valid tenant ID is required"
        });
      }

      // Confirm the tenant exists.
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          organizationId: true
        }
      });

      if (!tenant) {
        return reply({
          success: false,
          message: "Tenant not found"
        });
      }

      // Check organization administrator membership.
      const orgAdmin = await prisma.membership.findFirst({
        where: {
          userId: socket.user.id,
          organizationId: tenant.organizationId,
          tenantId: null,
          role: "ORG_ADMIN"
        }
      });

      // Check tenant-specific membership.
      const tenantMember = await prisma.membership.findFirst({
        where: {
          userId: socket.user.id,
          organizationId: tenant.organizationId,
          tenantId,
          role: {
            in: ["TENANT_ADMIN", "MEMBER"]
          }
        }
      });

      if (!orgAdmin && !tenantMember) {
        return reply({
          success: false,
          message: "Access denied to this tenant"
        });
      }


      // Join the tenant room after initial authorization.
      const roomName = `tenant:${tenantId}`;

      await socket.join(roomName);

      // SECURITY: Recheck membership after joining.
      // A membership might have been deleted while
      // the initial authorization was running.
      const [currentOrgAdmin, currentTenantMember] =
        await Promise.all([
          prisma.membership.findFirst({
            where: {
              userId: socket.user.id,
              organizationId: tenant.organizationId,
              tenantId: null,
              role: "ORG_ADMIN"
            },
            select: { id: true }
          }),

          prisma.membership.findFirst({
            where: {
              userId: socket.user.id,
              organizationId: tenant.organizationId,
              tenantId,
              role: {
                in: ["TENANT_ADMIN", "MEMBER"]
              }
            },
            select: { id: true }
          })
        ]);

      // If membership was removed, leave immediately.
      if (!currentOrgAdmin && !currentTenantMember) {
        await socket.leave(roomName);

        await broadcastTenantPresence(tenantId);

        return reply({
          success: false,
          message: "Access denied to this tenant"
        });
      }

      console.log(
        `User ${socket.user.id} joined ${roomName}`
      );

      // Update the workspace's online-user list.
      await broadcastTenantPresence(tenantId);

      return reply({
        success: true,
        message: "Joined tenant room successfully",
        tenantId
      });


    } catch (error) {
      console.error("Tenant room join error:", error);

      return reply({
        success: false,
        message: "Unable to join tenant room"
      });
    }
  });

  // ======================================
  // LEAVE TENANT ROOM
  // ======================================

  socket.on("tenant:leave", async (data, callback) => {
    const reply = typeof callback === "function"
      ? callback
      : () => {};

    const tenantId = data?.tenantId;

    if (typeof tenantId !== "string") {
      return reply({
        success: false,
        message: "Tenant ID is required"
      });
    }

    const roomName = `tenant:${tenantId}`;

    await socket.leave(roomName);

    console.log(
      `User ${socket.user.id} left ${roomName}`
    );

    return reply({
      success: true,
      message: "Left tenant room successfully"
    });
  });

  // ======================================
  // DISCONNECT
  // ======================================
// ======================================
// DISCONNECT AND PRESENCE CLEANUP
// ======================================

// Capture tenant rooms before Socket.IO removes the socket.
socket.on("disconnecting", async () => {
  const tenantIds = Array.from(socket.rooms)
    .filter((room) => room.startsWith("tenant:"))
    .map((room) => room.slice("tenant:".length));

  // Wait until the disconnecting socket leaves its rooms.
  // This avoids including the disconnected user in the online list.
  setImmediate(async () => {
    for (const tenantId of tenantIds) {
      try {
        await broadcastTenantPresence(tenantId);
      } catch (error) {
        console.error("Presence cleanup error:", error);
      }
    }
  });
});

socket.on("disconnect", (reason) => {
  console.log(
    `Socket disconnected: ${socket.id} | Reason: ${reason}`
  );
});
});


// Start Express and Socket.IO on the same port.
httpServer.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log("Socket.IO server initialized");
});
