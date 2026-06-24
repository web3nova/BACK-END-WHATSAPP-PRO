// src/middleware/notFound.middleware.js

// 404 handler — runs when no route matches the request.
// Must be registered AFTER all routes but BEFORE the error middleware in app.js.
export const notFoundMiddleware = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

export default notFoundMiddleware;