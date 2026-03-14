/**
 * Centralized error handling middleware.
 * Ensures consistent error response format across the API.
 */
const errorMiddleware = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Errore interno del server';
    
    // Log error details for debugging (avoid logging sensitive info in production if needed)
    console.error(`[Error] ${req.method} ${req.url}: ${message}`, {
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        userId: req.user?.userId
    });

    res.status(statusCode).json({
        error: message,
        status: statusCode,
        path: req.url,
        timestamp: new Date().toISOString()
    });
};

module.exports = errorMiddleware;
