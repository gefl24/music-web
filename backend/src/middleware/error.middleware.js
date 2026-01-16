// backend/src/middleware/error.middleware.js

// 404 处理中间件
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.status = 404;
  next(error);
};

// 错误处理中间件
const errorHandler = (err, req, res, next) => {
  // 日志记录
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // 确定状态码
  const statusCode = err.status || err.statusCode || 500;

  // 构建错误响应
  const errorResponse = {
    error: err.message || 'Internal Server Error',
    status: statusCode,
    timestamp: new Date().toISOString()
  };

  // 开发环境下返回堆栈信息
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.details = err.details || null;
  }

  res.status(statusCode).json(errorResponse);
};

// 异步路由错误捕获包装器
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 验证错误处理
const validationErrorHandler = (err, req, res, next) => {
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.details || err.message
    });
  }
  next(err);
};

module.exports = {
  notFoundHandler,
  errorHandler,
  asyncHandler,
  validationErrorHandler
};
